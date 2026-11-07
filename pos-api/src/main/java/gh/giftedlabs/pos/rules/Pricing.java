package gh.giftedlabs.pos.rules;

import java.math.BigDecimal;

/**
 * What a product costs a customer here — FR-PRICE-03, FR-PRICE-04, FR-PRICE-05.
 *
 * <p>Pure arithmetic over values, like {@link Money} and {@link Costing}: no
 * entity, no repository, no Spring. Prices decide what somebody is charged, and
 * that rule should be readable and testable on its own.
 */
public final class Pricing {

    private Pricing() { }

    /**
     * The three prices in force at one branch — FR-PRICE-03.
     *
     * <p>{@code overridden} says whether this branch departs from the shared
     * price, so a screen can show that without comparing numbers and guessing.
     */
    public record Effective(BigDecimal retail, BigDecimal trade, BigDecimal floor, boolean overridden) {

        /** FR-PRICE-04: the price level this customer type buys at. */
        public BigDecimal at(CustomerType.PriceLevel level) {
            return level == CustomerType.PriceLevel.TRADE ? trade : retail;
        }
    }

    /**
     * AS-6: the branch's price where it has one, the product's otherwise.
     *
     * <p>Level by level rather than all-or-nothing. A branch that charges more
     * for cable but keeps the same floor has overridden one price, and
     * inheriting the other two is the point of a default.
     */
    public static Effective effective(BigDecimal retail, BigDecimal trade, BigDecimal floor,
                                      BigDecimal outletRetail, BigDecimal outletTrade,
                                      BigDecimal outletFloor) {
        boolean overridden = outletRetail != null || outletTrade != null || outletFloor != null;
        return new Effective(
                outletRetail == null ? retail : outletRetail,
                outletTrade == null ? trade : outletTrade,
                outletFloor == null ? floor : outletFloor,
                overridden);
    }

    /**
     * FR-PRICE-05: the price after a customer's standing discount.
     *
     * <p>Rounded half-up to the pesewa at the end, once, because the rate is a
     * percentage of a price rather than of a line: discounting each unit and
     * then multiplying compounds the rounding error by the quantity.
     */
    public static BigDecimal afterCustomerDiscount(BigDecimal price, BigDecimal discountRate) {
        if (discountRate == null || discountRate.signum() <= 0) return price;

        BigDecimal keep = BigDecimal.valueOf(100).subtract(discountRate);
        return price.multiply(keep)
                .divide(BigDecimal.valueOf(100), 4, java.math.RoundingMode.HALF_UP);
    }

    /**
     * FR-PRICE-08: margin as a percentage of the selling price.
     *
     * <p>Of the price, not of the cost. A shop asks "how much of this sale is
     * mine" — mark-up on cost answers a different question and is the larger
     * number, which is exactly why the two get confused.
     *
     * @return null when there is no price to take a margin of, rather than zero
     */
    public static BigDecimal margin(BigDecimal price, BigDecimal cost) {
        if (price == null || price.signum() == 0 || cost == null) return null;
        return price.subtract(cost)
                .multiply(BigDecimal.valueOf(100))
                .divide(price, 1, java.math.RoundingMode.HALF_UP);
    }
}
