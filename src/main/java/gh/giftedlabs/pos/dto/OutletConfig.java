package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Everything one shop needs to be set up — channel 1, owner → shop.
 *
 * <p>Published to {@code config/{OUTLET}.json} and pulled on **Get
 * configuration**. One-way: a shop never writes any of this back, which is what
 * keeps the channel free of conflict resolution.
 *
 * <p>Ids travel with every record. That is the point of the channel rather than
 * a side effect — a product assigned to both shops keeps <em>one</em> id on both
 * sides, so the owner can ask what the business sold rather than what each shop
 * sold under its own name for the same thing.
 *
 * @param publishedAt when the owner produced it, so a shop can say how old its
 *                    configuration is without guessing from a file timestamp
 */
public record OutletConfig(
        int version,
        /**
         * ISO-8601, as a string.
         *
         * <p>Deliberately not an {@code Instant}. This payload is a file that
         * outlives the process that wrote it and is read by another instance,
         * possibly on a different version — so its format is pinned here rather
         * than inherited from whatever the HTTP mapper happens to be configured
         * with. A timestamp that silently became an epoch number would be read
         * back as a date in 1970.
         */
        String publishedAt,
        Outlet outlet,
        Business business,
        Thresholds thresholds,
        List<Staff> users,
        List<CatalogueItem> products) {

    /** The current shape. Bumped when a field changes meaning, not when one is added. */
    public static final int VERSION = 1;

    public record Outlet(
            UUID id,
            String code,
            String name,
            String tradingName,
            String address,
            String town,
            String phone,
            String receiptFooter,
            String logoUrl) {
    }

    /** Shared across both shops — one business, two trading names. */
    public record Business(
            String companyName,
            String taxRegistrationNumber,
            boolean taxEnabled,
            BigDecimal taxRatePercent,
            String currencyCode,
            String currencySymbol,
            String cashRounding,
            String receiptHeaderMessage,
            String receiptFooterPolicy,
            String accentColor) {
    }

    /** FR-SET-06: the numbers the rules are enforced against. */
    public record Thresholds(
            int idleLockMinutes,
            long adjustmentApprovalPesewas,
            long cashVariancePesewas,
            Map<String, BigDecimal> discountCeilingByRole,
            boolean enforceFloorPriceApproval,
            boolean enforceVoidApproval,
            boolean enforceBlindShiftCount) {
    }

    /**
     * One member of this shop's staff.
     *
     * <p>The hashes travel, not the passwords — there is nothing to reverse and
     * nothing the owner's instance knows that a shop does not need in order to
     * let that person sign in while the line is down.
     *
     * @param permissionOverrides FR-USER-03, by wire code
     */
    public record Staff(
            UUID id,
            String username,
            String fullName,
            String email,
            String phone,
            String passwordHash,
            String pinHash,
            boolean active,
            boolean mustChangePassword,
            List<String> roles,
            Map<String, Boolean> permissionOverrides) {
    }

    /**
     * A product this outlet carries.
     *
     * @param outletPrice the branch's own override, or null to use the base
     *                    price. Pulled down as the owner set it; a manager with
     *                    {@code price.edit} may then change their own branch's
     *                    without touching anybody else's
     */
    public record CatalogueItem(
            UUID id,
            String sku,
            String name,
            String description,
            String brand,
            String category,
            String baseUnit,
            BigDecimal retailPrice,
            BigDecimal tradePrice,
            BigDecimal floorPrice,
            BigDecimal outletPrice,
            List<String> barcodes,
            List<UnitOption> units,
            boolean active) {

        public record UnitOption(String name, BigDecimal conversionFactor) {
        }
    }
}
