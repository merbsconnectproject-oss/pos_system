package gh.giftedlabs.pos.rules;

import java.math.BigDecimal;

/**
 * Weighted average cost — BR-4.
 *
 * <pre>
 * new_avg = ((qty_on_hand x current_avg) + (qty_received x unit_cost))
 *           / (qty_on_hand + qty_received)
 * </pre>
 *
 * <p>Calculated <strong>per outlet</strong> — BR-1 is explicit that there is no
 * global quantity anywhere in the system, and AS-8 puts costing at the same
 * grain. The result is what a goods receipt writes to
 * {@code stock_level.avg_cost}, and what a sale later freezes onto its line
 * (BR-5) so that later price changes never alter historical profit.
 *
 * <p>Ported from the frontend's {@code src/stockCosting.ts}.
 */
public final class Costing {

    private Costing() {
    }

    public static Money weightedAverageCost(
            Quantity quantityOnHand,
            Money currentAverage,
            Quantity quantityReceivedBase,
            Money unitCostPerBase) {

        Quantity total = quantityOnHand.plus(quantityReceivedBase);

        // Nothing on hand and nothing received: the receipt cost is the average.
        if (!total.isPositive()) {
            return unitCostPerBase;
        }

        BigDecimal numerator = quantityOnHand.amount().multiply(currentAverage.toMajor())
                .add(quantityReceivedBase.amount().multiply(unitCostPerBase.toMajor()));

        return Money.ofMajor(numerator.divide(total.amount(), Money.MC));
    }

    /**
     * A purchase unit cost converted to a per-base-unit cost — FR-UOM-05.
     * A 100 m drum costing 450 is 4.50 per metre.
     *
     * <p>A factor of zero or less falls back to the unit cost rather than
     * dividing, matching the frontend's guard.
     */
    public static Money costPerBaseUnit(Money purchaseUnitCost, BigDecimal conversionFactor) {
        if (conversionFactor == null || conversionFactor.signum() <= 0) {
            return purchaseUnitCost;
        }
        return Money.ofMajor(purchaseUnitCost.toMajor().divide(conversionFactor, Money.MC));
    }
}
