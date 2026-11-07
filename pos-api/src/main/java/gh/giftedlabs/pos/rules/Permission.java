package gh.giftedlabs.pos.rules;

import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Permissions — PRD §6.
 *
 * <p>The frontend models these as a union of string literals, which is the right
 * shape in TypeScript. In Java the equivalent is an enum: the compiler rejects a
 * typo, {@link java.util.EnumSet} resolution is a bitmask rather than hashing,
 * and a {@code switch} over permissions can be checked for exhaustiveness.
 *
 * <p>The wire code — {@code "sale.void"} — stays as the {@link #code()} field,
 * because it is what the database stores, what the frontend sends and what
 * Spring Security's {@code @PreAuthorize} matches. Those annotations need
 * compile-time constants, so the literals are mirrored in {@link Codes}.
 *
 * <p><strong>37 codes.</strong> PRD §6 documents 31; {@code permissions.ts}
 * carried two more ({@link #STOCK_TRANSFER}, {@link #CUSTOMER_CREDIT}), and
 * three arrived with the accounting module — {@link #EXPENSE_VIEW},
 * {@link #EXPENSE_MANAGE} and {@link #REPORT_VIEW_PL} — and {@link #SYNC_PUSH}
 * arrived with the transaction channel. The expenses screen was
 * previously gated on {@code cash.movement}, which meant anyone allowed to bank
 * the day's takings could also read the rent and the payroll.
 *
 * <p><strong>Open decision, week 1.</strong> This mirrors the frontend exactly,
 * which means Owner currently holds both deferred codes. Nothing can act on
 * them — there are no endpoints — but a permission granted with nothing behind
 * it misleads whoever reads the matrix next. The alternative grants neither to
 * any role, which means amending {@code contract-check.ts} (it asserts Owner
 * holds every code) and regenerating the vectors. Settle before the permission
 * middleware lands.
 */
public enum Permission {

    // --- Selling -----------------------------------------------------------
    POS_SELL(Codes.POS_SELL, Group.SELLING, "Ring up and complete sales"),
    SALE_DISCOUNT(Codes.SALE_DISCOUNT, Group.SELLING, "Apply a discount up to the configured limit"),
    SALE_APPROVE_BELOW_FLOOR(Codes.SALE_APPROVE_BELOW_FLOOR, Group.SELLING, "Approve a sale below the floor price"),
    SALE_VOID(Codes.SALE_VOID, Group.SELLING, "Void a completed sale"),
    SALE_REFUND(Codes.SALE_REFUND, Group.SELLING, "Refund a sale"),
    SALE_VIEW_ALL(Codes.SALE_VIEW_ALL, Group.SELLING, "View all sales, not only own"),
    SALE_REPRINT(Codes.SALE_REPRINT, Group.SELLING, "Reprint a receipt"),

    // --- Pricing -----------------------------------------------------------
    PRICE_VIEW_COST(Codes.PRICE_VIEW_COST, Group.PRICING, "See cost price and margin"),
    PRICE_EDIT(Codes.PRICE_EDIT, Group.PRICING, "Change prices"),

    // --- Catalogue ---------------------------------------------------------
    PRODUCT_CREATE(Codes.PRODUCT_CREATE, Group.CATALOGUE, "Create products"),
    PRODUCT_EDIT(Codes.PRODUCT_EDIT, Group.CATALOGUE, "Edit products"),
    PRODUCT_IMPORT(Codes.PRODUCT_IMPORT, Group.CATALOGUE, "Bulk import the catalogue"),

    // --- Stock -------------------------------------------------------------
    STOCK_VIEW(Codes.STOCK_VIEW, Group.STOCK, "See stock levels"),
    STOCK_RECEIVE(Codes.STOCK_RECEIVE, Group.STOCK, "Receive goods against a supplier"),
    STOCK_ADJUST(Codes.STOCK_ADJUST, Group.STOCK, "Adjust or write off stock"),
    STOCK_APPROVE_ADJUSTMENT(Codes.STOCK_APPROVE_ADJUSTMENT, Group.STOCK, "Approve an adjustment past the threshold"),
    STOCK_OVERSELL(Codes.STOCK_OVERSELL, Group.STOCK, "Sell past zero; the movement is flagged"),
    /** Stage 3 — no endpoint behind this yet. */
    STOCK_TRANSFER(Codes.STOCK_TRANSFER, Group.STOCK, "Transfer stock between outlets (Stage 3)"),

    // --- Cash and shifts ---------------------------------------------------
    SHIFT_OPEN(Codes.SHIFT_OPEN, Group.CASH, "Open a shift with a declared float"),
    SHIFT_CLOSE(Codes.SHIFT_CLOSE, Group.CASH, "Close a shift with a blind count"),
    CASH_MOVEMENT(Codes.CASH_MOVEMENT, Group.CASH, "Record a pay-in or pay-out"),
    CASH_VIEW_VARIANCE(Codes.CASH_VIEW_VARIANCE, Group.CASH, "See cash variance"),

    // --- Customers and suppliers -------------------------------------------
    CUSTOMER_MANAGE(Codes.CUSTOMER_MANAGE, Group.PARTIES, "Create and edit customers"),
    /** Installment plans — {@code InstallmentController} authorises against this. */
    CUSTOMER_CREDIT(Codes.CUSTOMER_CREDIT, Group.PARTIES, "Sell on credit and run installment plans"),
    SUPPLIER_MANAGE(Codes.SUPPLIER_MANAGE, Group.PARTIES, "Create and edit suppliers"),

    // --- Expenses and accounting -------------------------------------------
    EXPENSE_VIEW(Codes.EXPENSE_VIEW, Group.EXPENSES, "See recorded operating expenses"),
    EXPENSE_MANAGE(Codes.EXPENSE_MANAGE, Group.EXPENSES, "Record, amend and delete expenses"),

    // --- Reporting ---------------------------------------------------------
    REPORT_VIEW(Codes.REPORT_VIEW, Group.REPORTING, "See reports"),
    REPORT_VIEW_PROFIT(Codes.REPORT_VIEW_PROFIT, Group.REPORTING, "See profit and COGS figures"),
    /**
     * The P&L — operating expenses and net profit, not only gross.
     *
     * <p>Separate from {@link #REPORT_VIEW_PROFIT} because the two disclose
     * different things. Gross profit is about what the shop buys and sells; net
     * profit is the owner's whole cost base — the rent, the salaries, what the
     * business actually keeps.
     */
    REPORT_VIEW_PL(Codes.REPORT_VIEW_PL, Group.REPORTING, "See the profit and loss statement"),

    // --- Administration ----------------------------------------------------
    USER_MANAGE(Codes.USER_MANAGE, Group.ADMIN, "Create users and set permissions"),
    AUDIT_VIEW(Codes.AUDIT_VIEW, Group.ADMIN, "Read the audit log"),
    OUTLET_VIEW_ALL(Codes.OUTLET_VIEW_ALL, Group.ADMIN, "See every outlet, combined"),
    SETTINGS_GENERAL(Codes.SETTINGS_GENERAL, Group.ADMIN, "Change business settings"),
    SETTINGS_APPEARANCE(Codes.SETTINGS_APPEARANCE, Group.ADMIN, "Change the accent colour and appearance"),
    SETTINGS_TERMINAL(Codes.SETTINGS_TERMINAL, Group.ADMIN, "Configure this terminal and its printer"),

    /**
     * Sending the day's trading through Cloud Sync, and nothing else.
     *
     * <p>Separate from {@link #SETTINGS_GENERAL} because the two are not the same
     * risk. Pushing is one-way, additive and audited: the worst a cashier can do
     * with it is send the same day twice, which the far end ignores. Pulling
     * configuration rewrites this counter's users and can move its outlet id, and
     * that stays with whoever administers the shop.
     *
     * <p>Granted to cashiers by default so somebody closing up can send the day
     * without an owner present. The scheduled push already runs every fifteen
     * minutes; this is for the person who wants to see it leave before they lock
     * the door.
     */
    SYNC_PUSH(Codes.SYNC_PUSH, Group.ADMIN, "Send this shop's trading to Cloud Sync");

    /** PRD §6 groupings, used to lay out the permissions screen. */
    public enum Group {
        SELLING("Selling"),
        PRICING("Pricing"),
        CATALOGUE("Catalogue"),
        STOCK("Stock"),
        CASH("Cash & shifts"),
        PARTIES("Customers & suppliers"),
        EXPENSES("Expenses & accounting"),
        REPORTING("Reporting"),
        ADMIN("Administration");

        private final String label;

        Group(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    /**
     * The wire codes as compile-time constants, for {@code @PreAuthorize} —
     * annotations cannot reference an enum's instance field.
     *
     * <pre>{@code @PreAuthorize("hasAuthority('" + Permission.Codes.SALE_VOID + "')")}</pre>
     */
    public static final class Codes {
        public static final String POS_SELL = "pos.sell";
        public static final String SALE_DISCOUNT = "sale.discount";
        public static final String SALE_APPROVE_BELOW_FLOOR = "sale.approve_below_floor";
        public static final String SALE_VOID = "sale.void";
        public static final String SALE_REFUND = "sale.refund";
        public static final String SALE_VIEW_ALL = "sale.view_all";
        public static final String SALE_REPRINT = "sale.reprint";
        public static final String PRICE_VIEW_COST = "price.view_cost";
        public static final String PRICE_EDIT = "price.edit";
        public static final String PRODUCT_CREATE = "product.create";
        public static final String PRODUCT_EDIT = "product.edit";
        public static final String PRODUCT_IMPORT = "product.import";
        public static final String STOCK_VIEW = "stock.view";
        public static final String STOCK_RECEIVE = "stock.receive";
        public static final String STOCK_ADJUST = "stock.adjust";
        public static final String STOCK_APPROVE_ADJUSTMENT = "stock.approve_adjustment";
        public static final String STOCK_OVERSELL = "stock.oversell";
        public static final String STOCK_TRANSFER = "stock.transfer";
        public static final String SHIFT_OPEN = "shift.open";
        public static final String SHIFT_CLOSE = "shift.close";
        public static final String CASH_MOVEMENT = "cash.movement";
        public static final String CASH_VIEW_VARIANCE = "cash.view_variance";
        public static final String CUSTOMER_MANAGE = "customer.manage";
        public static final String CUSTOMER_CREDIT = "customer.credit";
        public static final String SUPPLIER_MANAGE = "supplier.manage";
        public static final String EXPENSE_VIEW = "expense.view";
        public static final String EXPENSE_MANAGE = "expense.manage";
        public static final String REPORT_VIEW = "report.view";
        public static final String REPORT_VIEW_PROFIT = "report.view_profit";
        public static final String REPORT_VIEW_PL = "report.view_pl";
        public static final String USER_MANAGE = "user.manage";
        public static final String AUDIT_VIEW = "audit.view";
        public static final String OUTLET_VIEW_ALL = "outlet.view_all";
        public static final String SETTINGS_GENERAL = "settings.general";
        public static final String SETTINGS_APPEARANCE = "settings.appearance";
        public static final String SETTINGS_TERMINAL = "settings.terminal";
        public static final String SYNC_PUSH = "sync.push";

        private Codes() {
        }
    }

    private static final Map<String, Permission> BY_CODE = Stream.of(values())
            .collect(Collectors.toUnmodifiableMap(Permission::code, Function.identity()));

    private final String code;
    private final Group group;
    private final String description;

    Permission(String code, Group group, String description) {
        this.code = code;
        this.group = group;
        this.description = description;
    }

    /** Look a permission up by its wire code. */
    public static java.util.Optional<Permission> fromCode(String code) {
        return java.util.Arrays.stream(values())
                .filter(permission -> permission.code().equals(code))
                .findFirst();
    }

    /**
     * True for a code reserved for a later stage — {@link #STOCK_TRANSFER}
     * (Stage 3) is the last of them.
     *
     * <p><strong>Decision, 2026-09-14:</strong> the catalogue keeps all 33.
     * The PRD documents 31, and the two extras exist in {@code permissions.ts}.
     * Removing them would mean amending the frozen contract and its vectors
     * now, and putting them back for Stage 2 — while keeping them costs
     * nothing, because no endpoint checks a code whose feature does not exist.
     * They are flagged instead, so the permission matrix can show them as not
     * yet active rather than as rights somebody has been given.
     *
     * <p>To reverse: delete the two constants, drop them from
     * {@code permissions.ts}, and regenerate the contract vectors.
     */
    public boolean isFutureStage() {
        // CUSTOMER_CREDIT stopped being one when installment plans got
        // endpoints: InstallmentController authorises against it, so it is now
        // a right somebody can be given and have it mean something.
        return this == STOCK_TRANSFER;
    }

    public String code() {
        return code;
    }

    public Group group() {
        return group;
    }

    public String description() {
        return description;
    }

    /** Resolve a wire code. Empty rather than throwing — input may come from a stale client. */
    public static Optional<Permission> ofCode(String code) {
        return Optional.ofNullable(BY_CODE.get(code));
    }

    @Override
    public String toString() {
        return code;
    }
}
