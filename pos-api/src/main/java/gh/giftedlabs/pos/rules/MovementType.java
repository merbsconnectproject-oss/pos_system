package gh.giftedlabs.pos.rules;

/**
 * Why stock moved — FR-INV-02.
 *
 * <p>An enum rather than a table for the same reason {@link Permission} is: the
 * set is decided by what the code does with each case, and a row an operator
 * could add would name a movement nothing knows how to handle.
 */
public enum MovementType {

    /** The count a product starts with when it is first set up at an outlet. */
    OPENING(true),

    /** Goods in from a supplier. The only type that moves weighted average cost — BR-4. */
    RECEIPT(true),

    SALE(false),

    /** BR-3: a void writes the reversal; the original sale is never deleted. */
    SALE_VOID(true),

    ADJUSTMENT_IN(true),
    ADJUSTMENT_OUT(false),
    DAMAGE(false),
    LOSS(false),

    /**
     * Goods back from a customer — not a void, and not an adjustment.
     *
     * <p>A void cancels a sale that should never have happened; a return is a
     * later event against a sale that was correct. An adjustment is a
     * hand-entered correction, which FR-INV-06 makes approvable past a
     * threshold — a return is a document with a customer on the other side of
     * it, and treating one as the other would put every refund through an
     * approval meant for stocktake errors.
     */
    CUSTOMER_RETURN(true),

    /** A warranty claim going on to the supplier. */
    SUPPLIER_RETURN(false);

    private final boolean increases;

    MovementType(boolean increases) {
        this.increases = increases;
    }

    /** Which way this type moves stock. The sign is the type's, not the caller's. */
    public boolean increases() {
        return increases;
    }

    /**
     * FR-INV-06: is this a hand-entered correction rather than a document?
     *
     * <p>Receipts and sales carry their own paperwork and their own approvals.
     * These four are somebody typing a number into a box, which is why they are
     * the ones a value threshold guards.
     */
    public boolean isAdjustment() {
        return this == ADJUSTMENT_IN || this == ADJUSTMENT_OUT || this == DAMAGE || this == LOSS;
    }

    /**
     * BR-4: only a receipt changes the average cost.
     *
     * <p>A sale leaves it alone — selling does not make the remaining stock
     * cheaper or dearer — and an adjustment corrects a count, not a valuation.
     */
    public boolean affectsAverageCost() {
        return this == RECEIPT || this == OPENING;
    }

    /** FR-INV-05: these require a reason code and cannot be entered blind. */
    public boolean requiresReason() {
        return this == ADJUSTMENT_IN || this == ADJUSTMENT_OUT || this == DAMAGE || this == LOSS;
    }
}
