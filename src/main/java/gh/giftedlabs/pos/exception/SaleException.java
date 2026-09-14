package gh.giftedlabs.pos.exception;

import java.util.Map;

/**
 * A sale that cannot be completed as submitted — FR-POS, FR-PAY.
 *
 * <p>One exception with a code, because the client branches on the code and
 * every one of these renders the same way: a message on the payment screen.
 */
public class SaleException extends RuntimeException {
    private final String code;
    private final Map<String, Object> details;

    private SaleException(String code, String message, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    /** FR-PAY-05: payments must equal the total exactly — BR-11, never a tolerance. */
    public static SaleException paymentMismatch(long total, long paid) {
        return new SaleException("PAYMENT_MISMATCH",
                "Payments come to %s but the sale is %s.".formatted(major(paid), major(total)),
                Map.of("total", total, "paid", paid));
    }

    /** FR-PAY-06: only cash can be overpaid, because only cash gives change. */
    public static SaleException overpaymentNotCash(long total, long paid) {
        return new SaleException("OVERPAYMENT_NOT_CASH",
                "Only cash may be overpaid. %s was tendered against %s.".formatted(major(paid), major(total)),
                Map.of("total", total, "paid", paid));
    }

    /** BR-10: below the floor price without an approver. */
    public static SaleException belowFloor(String productName, java.math.BigDecimal price,
                                           java.math.BigDecimal floor) {
        return new SaleException("BELOW_FLOOR_PRICE",
                "%s at %s is below its floor of %s and needs approval."
                        .formatted(productName, price.toPlainString(), floor.toPlainString()),
                Map.of("product", productName, "price", price, "floor", floor));
    }

    /**
     * BR-10: an approver was named who is not allowed to approve this.
     *
     * <p>Separate from {@link #belowFloor} because it is a different mistake:
     * the price is not the problem, the person is. Telling the cashier "needs
     * approval" when they have just had it approved sends them round again.
     */
    public static SaleException approverNotPermitted(String productName) {
        return new SaleException("APPROVER_NOT_PERMITTED",
                "The person who approved %s is not allowed to authorise that.".formatted(productName),
                Map.of("product", productName));
    }

    /** FR-POS-10: past the discount this role may give without approval. */
    public static SaleException discountAboveCeiling(String productName, java.math.BigDecimal percent,
                                                     java.math.BigDecimal ceiling) {
        return new SaleException("DISCOUNT_ABOVE_CEILING",
                "%s%% off %s is past the %s%% this role may give. Ask a manager to approve it."
                        .formatted(percent.setScale(1, java.math.RoundingMode.HALF_UP).toPlainString(),
                                productName,
                                ceiling.setScale(1, java.math.RoundingMode.HALF_UP).toPlainString()),
                Map.of("product", productName, "percent", percent, "ceiling", ceiling));
    }

    /** BR-6: the terminal has used every number it was given. */
    public static SaleException receiptBlockExhausted(String terminalCode) {
        return new SaleException("RECEIPT_BLOCK_EXHAUSTED",
                "Terminal %s has used its whole receipt block. Issue a new one before selling."
                        .formatted(terminalCode),
                Map.of("terminal", terminalCode));
    }

    public static SaleException noTerminal(String outletName) {
        return new SaleException("NO_TERMINAL",
                "No till is configured for %s. Add one before selling.".formatted(outletName),
                Map.of());
    }

    public String getCode() { return code; }
    public Map<String, Object> getDetails() { return details; }

    private static String major(long pesewas) {
        return java.math.BigDecimal.valueOf(pesewas, 2).toPlainString();
    }
}
