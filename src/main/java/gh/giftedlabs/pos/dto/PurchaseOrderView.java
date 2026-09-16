package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * An order as a screen needs it — FR-SUP-08.
 *
 * <p>Everything about delivery is computed here rather than stored: received is
 * summed from the confirmed receipts pointing at the order, and outstanding is
 * ordered minus received. A shop reading this can see over- and short-delivery
 * without anybody having recorded either as a fact.
 */
public record PurchaseOrderView(

        UUID id,
        String number,
        UUID outletId,
        UUID supplierId,
        String supplierName,

        /** DRAFT, SENT, CLOSED or CANCELLED — the decisions somebody made. */
        String status,

        /** How much of it has arrived. Derived, never stored. */
        Delivery delivery,

        LocalDate expectedOn,

        /**
         * Promised, still open, and the date has passed. The one thing a
         * purchasing screen exists to show.
         */
        boolean overdue,

        String note,
        Instant sentAt,
        Instant closedAt,
        String closeReason,
        Instant createdAt,

        /** What the order committed the shop to, at the agreed costs. */
        long orderedTotalPesewas,

        /** What actually arrived, at the costs the deliveries were booked in at. */
        long receivedTotalPesewas,

        List<Line> lines,

        /** The deliveries against this order, newest first. */
        List<Receipt> receipts) {

    /**
     * Where a line or an order stands against what was ordered.
     *
     * <p>{@link #OVER} is not an error. A supplier who sends 11 of the 10 you
     * ordered has over-delivered, the storekeeper has already put them on the
     * shelf, and the shop's job is to see it — not to refuse the twelfth metre of
     * cable at the door.
     */
    public enum Delivery { NONE, PARTIAL, COMPLETE, OVER }

    public record Line(
            UUID productId,
            String sku,
            String name,

            String purchaseUnit,
            BigDecimal conversionFactor,

            /** In purchase units, as the order was written. */
            BigDecimal orderedQuantity,

            /**
             * Also in this line's purchase units, even when the delivery was
             * booked in others: the sum is taken in base units and converted
             * back, so 300 m received against 3 drums ordered reads as 3.
             */
            BigDecimal receivedQuantity,

            /** Negative when more arrived than was ordered. */
            BigDecimal outstandingQuantity,

            BigDecimal unitCost,
            long lineTotalPesewas,
            Delivery delivery) {
    }

    /** A delivery booked against this order. */
    public record Receipt(
            UUID id,
            String reference,
            Instant confirmedAt,

            /** Corrected away by a reversing document, so it counts for nothing. */
            boolean reversed) {
    }
}
