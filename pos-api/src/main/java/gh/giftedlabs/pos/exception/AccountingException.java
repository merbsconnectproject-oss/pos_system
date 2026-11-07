package gh.giftedlabs.pos.exception;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Something the accounting module cannot do as asked — expenses and installment
 * plans.
 *
 * <p>Carries a code and the numbers involved, like {@link ShiftException}, so the
 * screen can say what the actual figure was rather than "invalid request". A
 * cashier told "that is more than is left to pay" needs to be told how much is
 * left.
 */
public class AccountingException extends RuntimeException {

    private final String code;
    private final boolean notFound;
    private final Map<String, Object> details;

    private AccountingException(String code, String message, boolean notFound,
                                Map<String, Object> details) {
        super(message);
        this.code = code;
        this.notFound = notFound;
        this.details = details;
    }

    public static AccountingException expenseNotFound() {
        return new AccountingException("EXPENSE_NOT_FOUND",
                "That expense no longer exists", true, Map.of());
    }

    public static AccountingException expenseAlreadyVoided() {
        return new AccountingException("EXPENSE_ALREADY_VOIDED",
                "That expense has already been removed.", false, Map.of());
    }

    public static AccountingException planNotFound() {
        return new AccountingException("PLAN_NOT_FOUND",
                "That installment plan no longer exists", true, Map.of());
    }

    /** A plan whose balance is settled, or that was written off. */
    public static AccountingException planNotActive(String status) {
        return new AccountingException("PLAN_NOT_ACTIVE",
                "This plan is %s, so no further payment can be taken against it."
                        .formatted(status.toLowerCase()),
                false, Map.of("status", status));
    }

    /**
     * Taking more than is owed.
     *
     * <p>Refused rather than absorbed. A plan that accepted an overpayment would
     * show a negative balance, and the money would be recorded against a debt
     * that does not exist instead of as the change it actually is.
     */
    public static AccountingException overpayment(long attemptedPesewas, long outstandingPesewas) {
        return new AccountingException("PLAN_OVERPAYMENT",
                "That is %s more than is left to pay. The outstanding balance is %s."
                        .formatted(major(attemptedPesewas - outstandingPesewas), major(outstandingPesewas)),
                false,
                Map.of("attempted", attemptedPesewas, "outstanding", outstandingPesewas));
    }

    /** The down payment cannot exceed what is being bought. */
    public static AccountingException downPaymentTooLarge(long downPesewas, long totalPesewas) {
        return new AccountingException("DOWN_PAYMENT_TOO_LARGE",
                "A down payment of %s is more than the %s total. There would be nothing to spread."
                        .formatted(major(downPesewas), major(totalPesewas)),
                false, Map.of("downPayment", downPesewas, "total", totalPesewas));
    }

    public String getCode() { return code; }
    public boolean isNotFound() { return notFound; }
    public Map<String, Object> getDetails() { return details; }

    private static String major(long pesewas) {
        return BigDecimal.valueOf(pesewas, 2).toPlainString();
    }
}
