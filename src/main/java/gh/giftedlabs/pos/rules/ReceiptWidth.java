package gh.giftedlabs.pos.rules;

import java.util.Optional;

/**
 * Paper width, in characters — FR-RCPT-03.
 *
 * <p>Thermal printers are character grids, not pixels. An 80mm roll at font A
 * gives 48 columns and a 58mm roll gives 32, and every layout decision follows
 * from that number: at 48 an item and its money fit on one line, at 32 they do
 * not, which is why PRD §9 specifies a different format for the narrow roll
 * rather than the same one squeezed.
 */
public enum ReceiptWidth {

    MM80("80mm", 48),
    MM58("58mm", 32);

    private final String label;
    private final int columns;

    ReceiptWidth(String label, int columns) {
        this.label = label;
        this.columns = columns;
    }

    public String label() {
        return label;
    }

    public int columns() {
        return columns;
    }

    /**
     * True when the item name and its money share a line.
     *
     * <p>The 58mm roll drops to one column: the name on its own line, the
     * quantity and money underneath. Forcing both onto 32 characters would
     * truncate the name, and a receipt whose item names are cut off is one a
     * customer cannot check.
     */
    public boolean fitsTwoColumns() {
        return this == MM80;
    }

    public static Optional<ReceiptWidth> ofLabel(String label) {
        if (label == null) return Optional.empty();
        for (ReceiptWidth width : values()) {
            if (width.label.equalsIgnoreCase(label.trim()) || width.name().equalsIgnoreCase(label.trim())) {
                return Optional.of(width);
            }
        }
        return Optional.empty();
    }
}
