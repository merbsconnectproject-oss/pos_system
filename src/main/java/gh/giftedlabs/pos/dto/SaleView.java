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
    }

    public record PaymentLine(UUID id, String method, long amount, String provider, String reference) {
    }
}
