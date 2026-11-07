package gh.giftedlabs.pos.rules;

/**
 * Why cash moved, other than a sale — FR-CASH-03.
 *
 * <p>The sign belongs to the type, not the caller, for the same reason it does
 * in {@link MovementType}: a PAYOUT that could be entered as a positive number
 * would be a way to invent money in the drawer.
 */
public enum CashMovementType {

    /** Topping the drawer up mid-shift. */
    FLOAT_IN(true),

    /** Money out for an expense — BR-14 subtracts it from expected cash. */
    PAYOUT(false),

    /** Cash removed to the safe. */
    DROP(false),

    /** FR-CASH-09: how a closed shift is corrected, since it cannot be reopened. */
    CORRECTION(true);

    private final boolean increases;

    CashMovementType(boolean increases) {
        this.increases = increases;
    }

    public boolean increases() {
        return increases;
    }
}
