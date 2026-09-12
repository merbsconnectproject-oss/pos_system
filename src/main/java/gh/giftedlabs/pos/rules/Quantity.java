package gh.giftedlabs.pos.rules;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Quantity — BR-12.
 *
 * <p>A value type holding a quantity in the <strong>base unit</strong>, always
 * at exactly 3 decimal places. Selling 12.5&nbsp;m off a 100&nbsp;m drum leaves
 * 287.5&nbsp;m across three drums, and that precision has to survive.
 *
 * <p>The compact constructor normalises on construction, so a {@code Quantity}
 * at any other scale cannot exist. BR-12 becomes a property of the type rather
 * than a rule someone has to remember to apply.
 *
 * <p>Ported from {@code roundQuantity} in the frontend's {@code src/money.ts},
 * pinned by {@code test-vectors.json}.
 */
public record Quantity(BigDecimal amount) implements Comparable<Quantity> {

    public static final int SCALE = 3;
    public static final RoundingMode ROUNDING = RoundingMode.HALF_UP;

    public static final Quantity ZERO = Quantity.of(BigDecimal.ZERO);

    public Quantity {
        amount = amount == null
                ? BigDecimal.ZERO.setScale(SCALE, ROUNDING)
                : amount.setScale(SCALE, ROUNDING);
    }

    public static Quantity of(BigDecimal amount) {
        return new Quantity(amount);
    }

    /** Parses an exact decimal — {@code Quantity.of("287.5")}. */
    public static Quantity of(String amount) {
        return new Quantity(new BigDecimal(amount));
    }

    public static Quantity of(long amount) {
        return new Quantity(BigDecimal.valueOf(amount));
    }

    public Quantity plus(Quantity other) {
        return new Quantity(amount.add(other.amount()));
    }

    public Quantity minus(Quantity other) {
        return new Quantity(amount.subtract(other.amount()));
    }

    /** Convert a purchase-unit quantity to base units — FR-UOM-04. */
    public Quantity timesFactor(BigDecimal conversionFactor) {
        return new Quantity(amount.multiply(conversionFactor));
    }

    public boolean isNegative() {
        return amount.signum() < 0;
    }

    public boolean isZero() {
        return amount.signum() == 0;
    }

    public boolean isPositive() {
        return amount.signum() > 0;
    }

    @Override
    public int compareTo(Quantity other) {
        return amount.compareTo(other.amount());
    }

    @Override
    public String toString() {
        return amount.toPlainString();
    }
}
