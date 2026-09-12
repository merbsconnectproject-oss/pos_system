package gh.giftedlabs.pos.rules;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.List;

/**
 * Money — BR-11.
 *
 * <p>On the wire and in the database, money is an <strong>integer number of
 * pesewas</strong>. {@code 1850} is GH&#8373; 18.50. There are no fractional
 * pesewas and no floats in storage.
 *
 * <p>Rounding is <strong>half-up</strong>, applied <strong>per line</strong>,
 * and totals are summed from already-rounded lines — never rounded once at the
 * end. Two lines of 0.125 therefore total 0.26, not 0.25.
 *
 * <p>This is a port of the frontend's {@code src/money.ts}. Neither side owns
 * the expected values: both are tested against
 * {@code docs/contract/test-vectors.json}. If this class and that file
 * disagree, this class is wrong.
 */
public final class Money {

    public static final int SCALE = 2;
    public static final RoundingMode ROUNDING = RoundingMode.HALF_UP;

    /** Division precision. Results are always rounded back to {@link #SCALE}. */
    public static final MathContext MC = new MathContext(20, RoundingMode.HALF_UP);

    private Money() {
    }

    /** Half-up to 2dp, away from zero for negatives (refunds). */
    public static BigDecimal round(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(SCALE, ROUNDING);
        }
        return value.setScale(SCALE, ROUNDING);
    }

    /** Major units (GH&#8373; 18.50) to wire format (1850). */
    public static long toPesewas(BigDecimal major) {
        if (major == null) {
            return 0L;
        }
        return major.movePointRight(SCALE).setScale(0, ROUNDING).longValueExact();
    }

    /** Wire format (1850) to major units (18.50). */
    public static BigDecimal fromPesewas(long minor) {
        return BigDecimal.valueOf(minor).movePointLeft(SCALE).setScale(SCALE, ROUNDING);
    }

    /**
     * A line total, rounded once at the line as BR-11 requires.
     * Quantity is held to 3dp (BR-12) to support cut lengths.
     */
    public static BigDecimal lineTotal(BigDecimal quantity, BigDecimal unitPrice, BigDecimal discount) {
        BigDecimal off = discount == null ? BigDecimal.ZERO : discount;
        return round(Quantity.round(quantity).multiply(unitPrice).subtract(off));
    }

    /** Sum of already-rounded line values. */
    public static BigDecimal sum(List<BigDecimal> values) {
        BigDecimal total = BigDecimal.ZERO;
        for (BigDecimal value : values) {
            total = total.add(round(value));
        }
        return round(total);
    }

    /** Exact money equality, to the pesewa. */
    public static boolean equal(BigDecimal a, BigDecimal b) {
        return toPesewas(a) == toPesewas(b);
    }
}
