package gh.giftedlabs.pos.rules;

/**
 * Where an order has got to — FR-SUP-08.
 *
 * <p>Four states, and only these four, because each is a <em>decision</em>
 * somebody made. How much has arrived is not a decision; it is a subtraction over
 * the receipts pointing at the order, so "partly delivered" is derived and never
 * stored. A status column holding it would be a second copy of the receipts, free
 * to disagree with them.
 */
public enum PurchaseOrderStatus {

    /** Being written. Editable, and the supplier has not seen it. */
    DRAFT,

    /** Issued to the supplier. Lines are frozen; deliveries may arrive. */
    SENT,

    /** Finished — all of it came, or the rest never will and somebody said so. */
    CLOSED,

    /** Abandoned. May or may not have been sent first; both are ordinary. */
    CANCELLED
}
