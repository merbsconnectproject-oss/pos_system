package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A booked-in delivery, with what it did to stock — FR-SUP-04, FR-SUP-05. */
public record GoodsReceiptView(
        UUID id,
        UUID outletId,
        UUID supplierId,
        String supplierName,
        String reference,
        String note,
        Instant confirmedAt,
        String confirmedBy,
        UUID reversesId,
        boolean reversed,
        BigDecimal total,
        List<Line> lines) {

    /**
     * {@code resultingQuantity} and {@code resultingAverageCost} are what the
     * stock actually became — FR-SUP-05 shows an estimate before commit, and
     * this is the answer afterwards.
     */
    public record Line(
            UUID productId,
            String productName,
            String purchaseUnit,
            BigDecimal conversionFactor,
            BigDecimal quantity,
            BigDecimal quantityInBaseUnits,
            BigDecimal unitCost,
            BigDecimal lineTotal,
            BigDecimal resultingQuantity,
            BigDecimal resultingAverageCost) {
    }
}
