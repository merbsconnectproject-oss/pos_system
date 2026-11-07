package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.SaleReturn;
import gh.giftedlabs.pos.entity.SaleReturnItem;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A credit note as the counter and the owner read it. */
public record ReturnView(
        UUID id,
        String returnNumber,
        UUID originalSaleId,
        String originalReceiptNumber,
        UUID outletId,
        String kind,
        long refundTotalPesewas,
        UUID exchangeSaleId,
        String exchangeReceiptNumber,
        long settlementPesewas,
        String refundMethod,
        UUID customerId,
        String customerName,
        String notes,
        UUID cashierId,
        String cashierName,
        UUID approvedBy,
        Instant createdAt,
        List<Line> items) {

    public record Line(
            UUID saleItemId,
            UUID productId,
            String productName,
            BigDecimal quantityBase,
            BigDecimal unitPrice,
            long lineRefundPesewas,
            String reason,
            String disposition,
            String dispositionLabel,
            String conditionNotes,
            /** Whether this line put anything back on the shelf. */
            boolean restocked) {

        static Line of(SaleReturnItem item) {
            return new Line(item.getSaleItemId(), item.getProductId(), item.getProductName(),
                    item.getQuantityBase(), item.getUnitPrice(), item.getLineRefundPesewas(),
                    item.getReason(), item.getDisposition().name(), item.getDisposition().label(),
                    item.getConditionNotes(), item.getDisposition().addsSellableStock());
        }
    }

    public static ReturnView of(SaleReturn document, String originalReceipt, String exchangeReceipt,
                                String customerName, String cashierName) {
        return new ReturnView(
                document.getId(), document.getReturnNumber(), document.getOriginalSaleId(),
                originalReceipt, document.getOutletId(), document.getKind().name(),
                document.getRefundTotalPesewas(), document.getExchangeSaleId(), exchangeReceipt,
                document.getSettlementPesewas(), document.getRefundMethod(),
                document.getCustomerId(), customerName, document.getNotes(),
                document.getCashierId(), cashierName, document.getApprovedBy(),
                document.getCreatedAt(),
                document.getItems().stream().map(Line::of).toList());
    }

    /**
     * What may still be taken back against a sale — FR returns.
     *
     * <p>Answered by the server before the screen offers anything, so a cashier
     * is never shown a quantity the shop will then refuse.
     */
    public record Returnable(
            UUID saleId,
            String receiptNumber,
            boolean voided,
            List<ReturnableLine> lines) {

        public record ReturnableLine(
                UUID saleItemId,
                UUID productId,
                String productName,
                BigDecimal quantitySold,
                BigDecimal quantityAlreadyReturned,
                BigDecimal quantityReturnable,
                BigDecimal unitPrice) {
        }
    }
}
