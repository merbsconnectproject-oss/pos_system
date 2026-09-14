package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.MovementRequest;
import gh.giftedlabs.pos.dto.StockView;
import gh.giftedlabs.pos.entity.InventoryMovement;
import gh.giftedlabs.pos.entity.StockLevel;
import gh.giftedlabs.pos.exception.ApprovalRequiredException;
import gh.giftedlabs.pos.exception.InsufficientStockException;
import gh.giftedlabs.pos.exception.ProductNotFoundException;
import gh.giftedlabs.pos.repository.InventoryMovementRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.ProductRepository;
import gh.giftedlabs.pos.repository.StockLevelRepository;
import gh.giftedlabs.pos.rules.Costing;
import gh.giftedlabs.pos.rules.Money;
import gh.giftedlabs.pos.rules.MovementType;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Quantity;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.SettingsService;
import gh.giftedlabs.pos.service.UserService;
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
    private final OutletRepository outlets;
    private final SettingsService settings;
    private final UserService staff;
    private final AuditService audit;
    private final Clock clock;

    public InventoryServiceImpl(StockLevelRepository levels, InventoryMovementRepository movements,
                                ProductRepository products, OutletRepository outlets,
                                SettingsService settings, UserService staff,
                                AuditService audit, Clock clock) {
        this.levels = levels;
        this.movements = movements;
        this.products = products;
        this.outlets = outlets;
        this.settings = settings;
        this.staff = staff;
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
                .orElseGet(() -> levels.save(newLevel(request.productId(), request.outletId())));

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

        // FR-INV-06 · FR-SET-06: past the configured value, a correction needs
        // an approver. Checked after the level is locked because the value is
        // worked out from the cost this outlet actually carries, and before
        // anything is written so a refused adjustment leaves no trace of stock
        // having moved.
        requireApprovalIfLarge(request, magnitude, level, actor);

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

    /**
     * FR-INV-06: an adjustment worth more than the threshold needs approval.
     *
     * <p>Valued at what this branch paid — the weighted average — because the
     * question the threshold asks is how much the business is writing off, and
     * retail would inflate that by the margin it never earned.
     *
     * <p>Someone who holds {@code stock.approve_adjustment} approves their own:
     * requiring a second person there would mean the only people allowed to
     * approve are the only people who cannot act.
     */
    private void requireApprovalIfLarge(MovementRequest request, BigDecimal magnitude,
                                        StockLevel level, PosPrincipal actor) {
        if (!request.type().isAdjustment()) return;

        long threshold = settings.adjustmentApprovalThreshold();
        BigDecimal value = magnitude.multiply(level.getAverageCost());
        if (value.movePointRight(2).compareTo(BigDecimal.valueOf(threshold)) <= 0) return;

        if (staff.holdsPermission(actor.userId(), Permission.STOCK_APPROVE_ADJUSTMENT)) return;
        if (staff.holdsPermission(request.approvedBy(), Permission.STOCK_APPROVE_ADJUSTMENT)) return;

        throw ApprovalRequiredException.adjustment(value, threshold);
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
                .orElseGet(() -> levels.save(newLevel(productId, outletId)));
    }

    /**
     * FR-SET-02: a product new to this branch starts at the branch's default
     * reorder level.
     *
     * <p>Applied when the row is created and not afterwards. Raising the branch
     * default is a decision about products nobody has set a level for yet; it
     * is not an instruction to overwrite the levels somebody chose by hand.
     */
    private StockLevel newLevel(UUID productId, UUID outletId) {
        StockLevel level = new StockLevel(productId, outletId);
        outlets.findById(outletId)
                .map(outlet -> outlet.getDefaultReorderLevel())
                .filter(value -> value != null && value.signum() > 0)
                .ifPresent(level::setReorderLevel);
        return level;
    }

    private StockView view(StockLevel level) {
        return new StockView(level.getProductId(), level.getOutletId(), level.getQuantity(),
                level.getAverageCost(), level.getReorderLevel(), level.isLow());
    }
}
