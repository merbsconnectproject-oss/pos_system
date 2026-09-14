package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Stock for one product at one outlet — BR-1.
 *
 * <p>Always carries its outlet. There is no shape in this API for "the stock of
 * a product" without one, because BR-1 says no such number exists.
 */
public record StockView(
        UUID productId,
        UUID outletId,
        BigDecimal quantity,
        /** BR-4 · FR-PRICE-07: null for a caller without {@code price.view_cost}. */
        BigDecimal averageCost,
        /**
         * FR-PRICE-08: the unit cost of the most recent receipt at this branch.
         *
         * <p>What it would cost to replace what was just sold, as opposed to
         * the weighted average of what is on the shelf. The two answer
         * different questions and an owner needs both: one says what the sale
         * earned, the other says whether the price still works.
         *
         * <p>Filled only where a screen shows one product, because finding it
         * for a whole catalogue is a query per row.
         */
        BigDecimal lastPurchaseCost,
        BigDecimal reorderLevel,
        boolean low) {

    /** A product never stocked here is zero, not absent — the counter asks either way. */
    public static StockView empty(UUID productId, UUID outletId) {
        return new StockView(productId, outletId, BigDecimal.ZERO, BigDecimal.ZERO, null,
                BigDecimal.ZERO, true);
    }

    /**
     * FR-PRICE-07: the same row with no cost in it.
     *
     * <p>Removed rather than zeroed. A zero cost reads as "this was free",
     * which is a claim; absent reads as "you were not told", which is true.
     */
    public StockView withoutCost() {
        return new StockView(productId, outletId, quantity, null, null, reorderLevel, low);
    }
}
