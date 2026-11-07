package gh.giftedlabs.pos.rules;

import java.util.List;
import java.util.Optional;

/**
 * What happens to an item that has come back — FR returns.
 *
 * <p>The disposition decides the stock movements, and it is the difference
 * between a shop that knows what it has and one that does not. A faulty bulb
 * taken back and put on the shelf is a second complaint waiting to happen.
 */
public enum ReturnDisposition {

    /** Sellable. Goes back on the shelf. */
    RESTOCK("Restock", true, false),

    /**
     * Came back, cannot be sold.
     *
     * <p>Written as <em>two</em> movements — in, then out — rather than none.
     * The item physically returned, and BR-2 makes the ledger the account of
     * what happened rather than only of what is sellable. It also puts the loss
     * on the damage report, which is where somebody decides whether a supplier
     * is sending bad stock.
     */
    DAMAGED_WRITE_OFF("Damaged — written off", true, true),

    /** Goes on to the supplier as a warranty claim. In, then out to them. */
    SUPPLIER_RMA("Returned to supplier", true, true);

    private final String label;
    private final boolean returnsToStock;
    private final boolean leavesAgain;

    ReturnDisposition(String label, boolean returnsToStock, boolean leavesAgain) {
        this.label = label;
        this.returnsToStock = returnsToStock;
        this.leavesAgain = leavesAgain;
    }

    public String label() {
        return label;
    }

    /** Every disposition records the goods coming back in. */
    public boolean returnsToStock() {
        return returnsToStock;
    }

    /** …and all but {@link #RESTOCK} record them leaving again. */
    public boolean leavesAgain() {
        return leavesAgain;
    }

    /** The movement that takes it out again, for the dispositions that do. */
    public MovementType outboundType() {
        return switch (this) {
            case RESTOCK -> throw new IllegalStateException("A restock does not leave again");
            case DAMAGED_WRITE_OFF -> MovementType.DAMAGE;
            case SUPPLIER_RMA -> MovementType.SUPPLIER_RETURN;
        };
    }

    /** Net effect on sellable stock. Only a restock adds anything. */
    public boolean addsSellableStock() {
        return this == RESTOCK;
    }

    public static Optional<ReturnDisposition> ofKey(String key) {
        if (key == null) return Optional.empty();
        for (ReturnDisposition disposition : values()) {
            if (disposition.name().equalsIgnoreCase(key.trim())) return Optional.of(disposition);
        }
        return Optional.empty();
    }

    public static List<ReturnDisposition> all() {
        return List.of(values());
    }
}
