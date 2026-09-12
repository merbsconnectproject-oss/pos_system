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
 * <p>Calculated <strong>per outlet</strong>. The result is what a goods receipt
 * writes to {@code stock_level.avg_cost}, and what a sale later freezes onto
 * its line (BR-5) so that later price changes never alter historical profit.
 *
 * <p>Port of the frontend's {@code src/stockCosting.ts}.
 */
public final class Costing {

    private Costing() {
    }

    public static BigDecimal weightedAverageCost(
            BigDecimal quantityOnHand,
            BigDecimal currentAverage,
            BigDecimal quantityReceivedBase,
            BigDecimal unitCostPerBase) {

        BigDecimal onHand = Quantity.round(quantityOnHand);
        BigDecimal received = Quantity.round(quantityReceivedBase);
        BigDecimal total = onHand.add(received);

        if (total.compareTo(BigDecimal.ZERO) <= 0) {
            return Money.round(unitCostPerBase);
        }

        BigDecimal numerator = onHand.multiply(currentAverage)
                .add(received.multiply(unitCostPerBase));

        return Money.round(numerator.divide(total, Money.MC));
    }

    /**
     * A purchase unit cost converted to a per-base-unit cost — FR-UOM-05.
     * A drum of 100 m costing 450 is 4.50 per metre.
     *
     * <p>A conversion factor of zero or less falls back to the unit cost rather
     * than dividing, matching the frontend's guard.
     */
    public static BigDecimal costPerBaseUnit(BigDecimal purchaseUnitCost, BigDecimal conversionFactor) {
        if (conversionFactor == null || conversionFactor.compareTo(BigDecimal.ZERO) <= 0) {
            return purchaseUnitCost;
        }
        return purchaseUnitCost.divide(conversionFactor, Money.MC);
    }
}
