package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.SaleRequest;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.UUID;

/** Selling — FR-POS, FR-PAY. */
public interface SaleService {

    /**
     * BR-7: idempotent on the client-generated sale id. Submitting the same
     * sale twice records one and returns the original.
     *
     * @param mayOversell BR-9: whether the cashier holds {@code stock.oversell}.
     */
    SaleView complete(SaleRequest request, PosPrincipal actor, boolean mayOversell, String clientIp);

    /** BR-3 · FR-POS-19: void with a reason, writing reversing movements. */
    SaleView voidSale(UUID saleId, String reason, PosPrincipal actor, String clientIp);

    SaleView get(UUID saleId);

    /** FR-POS-18. */
    List<SaleView> recent(UUID outletId, String query, int limit);
}
