package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A sale as the receipt and the history show it.
 *
 * <p>Amounts are pesewas, as stored — BR-11. Converting to major units is the
 * client's last step before display, so nothing in between can reintroduce a
 * fraction of a pesewa.
 */
public record SaleView(
        UUID id,
        String receiptNumber,
        UUID outletId,
        UUID terminalId,
        String cashierName,
        UUID customerId,
        String customerName,
        String customerPhone,
        long subtotal,
        long discountTotal,
        /**
         * FR-POS-10: the part of {@code discountTotal} taken off the whole cart.
         *
         * <p>Carried so the receipt can show a bill-level concession as one
         * line rather than as an unexplained reduction spread across every
         * item, which is how a customer is told about it at the counter.
         */
        long cartDiscount,
        long total,
        long changeDue,
        String status,
        String voidReason,
        String voidedBy,
        Instant voidedAt,
        Instant createdAt,
        List<Line> items,
        List<PaymentLine> payments) {

    public record Line(
            UUID productId,
            String productName,
            String sku,
            String selectedUnit,
            BigDecimal conversionFactor,
            BigDecimal quantity,
            BigDecimal quantityBase,
            BigDecimal unitPrice,
            long discount,
            long lineTotal,
            /**
             * BR-5: the cost frozen at the moment of sale. Carried on the wire
             * because profit on a past sale is computed from it — reading
             * today's average instead would make last month's margin move
             * every time stock is received.
             */
            BigDecimal frozenCostPrice,
            boolean belowFloor) {

        /** FR-RPT-05: null, not zero. Zero is a claim that it cost nothing. */
        Line withoutCost() {
            return new Line(productId, productName, sku, selectedUnit, conversionFactor, quantity,
                    quantityBase, unitPrice, discount, lineTotal, null, belowFloor);
        }
    }

    public record PaymentLine(UUID id, String method, long amount, String provider, String reference) {
    }

    /**
     * The same sale with the cost taken out — FR-RPT-05, release gate 7.
     *
     * <p>A cashier may read back the sale they just rang up; they may not read
     * what the goods cost the shop. The cost was on every line of every sale
     * returned to anyone holding {@code pos.sell}, which is every cashier —
     * and the dashboard then computed a profit figure out of it for people the
     * reports were carefully withholding profit from.
     *
     * <p>Removed here rather than hidden by the screen. A cost that reaches the
     * browser has left the building.
     */
    public SaleView withoutCost() {
        return new SaleView(id, receiptNumber, outletId, terminalId, cashierName, customerId,
                customerName, customerPhone, subtotal, discountTotal, cartDiscount, total, changeDue,
                status, voidReason, voidedBy, voidedAt, createdAt,
                items.stream().map(Line::withoutCost).toList(), payments);
    }
}
