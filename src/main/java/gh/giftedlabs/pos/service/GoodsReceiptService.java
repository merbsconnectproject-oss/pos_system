package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.GoodsReceiptRequest;
import gh.giftedlabs.pos.dto.GoodsReceiptView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.UUID;

/** Booking in deliveries — FR-SUP-02…07. */
public interface GoodsReceiptService {

    /** FR-SUP-04: writes the stock movements and moves weighted average cost. */
    GoodsReceiptView receive(GoodsReceiptRequest request, PosPrincipal actor, String clientIp);

    /** FR-SUP-06: a correcting document, never an edit. */
    GoodsReceiptView reverse(UUID receiptId, PosPrincipal actor, String clientIp);

    /** FR-SUP-07. */
    List<GoodsReceiptView> forSupplier(UUID supplierId);

    List<GoodsReceiptView> atOutlet(UUID outletId);
}
