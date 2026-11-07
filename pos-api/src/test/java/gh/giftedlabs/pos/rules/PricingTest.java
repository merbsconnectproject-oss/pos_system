package gh.giftedlabs.pos.rules;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * FR-PRICE-03, FR-PRICE-05, FR-PRICE-08.
 *
 * <p>These are the numbers a customer is charged and the number an owner
 * decides by, so they are tested as arithmetic before anything wires them up.
 */
@DisplayName("Pricing")
class PricingTest {

    private static BigDecimal money(String value) { return new BigDecimal(value); }

    @Nested
    @DisplayName("a branch's prices — FR-PRICE-03")
    class Effective {

        @Test
        @DisplayName("no override is the product's own prices")
        void defaultsWhenNothingOverridden() {
            var effective = Pricing.effective(money("60.00"), money("50.00"), money("30.00"),
                    null, null, null);

            assertEquals(money("60.00"), effective.retail());
            assertEquals(money("50.00"), effective.trade());
            assertEquals(money("30.00"), effective.floor());
            assertFalse(effective.overridden());
        }

        @Test
        @DisplayName("one level overridden leaves the other two inherited")
        void levelsAreIndependent() {
            // A branch that charges more for retail but keeps the same floor.
            var effective = Pricing.effective(money("60.00"), money("50.00"), money("30.00"),
                    money("72.00"), null, null);

            assertEquals(money("72.00"), effective.retail());
            assertEquals(money("50.00"), effective.trade(), "trade should still be the product's");
            assertEquals(money("30.00"), effective.floor(), "the floor should still be the product's");
            assertTrue(effective.overridden());
        }

        @Test
        @DisplayName("a zero override is a price of zero, not an absence")
        void zeroIsAPrice() {
            var effective = Pricing.effective(money("60.00"), money("50.00"), money("30.00"),
                    null, money("0.00"), null);

            assertEquals(money("0.00"), effective.trade(),
                    "a deliberate zero must not be read as 'no override'");
        }

        @Test
        @DisplayName("the customer's type picks the level — FR-PRICE-04")
        void theTypePicksTheLevel() {
            var effective = Pricing.effective(money("60.00"), money("50.00"), money("30.00"),
                    null, null, null);

            assertEquals(money("60.00"), effective.at(CustomerType.PriceLevel.RETAIL));
            assertEquals(money("50.00"), effective.at(CustomerType.PriceLevel.TRADE));
            assertEquals(money("50.00"), effective.at(CustomerType.ELECTRICIAN.priceLevel()));
            assertEquals(money("60.00"), effective.at(CustomerType.RETAIL.priceLevel()));
        }
    }

    @Nested
    @DisplayName("a customer's standing discount — FR-PRICE-05")
    class CustomerDiscount {

        @Test
        @DisplayName("takes the agreed percentage off")
        void takesThePercentageOff() {
            assertEquals(0, money("46.0000").compareTo(
                    Pricing.afterCustomerDiscount(money("50.00"), money("8"))));
        }

        @Test
        @DisplayName("no rate, zero rate and null all leave the price alone")
        void noRateChangesNothing() {
            assertEquals(money("50.00"), Pricing.afterCustomerDiscount(money("50.00"), null));
            assertEquals(money("50.00"), Pricing.afterCustomerDiscount(money("50.00"), BigDecimal.ZERO));
        }

        @Test
        @DisplayName("is taken once, on the price, not per unit")
        void roundsOnceRatherThanPerUnit() {
            // 7.5% off 13.33 is 12.33025. Rounding that to the pesewa first and
            // then multiplying by 100 units loses 2.5 pesewas a unit — GH₵ 2.50
            // on one line, which is the kind of gap a shop notices at the till
            // and cannot explain.
            BigDecimal perUnit = Pricing.afterCustomerDiscount(money("13.33"), money("7.5"));
            assertEquals(0, money("12.3303").compareTo(perUnit),
                    "four decimal places are kept so the line total rounds once, per BR-11");
        }
    }

    @Nested
    @DisplayName("margin — FR-PRICE-08")
    class Margin {

        @Test
        @DisplayName("is a share of the selling price, not a mark-up on cost")
        void marginNotMarkup() {
            // 40.00 sold at a cost of 30.00: a quarter of the sale is margin.
            // The mark-up would be 33.3%, and the two get confused constantly.
            assertEquals(0, money("25.0").compareTo(Pricing.margin(money("40.00"), money("30.00"))));
        }

        @Test
        @DisplayName("a loss is a negative margin, not a floor of zero")
        void lossesShowAsLosses() {
            assertEquals(0, money("-50.0").compareTo(Pricing.margin(money("20.00"), money("30.00"))),
                    "selling below cost should read as a loss, not as zero margin");
        }

        @Test
        @DisplayName("no price or no cost is no margin, rather than zero")
        void unknownIsNotZero() {
            assertNull(Pricing.margin(BigDecimal.ZERO, money("30.00")));
            assertNull(Pricing.margin(money("40.00"), null));
        }
    }
}
