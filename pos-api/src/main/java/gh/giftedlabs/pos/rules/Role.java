package gh.giftedlabs.pos.rules;

import java.util.EnumSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static gh.giftedlabs.pos.rules.Permission.*;

/**
 * Roles and permission resolution — PRD §6, FR-USER-03.
 *
 * <p>A role supplies a baseline; per-user overrides grant or revoke individual
 * codes on top of it. Resolution happens server-side on every request — NFR-9
 * is explicit that the interface is never the only control.
 *
 * <p>Baselines are {@link EnumSet}s, which are bitmasks over the enum ordinals:
 * membership is a bit test rather than a hash lookup, and the whole set of 36
 * fits in a single {@code long}. That matters because permission resolution
 * happens on every authenticated request.
 *
 * <p>Ported from {@code DEFAULT_ROLE_PERMISSIONS} in the frontend's
 * {@code src/permissions.ts}, pinned by {@code test-vectors.json}.
 */
public enum Role {

    /** Whole business, both outlets. Sole holder of user management and general settings. */
    OWNER("owner", EnumSet.allOf(Permission.class)),

    /** One outlet, operational. Approves below-floor sales and voids, closes the day. */
    MANAGER("manager", EnumSet.of(
            POS_SELL, SALE_DISCOUNT, SALE_APPROVE_BELOW_FLOOR, SALE_VOID, SALE_REFUND,
            SALE_VIEW_ALL, SALE_REPRINT,
            PRICE_VIEW_COST, PRICE_EDIT,
            PRODUCT_CREATE, PRODUCT_EDIT,
            STOCK_VIEW, STOCK_RECEIVE, STOCK_ADJUST, STOCK_APPROVE_ADJUSTMENT, STOCK_OVERSELL,
            SHIFT_OPEN, SHIFT_CLOSE, CASH_MOVEMENT, CASH_VIEW_VARIANCE,
            CUSTOMER_MANAGE, CUSTOMER_CREDIT, SUPPLIER_MANAGE,
            // Records what the branch spends. The P&L itself — REPORT_VIEW_PL —
            // stays with the owner: net profit is the whole cost base, rent and
            // salaries included, which is a different disclosure from the gross
            // margin a manager already needs to do the job.
            EXPENSE_VIEW, EXPENSE_MANAGE,
            REPORT_VIEW, REPORT_VIEW_PROFIT,
            AUDIT_VIEW,
            SETTINGS_APPEARANCE, SETTINGS_TERMINAL,
            SYNC_PUSH)),

    /** Sells. No cost, no profit, no reports anywhere — PRD §11 criterion 7. */
    CASHIER("cashier", EnumSet.of(
            POS_SELL, SALE_DISCOUNT, SALE_REPRINT,
            STOCK_VIEW,
            SHIFT_OPEN, SHIFT_CLOSE,
            CUSTOMER_MANAGE,
            // Closing up includes sending the day to the owner. One-way and
            // audited, so the counter can do it without an owner present.
            SYNC_PUSH)),

    /** Catalogue and stock. Sees cost, cannot sell, cannot see reports. */
    STOREKEEPER("storekeeper", EnumSet.of(
            PRICE_VIEW_COST,
            PRODUCT_CREATE, PRODUCT_EDIT,
            STOCK_VIEW, STOCK_RECEIVE, STOCK_ADJUST,
            SUPPLIER_MANAGE));

    private final String key;
    private final Set<Permission> baseline;

    Role(String key, EnumSet<Permission> baseline) {
        this.key = key;
        this.baseline = java.util.Collections.unmodifiableSet(baseline);
    }

    /** The lowercase key used on the wire and in the database. */
    public String key() {
        return key;
    }

    /** Unmodifiable. Use {@link #resolve} to apply overrides. */
    public Set<Permission> baseline() {
        return baseline;
    }

    public static Optional<Role> ofKey(String key) {
        for (Role role : values()) {
            if (role.key.equals(key)) {
                return Optional.of(role);
            }
        }
        return Optional.empty();
    }

    /**
     * Resolve this role's baseline against per-user overrides — FR-USER-03.
     * {@code TRUE} grants a code the role lacks; {@code FALSE} revokes one it has.
     */
    public EnumSet<Permission> resolve(Map<Permission, Boolean> overrides) {
        EnumSet<Permission> granted = EnumSet.copyOf(baseline);
        if (overrides != null) {
            overrides.forEach((permission, isGranted) -> {
                if (Boolean.TRUE.equals(isGranted)) {
                    granted.add(permission);
                } else {
                    granted.remove(permission);
                }
            });
        }
        return granted;
    }

    public EnumSet<Permission> resolve() {
        return EnumSet.copyOf(baseline);
    }
}
