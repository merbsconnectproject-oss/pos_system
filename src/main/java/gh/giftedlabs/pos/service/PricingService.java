package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.OutletPriceRequest;
import gh.giftedlabs.pos.dto.OutletPriceView;
import gh.giftedlabs.pos.dto.PriceHistoryView;
import gh.giftedlabs.pos.rules.Pricing;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Per-branch prices and price history — FR-PRICE-03, FR-PRICE-06.
 *
 * <p>Separate from {@code ProductService} because a price is not a property of
 * a product here: it is a property of a product <em>at a branch</em>, and the
 * two are edited by different people with different rights.
 */
public interface PricingService {

    /** FR-PRICE-03: every branch override for one product, for the edit screen. */
    List<OutletPriceView> overridesFor(UUID productId);

    /**
     * Set or clear this branch's prices.
     *
     * <p>Clearing every level removes the override rather than storing a row
     * that overrides nothing — "back to the shared price" should leave no trace
     * that says otherwise.
     */
    OutletPriceView setOverride(UUID productId, UUID outletId, OutletPriceRequest request,
                                PosPrincipal actor, String clientIp);

    void clearOverride(UUID productId, UUID outletId, PosPrincipal actor, String clientIp);

    /**
     * FR-PRICE-03: the prices in force for one product at one branch.
     *
     * <p>The sale path's authority for BR-10 — a branch that has lowered its
     * floor has lowered the price its cashiers may reach without approval.
     */
    Pricing.Effective effective(UUID productId, UUID outletId);

    /**
     * Every product's prices at one branch, in one query.
     *
     * <p>Pricing a whole catalogue one product at a time is a query per row,
     * which the counter feels on every search.
     */
    Map<UUID, Pricing.Effective> effectiveAt(UUID outletId);

    /** FR-PRICE-06: what this product has been priced at, and by whom. */
    List<PriceHistoryView> history(UUID productId);
}
