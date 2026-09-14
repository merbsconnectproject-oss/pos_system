package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.MovementRequest;
import gh.giftedlabs.pos.dto.StockView;
import gh.giftedlabs.pos.entity.InventoryMovement;
import gh.giftedlabs.pos.entity.StockLevel;
import gh.giftedlabs.pos.exception.InsufficientStockException;
import gh.giftedlabs.pos.exception.ProductNotFoundException;
import gh.giftedlabs.pos.repository.InventoryMovementRepository;
import gh.giftedlabs.pos.repository.ProductRepository;
import gh.giftedlabs.pos.repository.StockLevelRepository;
import gh.giftedlabs.pos.rules.Costing;
import gh.giftedlabs.pos.rules.Money;
import gh.giftedlabs.pos.rules.MovementType;
import gh.giftedlabs.pos.rules.Quantity;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.InventoryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Stock — BR-1, BR-2, BR-4, BR-8, BR-9, FR-INV.
 *
 * <p>Every path through this class does the same two things in the same order
 * and in one transaction: write the movement, then move the level. They are
 * never separable — BR-2 is that the level always equals the sum of its
 * movements, and a code path that updated one without the other is the only way
 * that can stop being true.
 */
@Service
public class InventoryServiceImpl implements InventoryService {

    private final StockLevelRepository levels;
    private final InventoryMovementRepository movements;
    private final ProductRepository products;
    private final AuditService audit;
    private final Clock clock;

    public InventoryServiceImpl(StockLevelRepository levels, InventoryMovementRepository movements,
                                ProductRepository products, AuditService audit, Clock clock) {
        this.levels = levels;
        this.movements = movements;
        this.products = products;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * Record a stock change — FR-INV-02, FR-INV-03.
     *
     * <p>The caller names a type and a magnitude; the sign is the type's, so no
     * caller can turn a DAMAGE into an increase by passing a negative number.
     */
    @Override
    @Transactional
    public StockView record(MovementRequest request, PosPrincipal actor, boolean mayOversell, String clientIp) {
        if (!products.existsById(request.productId())) {
            throw new ProductNotFoundException(request.productId());
        }

        // BR-7: a retried submission must not move stock twice. The unique index
        // is the real guard; this is the readable answer when it is hit.
        if (request.sourceId() != null && movements.existsBySourceTypeAndSourceIdAndProductIdAndType(
                request.sourceType(), request.sourceId(), request.productId(), request.type())) {
            return view(level(request.productId(), request.outletId()));
        }

        BigDecimal magnitude = request.quantity().abs();
        BigDecimal delta = request.type().increases() ? magnitude : magnitude.negate();

        // BR-8: lock before reading the quantity, or two terminals both see the
        // last unit and both sell it.
        StockLevel level = levels.lockByProductAndOutlet(request.productId(), request.outletId())
                .orElseGet(() -> levels.save(new StockLevel(request.productId(), request.outletId())));

        BigDecimal resulting = level.getQuantity().add(delta);

        // BR-9: negative stock is blocked unless the caller holds stock.oversell,
        // and an oversell is flagged rather than hidden.
        boolean oversell = resulting.signum() < 0;
        if (oversell && !mayOversell) {
            throw new InsufficientStockException(request.productId(), level.getQuantity(), magnitude);
        }

        // BR-4: only a receipt moves the average. Selling does not make what is
        // left cheaper, and an adjustment corrects a count, not a valuation.
        BigDecimal newAverage = null;
        if (request.type().affectsAverageCost() && request.unitCost() != null) {
            newAverage = Costing.weightedAverageCost(
                    Quantity.of(level.getQuantity().max(BigDecimal.ZERO)),
                    Money.ofMajor(level.getAverageCost()),
                    Quantity.of(magnitude),
                    Money.ofMajor(request.unitCost())).toMajor();
        }

        movements.save(new InventoryMovement(
                request.productId(), request.outletId(), request.type(), delta,
                request.unitCost(), request.reason(), request.note(),
                request.sourceType(), request.sourceId(), oversell,
                actor.userId(), clock.instant()));

        level.apply(delta, newAverage, clock.instant());

        audit.record(actor.userId(), "STOCK_" + request.type().name(), "product", request.productId(),
                Map.of("quantity", level.getQuantity().subtract(delta)),
                Map.of("quantity", level.getQuantity(), "delta", delta,
                        "reason", request.reason() == null ? "" : request.reason(),
                        "oversell", oversell),
                request.outletId(), null, clientIp);

        return view(level);
    }

    @Override
    @Transactional(readOnly = true)
    public StockView at(UUID productId, UUID outletId) {
        return levels.findByProductIdAndOutletId(productId, outletId)
                .map(this::view)
                .orElseGet(() -> StockView.empty(productId, outletId));
    }

    /** FR-INV-01: every outlet's figure for one product, never a global total. */
    @Override
    @Transactional(readOnly = true)
    public List<StockView> acrossOutlets(UUID productId) {
        return levels.findAllByProductId(productId).stream().map(this::view).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<StockView> atOutlet(UUID outletId) {
        return levels.findAllByOutletId(outletId).stream().map(this::view).toList();
    }

    /** FR-INV-08. */
    @Override
    @Transactional(readOnly = true)
    public List<StockView> lowAt(UUID outletId) {
        return levels.findLowAt(outletId).stream().map(this::view).toList();
    }

    @Override
    @Transactional
    public StockView setReorderLevel(UUID productId, UUID outletId, BigDecimal reorderLevel,
                                     PosPrincipal actor, String clientIp) {
        StockLevel level = level(productId, outletId);
        BigDecimal before = level.getReorderLevel();
        level.setReorderLevel(reorderLevel);

        audit.record(actor.userId(), "STOCK_REORDER_LEVEL_SET", "product", productId,
                Map.of("reorderLevel", before), Map.of("reorderLevel", reorderLevel),
                outletId, null, clientIp);
        return view(level);
    }

    /**
     * FR-INV acceptance · BR-2 · NFR-17: the level equals the sum of its
     * movements, or it does not and we want to know which.
     */
    @Override
    @Transactional(readOnly = true)
    public BigDecimal drift(UUID productId, UUID outletId) {
        BigDecimal ledger = levels.sumMovements(productId, outletId);
        BigDecimal recorded = levels.findByProductIdAndOutletId(productId, outletId)
                .map(StockLevel::getQuantity).orElse(BigDecimal.ZERO);
        return recorded.subtract(ledger);
    }

    private StockLevel level(UUID productId, UUID outletId) {
        return levels.findByProductIdAndOutletId(productId, outletId)
                .orElseGet(() -> levels.save(new StockLevel(productId, outletId)));
    }

    private StockView view(StockLevel level) {
        return new StockView(level.getProductId(), level.getOutletId(), level.getQuantity(),
                level.getAverageCost(), level.getReorderLevel(), level.isLow());
    }
}
