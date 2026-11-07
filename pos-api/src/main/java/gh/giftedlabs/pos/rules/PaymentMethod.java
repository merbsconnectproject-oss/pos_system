package gh.giftedlabs.pos.rules;

/**
 * How a sale was paid — FR-PAY-01.
 *
 * <p>Lower case to match the frontend's union and the database enum exactly;
 * this is a wire value as much as a Java one, and translating it in three
 * places would be three chances to disagree.
 */
public enum PaymentMethod {
    cash,
    momo,
    card,
    transfer;

    /**
     * FR-PAY-06: only cash may be overpaid, because only cash can give change.
     * A customer cannot be handed back part of a card authorisation.
     */
    public boolean allowsOverpayment() {
        return this == cash;
    }

    /** FR-PAY-03: everything but cash carries a reference worth recording. */
    public boolean expectsReference() {
        return this != cash;
    }
}
