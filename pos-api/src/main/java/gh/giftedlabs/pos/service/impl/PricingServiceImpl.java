package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.OutletPriceRequest;
import gh.giftedlabs.pos.dto.OutletPriceView;
import gh.giftedlabs.pos.dto.PriceHistoryView;
import gh.giftedlabs.pos.entity.Product;
import gh.giftedlabs.pos.entity.ProductOutletPrice;
import gh.giftedlabs.pos.exception.ProductNotFoundException;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.ProductOutletPriceRepository;
import gh.giftedlabs.pos.repository.ProductPriceHistoryRepository;
import gh.giftedlabs.pos.repository.ProductRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Pricing;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.PricingService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.*;

/** FR-PRICE-03 · FR-PRICE-06. */
@Service
public class PricingServiceImpl implements PricingService {

    private final ProductRepository products;
    private final OutletRepository outlets;
    private final ProductOutletPriceRepository overrides;
    private final ProductPriceHistoryRepository history;
    private final UserRepository users;
    private final AuditService audit;
    private final Clock clock;

    public PricingServiceImpl(ProductRepository products, OutletRepository outlets,
                              ProductOutletPriceRepository overrides,
                              ProductPriceHistoryRepository history, UserRepository users,
                              AuditService audit, Clock clock) {
        this.products = products;
        this.outlets = outlets;
        this.overrides = overrides;
        this.history = history;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public List<OutletPriceView> overridesFor(UUID productId) {
        return overrides.findByProductId(productId).stream().map(OutletPriceView::of).toList();
    }

    /** FR-PRICE-03 · FR-PRICE-06: a branch price is a price change, so it is audited. */
    @Override
    @Transactional
    public OutletPriceView setOverride(UUID productId, UUID outletId, OutletPriceRequest request,
                                       PosPrincipal actor, String clientIp) {
        Product product = product(productId);
        requireOutlet(outletId);

        if (request.clearsEverything()) {
            clearOverride(productId, outletId, actor, clientIp);
            return new OutletPriceView(outletId, null, null, null, clock.instant());
        }

        ProductOutletPrice row = overrides.findByProductIdAndOutletId(productId, outletId)
                .orElseGet(() -> new ProductOutletPrice(productId, outletId));
        Map<String, Object> before = snapshot(row);

        // BR-10 holds per branch as well as per product: a floor above the
        // price it guards is not a floor, it is a rule nobody can satisfy.
        BigDecimal retail = request.retailPrice() == null ? product.getRetailPrice() : request.retailPrice();
        BigDecimal floor = request.floorPrice() == null ? product.getFloorPrice() : request.floorPrice();
        if (floor.compareTo(retail) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This branch's floor price is above its retail price");
        }

        row.set(request.retailPrice(), request.tradePrice(), request.floorPrice(),
                actor.userId(), clock.instant());
        ProductOutletPrice saved = overrides.save(row);

        audit.record(actor.userId(), "PRICE_OUTLET_OVERRIDE_SET", "product", productId,
                before, snapshot(saved), outletId, null, clientIp);

        return OutletPriceView.of(saved);
    }

    @Override
    @Transactional
    public void clearOverride(UUID productId, UUID outletId, PosPrincipal actor, String clientIp) {
        overrides.findByProductIdAndOutletId(productId, outletId).ifPresent(row -> {
            Map<String, Object> before = snapshot(row);
            overrides.delete(row);
            // Back to the shared price is a price change like any other, and
            // the entry is the only record that this branch ever differed.
            audit.record(actor.userId(), "PRICE_OUTLET_OVERRIDE_CLEARED", "product", productId,
                    before, Map.of("override", "cleared"), outletId, null, clientIp);
        });
    }

    @Override
    @Transactional(readOnly = true)
    public Pricing.Effective effective(UUID productId, UUID outletId) {
        Product product = product(productId);
        return overrides.findByProductIdAndOutletId(productId, outletId)
                .map(row -> Pricing.effective(product.getRetailPrice(), product.getTradePrice(),
                        product.getFloorPrice(), row.getRetailPrice(), row.getTradePrice(),
                        row.getFloorPrice()))
                .orElseGet(() -> Pricing.effective(product.getRetailPrice(), product.getTradePrice(),
                        product.getFloorPrice(), null, null, null));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, Pricing.Effective> effectiveAt(UUID outletId) {
        Map<UUID, ProductOutletPrice> byProduct = new HashMap<>();
        if (outletId != null) {
            overrides.findByOutletId(outletId).forEach(row -> byProduct.put(row.getProductId(), row));
        }

        Map<UUID, Pricing.Effective> resolved = new LinkedHashMap<>();
        for (Product product : products.findAll()) {
            ProductOutletPrice row = byProduct.get(product.getId());
            resolved.put(product.getId(), Pricing.effective(
                    product.getRetailPrice(), product.getTradePrice(), product.getFloorPrice(),
                    row == null ? null : row.getRetailPrice(),
                    row == null ? null : row.getTradePrice(),
                    row == null ? null : row.getFloorPrice()));
        }
        return resolved;
    }

    /** FR-PRICE-06. */
    @Override
    @Transactional(readOnly = true)
    public List<PriceHistoryView> history(UUID productId) {
        product(productId);
        return history.findAllByProductIdOrderByChangedAtDesc(productId).stream()
                .map(row -> new PriceHistoryView(
                        row.getId(), row.getRetailPrice(), row.getTradePrice(), row.getFloorPrice(),
                        nameOf(row.getChangedBy()), row.getChangedAt()))
                .toList();
    }

    // --- internals ---------------------------------------------------------

    private Product product(UUID productId) {
        return products.findById(productId).orElseThrow(() -> new ProductNotFoundException(productId));
    }

    private void requireOutlet(UUID outletId) {
        if (!outlets.existsById(outletId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such branch");
        }
    }

    /** A deactivated user still set the price they set — FR-USER-07. */
    private String nameOf(UUID userId) {
        if (userId == null) return null;
        return users.findById(userId).map(user -> user.getFullName()).orElse("(removed)");
    }

    private Map<String, Object> snapshot(ProductOutletPrice row) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("retailPrice", row.getRetailPrice());
        state.put("tradePrice", row.getTradePrice());
        state.put("floorPrice", row.getFloorPrice());
        return state;
    }
}
