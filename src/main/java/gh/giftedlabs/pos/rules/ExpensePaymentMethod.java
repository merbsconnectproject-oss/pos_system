package gh.giftedlabs.pos.rules;

import java.util.Optional;

/**
 * How an expense was paid.
 *
 * <p>Deliberately not {@code PaymentMethod} — that enum is about money coming
 * <em>in</em> at a till, and the two lists only look alike. {@link #CASH_DRAWER}
 * is the one that overlaps: cash taken from the till to pay for something is
 * also a drawer movement, and BR-13 counts it.
 */
public enum ExpensePaymentMethod {

    /** Paid out of the till. Also a cash movement, because the drawer is short by it. */
    CASH_DRAWER("Cash (Drawer)"),
    MOBILE_MONEY("Mobile Money"),
    BANK_TRANSFER("Bank Transfer"),
    CHEQUE("Cheque"),
    CORPORATE_CARD("Corporate Card");

    private final String label;

    ExpensePaymentMethod(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static Optional<ExpensePaymentMethod> ofKey(String key) {
        if (key == null) return Optional.empty();
        for (ExpensePaymentMethod method : values()) {
            if (method.name().equalsIgnoreCase(key.trim())) return Optional.of(method);
        }
        return Optional.empty();
    }
}
