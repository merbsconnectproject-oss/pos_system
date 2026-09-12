package gh.giftedlabs.pos.rules;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Permissions — PRD §6, FR-USER-03.
 *
 * <p>A role supplies a baseline; per-user overrides grant or revoke individual
 * codes on top of it. Resolution happens server-side on every request —
 * NFR-9 is explicit that the interface is never the only control.
 *
 * <p><strong>33 codes, not 31.</strong> The PRD §6 matrix documents 31. The
 * frontend's {@code permissions.ts} carries two more — {@link #STOCK_TRANSFER}
 * (Stage 3, transfers between outlets) and {@link #CUSTOMER_CREDIT} (Stage 2,
 * credit sales) — so they are seeded here too and Stage 2 and 3 need no
 * migration.
 *
 * <p><strong>Open decision, week 1.</strong> This class mirrors the frontend
 * exactly, which means Owner currently holds both deferred codes. They have no
 * endpoints behind them, so nothing can act on them — but a permission granted
 * with nothing behind it is a trap for whoever reads the matrix next. The
 * alternative is to grant neither to any role, which requires amending
 * {@code contract-check.ts} (it asserts Owner holds every code) and
 * regenerating the vectors. Settle it before the permission middleware lands.
 *
 * <p>Port of the frontend's {@code src/permissions.ts}.
 */
public final class Permissions {

    // Selling
    public static final String POS_SELL = "pos.sell";
    public static final String SALE_DISCOUNT = "sale.discount";
    public static final String SALE_APPROVE_BELOW_FLOOR = "sale.approve_below_floor";
    public static final String SALE_VOID = "sale.void";
    public static final String SALE_REFUND = "sale.refund";
    public static final String SALE_VIEW_ALL = "sale.view_all";
    public static final String SALE_REPRINT = "sale.reprint";

    // Pricing
    public static final String PRICE_VIEW_COST = "price.view_cost";
    public static final String PRICE_EDIT = "price.edit";

    // Catalogue
    public static final String PRODUCT_CREATE = "product.create";
    public static final String PRODUCT_EDIT = "product.edit";
    public static final String PRODUCT_IMPORT = "product.import";

    // Stock
    public static final String STOCK_VIEW = "stock.view";
    public static final String STOCK_RECEIVE = "stock.receive";
    public static final String STOCK_ADJUST = "stock.adjust";
    public static final String STOCK_APPROVE_ADJUSTMENT = "stock.approve_adjustment";
    public static final String STOCK_OVERSELL = "stock.oversell";
    /** Stage 3 — no endpoint yet. */
    public static final String STOCK_TRANSFER = "stock.transfer";

    // Cash and shifts
    public static final String SHIFT_OPEN = "shift.open";
    public static final String SHIFT_CLOSE = "shift.close";
    public static final String CASH_MOVEMENT = "cash.movement";
    public static final String CASH_VIEW_VARIANCE = "cash.view_variance";

    // Customers and suppliers
    public static final String CUSTOMER_MANAGE = "customer.manage";
    /** Stage 2 — no endpoint yet. */
    public static final String CUSTOMER_CREDIT = "customer.credit";
    public static final String SUPPLIER_MANAGE = "supplier.manage";

    // Reporting
    public static final String REPORT_VIEW = "report.view";
    public static final String REPORT_VIEW_PROFIT = "report.view_profit";

    // Administration
    public static final String USER_MANAGE = "user.manage";
    public static final String AUDIT_VIEW = "audit.view";
    public static final String OUTLET_VIEW_ALL = "outlet.view_all";
    public static final String SETTINGS_GENERAL = "settings.general";
    public static final String SETTINGS_APPEARANCE = "settings.appearance";
    public static final String SETTINGS_TERMINAL = "settings.terminal";

    /** All 33 codes, in the frontend's declaration order. */
    public static final List<String> ALL = List.of(
            POS_SELL, SALE_DISCOUNT, SALE_APPROVE_BELOW_FLOOR, SALE_VOID, SALE_REFUND,
            SALE_VIEW_ALL, SALE_REPRINT,
            PRICE_VIEW_COST, PRICE_EDIT,
            PRODUCT_CREATE, PRODUCT_EDIT, PRODUCT_IMPORT,
            STOCK_VIEW, STOCK_RECEIVE, STOCK_ADJUST, STOCK_APPROVE_ADJUSTMENT, STOCK_OVERSELL,
            STOCK_TRANSFER,
            SHIFT_OPEN, SHIFT_CLOSE, CASH_MOVEMENT, CASH_VIEW_VARIANCE,
            CUSTOMER_MANAGE, CUSTOMER_CREDIT, SUPPLIER_MANAGE,
            REPORT_VIEW, REPORT_VIEW_PROFIT,
            USER_MANAGE, AUDIT_VIEW, OUTLET_VIEW_ALL,
            SETTINGS_GENERAL, SETTINGS_APPEARANCE, SETTINGS_TERMINAL);

    public static final String ROLE_OWNER = "owner";
    public static final String ROLE_MANAGER = "manager";
    public static final String ROLE_CASHIER = "cashier";
    public static final String ROLE_STOREKEEPER = "storekeeper";

    /** Default role baselines. Individual users may be varied — FR-USER-03. */
    public static final Map<String, List<String>> DEFAULT_ROLE_PERMISSIONS = Map.of(
            ROLE_OWNER, ALL,
            ROLE_MANAGER, List.of(
                    POS_SELL, SALE_DISCOUNT, SALE_APPROVE_BELOW_FLOOR, SALE_VOID, SALE_REFUND,
                    SALE_VIEW_ALL, SALE_REPRINT,
                    PRICE_VIEW_COST, PRICE_EDIT,
                    PRODUCT_CREATE, PRODUCT_EDIT,
                    STOCK_VIEW, STOCK_RECEIVE, STOCK_ADJUST, STOCK_APPROVE_ADJUSTMENT, STOCK_OVERSELL,
                    SHIFT_OPEN, SHIFT_CLOSE, CASH_MOVEMENT, CASH_VIEW_VARIANCE,
                    CUSTOMER_MANAGE, CUSTOMER_CREDIT, SUPPLIER_MANAGE,
                    REPORT_VIEW, REPORT_VIEW_PROFIT,
                    AUDIT_VIEW,
                    SETTINGS_APPEARANCE, SETTINGS_TERMINAL),
            ROLE_CASHIER, List.of(
                    POS_SELL, SALE_DISCOUNT, SALE_REPRINT,
                    STOCK_VIEW,
                    SHIFT_OPEN, SHIFT_CLOSE,
                    CUSTOMER_MANAGE),
            ROLE_STOREKEEPER, List.of(
                    PRICE_VIEW_COST,
                    PRODUCT_CREATE, PRODUCT_EDIT,
                    STOCK_VIEW, STOCK_RECEIVE, STOCK_ADJUST,
                    SUPPLIER_MANAGE));

    private Permissions() {
    }

    /**
     * Resolve a role baseline against per-user overrides.
     * {@code true} grants a code, {@code false} revokes it.
     */
    public static Set<String> resolve(Collection<String> roleCodes, Map<String, Boolean> overrides) {
        Set<String> granted = new LinkedHashSet<>(roleCodes);
        if (overrides != null) {
            overrides.forEach((code, isGranted) -> {
                if (Boolean.TRUE.equals(isGranted)) {
                    granted.add(code);
                } else {
                    granted.remove(code);
                }
            });
        }
        return granted;
    }

    public static Set<String> resolve(Collection<String> roleCodes) {
        return resolve(roleCodes, null);
    }

    public static Set<String> forRole(String role) {
        return resolve(DEFAULT_ROLE_PERMISSIONS.getOrDefault(role, List.of()));
    }
}
