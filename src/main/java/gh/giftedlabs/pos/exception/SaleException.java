package gh.giftedlabs.pos.exception;

import java.util.Map;
import java.util.UUID;

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

    /** FR-PAY-03: non-cash tenders must carry the cashier's confirmation reference. */
    public static SaleException paymentReferenceRequired(String method) {
        return new SaleException("PAYMENT_REFERENCE_REQUIRED",
                "A %s payment needs the reference confirming that funds were received.".formatted(method),
                Map.of("method", method));
    }

    /** FR-PAY-07: payment identifiers are client keys and must be unique in a request. */
    public static SaleException duplicatePayment(UUID paymentId) {
        return new SaleException("DUPLICATE_PAYMENT",
                "Payment %s was submitted more than once.".formatted(paymentId),
                Map.of("paymentId", paymentId));
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

    /**
     * FR-POS-10 · FR-PRICE-05: past the discount allowed here without approval.
     *
     * <p>"Allowed here" rather than "this role may give", because the cap is
     * the larger of the seller's role ceiling and the customer's agreed rate —
     * naming the role would be wrong whenever the deal is what raised it.
     */
    public static SaleException discountAboveCeiling(String productName, java.math.BigDecimal percent,
                                                     java.math.BigDecimal ceiling) {
        return new SaleException("DISCOUNT_ABOVE_CEILING",
                "%s%% off %s is past the %s%% allowed here. Ask a manager to approve it."
                        .formatted(percent.setScale(1, java.math.RoundingMode.HALF_UP).toPlainString(),
                                productName,
                                ceiling.setScale(1, java.math.RoundingMode.HALF_UP).toPlainString()),
                Map.of("product", productName, "percent", percent, "ceiling", ceiling));
    }

    /**
     * FR-POS-10: a cart discount larger than the cart it is taken off.
     *
     * <p>Refused rather than clamped to the cart. A till that quietly turned
     * "GH₵500 off" into "everything off" would settle a sale nobody agreed to,
     * and the cashier would find out from the drawer rather than the screen.
     */
    public static SaleException cartDiscountExceedsCart(long discount, long cart) {
        return new SaleException("CART_DISCOUNT_EXCEEDS_CART",
                "A discount of %s is more than the %s in the cart."
                        .formatted(gh.giftedlabs.pos.rules.Money.ofPesewas(discount),
                                gh.giftedlabs.pos.rules.Money.ofPesewas(cart)),
                Map.of("discount", discount, "cart", cart));
    }

    /** FR-POS-10: the cart discount given as both a percentage and an amount. */
    public static SaleException cartDiscountStatedTwice() {
        return new SaleException("CART_DISCOUNT_STATED_TWICE",
                "Give the cart discount as a percentage or as an amount, not both.",
                Map.of());
    }

    /** BR-6: the terminal has used every number it was given. */
    public static SaleException receiptBlockExhausted(String terminalCode) {
        return new SaleException("RECEIPT_BLOCK_EXHAUSTED",
                "Terminal %s has used its whole receipt block. Issue a new one before selling."
                        .formatted(terminalCode),
                Map.of("terminal", terminalCode));
    }

    // --- returns ------------------------------------------------------------

    /** Nothing can come back twice. The ledger of previous returns is the cap. */
    public static SaleException tooMuchReturned(String productName, java.math.BigDecimal wanted,
                                                java.math.BigDecimal returnable) {
        return new SaleException("RETURN_EXCEEDS_SOLD",
                returnable.signum() == 0
                        ? "%s has already been returned in full.".formatted(productName)
                        : "Only %s of %s can still be returned; %s was asked for."
                                .formatted(returnable.toPlainString(), productName, wanted.toPlainString()),
                java.util.Map.of("product", productName,
                        "wanted", wanted.toPlainString(),
                        "returnable", returnable.toPlainString()));
    }

    /**
     * BR-3: a voided sale has already been reversed in full.
     *
     * <p>Returning against one would write the reversal twice and the stock
     * would end up higher than it ever was.
     */
    public static SaleException cannotReturnVoidedSale(String receiptNumber) {
        return new SaleException("SALE_VOIDED",
                "Receipt %s was voided, so its stock and takings were already reversed."
                        .formatted(receiptNumber),
                java.util.Map.of("receipt", receiptNumber));
    }

    /** A line that is not on the receipt being returned against. */
    public static SaleException lineNotOnSale(String receiptNumber) {
        return new SaleException("LINE_NOT_ON_SALE",
                "One of those items is not on receipt %s.".formatted(receiptNumber),
                java.util.Map.of("receipt", receiptNumber));
    }

    /** An exchange has to say what is being taken instead. */
    public static SaleException exchangeNeedsReplacement() {
        return new SaleException("EXCHANGE_NEEDS_REPLACEMENT",
                "An exchange needs the replacement items. Use a refund if nothing is going back out.",
                java.util.Map.of());
    }

    /** A refund of money has to say how the money went back. */
    public static SaleException refundNeedsMethod() {
        return new SaleException("REFUND_NEEDS_METHOD",
                "Say how the refund was given — cash, card, mobile money or transfer.",
                java.util.Map.of());
    }

    /** FR-USER-03: the named approver does not hold sale.refund. */
    public static SaleException approverCannotRefund() {
        return new SaleException("APPROVER_CANNOT_REFUND",
                "That person cannot authorise refunds.", java.util.Map.of());
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
