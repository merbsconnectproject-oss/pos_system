package gh.giftedlabs.pos.rules;

import java.util.Optional;

/**
 * The operating-expense categories — the accounting module's chart of accounts.
 *
 * <p>An enum rather than free text. A P&L grouped by whatever somebody typed
 * produces "Utilities", "utilities" and "Utility bills" as three lines that are
 * one cost, and an owner comparing months would be reading noise.
 *
 * <p>The wire form is the screaming-snake key; the label is what the frontend
 * already shows, so the two stay in step without the screen translating.
 */
public enum ExpenseCategory {

    RENT_LEASE("Rent & Lease"),
    UTILITIES_POWER("Utilities & Power"),
    STAFF_PAYROLL("Staff & Payroll"),
    DELIVERY_HAULAGE("Delivery & Haulage"),
    ADVERTISING_MARKETING("Advertising & Marketing"),
    MAINTENANCE_REPAIRS("Maintenance & Repairs"),
    PACKAGING_BAGS("Packaging & Bags"),
    TAXES_LEVIES_LICENSES("Taxes, Levies & Licenses"),
    OFFICE_COMMUNICATION("Office & Communication"),
    MISCELLANEOUS("Miscellaneous");

    private final String label;

    ExpenseCategory(String label) {
        this.label = label;
    }

    /** What the screen calls it. */
    public String label() {
        return label;
    }

    /** Empty rather than throwing — the code may come from a stale client. */
    public static Optional<ExpenseCategory> ofKey(String key) {
        if (key == null) return Optional.empty();
        for (ExpenseCategory category : values()) {
            if (category.name().equalsIgnoreCase(key.trim())) return Optional.of(category);
        }
        return Optional.empty();
    }
}
