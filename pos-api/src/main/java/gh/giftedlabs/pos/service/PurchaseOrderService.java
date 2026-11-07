package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.PurchaseOrderRequest;
import gh.giftedlabs.pos.dto.PurchaseOrderView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.UUID;

/** Purchase orders — FR-SUP-08. */
public interface PurchaseOrderService {

    List<PurchaseOrderView> list(UUID outletId, String status, UUID supplierId, int limit);

    PurchaseOrderView get(UUID id);

    PurchaseOrderView create(PurchaseOrderRequest request, PosPrincipal actor, String clientIp);

    /** Draft only. A sent order is a copy the supplier holds; it is not edited. */
    PurchaseOrderView amend(UUID id, PurchaseOrderRequest request, PosPrincipal actor, String clientIp);

    PurchaseOrderView send(UUID id, PosPrincipal actor, String clientIp);

    /** No more deliveries expected — received in full, or short and accepted as such. */
    PurchaseOrderView close(UUID id, String reason, PosPrincipal actor, String clientIp);

    PurchaseOrderView cancel(UUID id, String reason, PosPrincipal actor, String clientIp);

    /**
     * Called when a delivery against an order is confirmed.
     *
     * <p>Closes the order when nothing is outstanding, so a shop's open-orders
     * list is the orders that are actually open rather than every order it ever
     * raised. Over-delivery counts as arrived.
     */
    void noteDelivery(UUID orderId, PosPrincipal actor, String clientIp);
}
