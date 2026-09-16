package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.ReturnRequest;
import gh.giftedlabs.pos.dto.ReturnView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.UUID;

/** Returns and exchanges — {@code sale.refund}. */
public interface ReturnService {

    /**
     * What may still be taken back against a sale.
     *
     * <p>Asked before the screen offers anything, so a cashier is never shown a
     * quantity the shop will then refuse.
     */
    ReturnView.Returnable returnable(UUID saleId);

    ReturnView process(ReturnRequest request, PosPrincipal actor, boolean mayOversell, String clientIp);

    ReturnView get(UUID id);

    List<ReturnView> list(UUID outletId, int limit);
}
