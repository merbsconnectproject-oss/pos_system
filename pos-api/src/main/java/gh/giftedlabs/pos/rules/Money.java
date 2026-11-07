package gh.giftedlabs.pos.rules;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Collection;

/**
 * Money — BR-11.
 *
 * <p>A value type over an <strong>integer number of pesewas</strong>.
 * {@code new Money(1850)} is GH&#8373;&nbsp;18.50.
 *
 * <p>BR-11 says money is stored in minor units as integers. Holding that in a
 * {@code long} rather than a {@code BigDecimal} makes the rule
 * <em>structural</em>: a fractional pesewa cannot be represented, so it cannot
 * be persisted, summed or compared into existence. Rounding happens once, at
 * the boundary, in {@link #ofMajor}.
 *
 * <p>It also removes the commonest money bug in this kind of system — mixing
 * major and minor units in the same expression. {@code Money} and {@code long}
 * are different types; the compiler catches the swap that a bare
 * {@code BigDecimal} would let through.
 *
 * <p>Rounding is <strong>half-up</strong>, applied <strong>per line</strong>,
 * with totals summed from already-rounded lines. Two lines of 0.125 therefore
 * total 0.26, not 0.25.
 *
 * <p>Ported from the frontend's {@code src/money.ts} and pinned by
 * {@code test-vectors.json}. If this type and that file disagree, this type is
 * wrong.
 */
public record Money(long pesewas) implements Comparable<Money> {

    public static final Money ZERO = new Money(0L);

    /** Decimal places in a major unit. */
    private static final int MINOR_SCALE = 2;
    public static final RoundingMode ROUNDING = RoundingMode.HALF_UP;

    /** Division precision for intermediate arithmetic; results round back to whole pesewas. */
    public static final MathContext MC = new MathContext(20, RoundingMode.HALF_UP);

    public static Money ofPesewas(long pesewas) {
        return new Money(pesewas);
    }

    /** Major units (GH&#8373; 18.50) to pesewas, rounded half-up exactly once. */
    public static Money ofMajor(BigDecimal major) {
        if (major == null) {
            return ZERO;
        }
        return new Money(major.movePointRight(MINOR_SCALE).setScale(0, ROUNDING).longValueExact());
    }

    /**
     * Parses an exact decimal. Prefer this over {@code ofMajor(BigDecimal.valueOf(double))},
     * which re-introduces the binary float error BR-11 exists to avoid.
     */
    public static Money ofMajor(String major) {
        return ofMajor(new BigDecimal(major));
    }

    /** Sum of already-rounded amounts — BR-11 forbids rounding once at the end. */
    public static Money sum(Collection<Money> amounts) {
        long total = 0L;
        for (Money amount : amounts) {
            total += amount.pesewas();
        }
        return new Money(total);
    }

    /**
     * A line total, rounded once at the line as BR-11 requires.
     *
     * <p><strong>Unit price and discount are {@code BigDecimal}, deliberately.</strong>
     * BR-11's integer-pesewa rule governs <em>stored amounts</em> — totals,
     * payments, cash — not <em>per-unit rates</em>. A price may carry sub-pesewa
     * precision: 3 &times; 18.335 is 55.005, which settles to 55.01. Rounding the
     * price to whole pesewas first gives 55.02, and the error compounds with
     * quantity. The same holds for the discount: 100 &minus; 0.005 settles to
     * 100.00, not 99.99.
     *
     * <p>This is why {@code product.retail_price}, {@code trade_price},
     * {@code floor_price} and {@code sale_item.unit_price} are
     * {@code NUMERIC(12,4)} in the schema, while {@code line_total},
     * {@code subtotal} and {@code payment.amount} are {@code BIGINT} pesewas.
     *
     * <p>Quantity carries 3dp (BR-12) to support cut lengths.
     */
    public static Money lineTotal(Quantity quantity, BigDecimal unitPrice, BigDecimal discount) {
        BigDecimal gross = quantity.amount().multiply(unitPrice);
        return ofMajor(gross.subtract(discount == null ? BigDecimal.ZERO : discount));
    }

    /**
     * A percentage of an amount, in pesewas — FR-POS-10.
     *
     * <p>Rounded HALF_UP like every other money decision here, so a 7.5%
     * discount on GH₵1.00 is 8 pesewas rather than 7. Rounding a concession
     * down would be the shop keeping a pesewa it said it was giving away.
     */
    public static long percentageOf(long pesewas, BigDecimal percent) {
        if (percent == null || percent.signum() <= 0 || pesewas == 0) return 0L;
        return BigDecimal.valueOf(pesewas)
                .multiply(percent)
                .divide(BigDecimal.valueOf(100), 0, ROUNDING)
                .longValueExact();
    }

    /** Major units from pesewas, without first wrapping in a {@code Money}. */
    public static BigDecimal major(long pesewas) {
        return ofPesewas(pesewas).toMajor();
    }

    /** Major units for display, and for arithmetic that must leave the pesewa grid. */
    public BigDecimal toMajor() {
        return BigDecimal.valueOf(pesewas).movePointLeft(MINOR_SCALE).setScale(MINOR_SCALE, ROUNDING);
    }

    public Money plus(Money other) {
        return new Money(pesewas + other.pesewas());
    }

    public Money minus(Money other) {
        return new Money(pesewas - other.pesewas());
    }

    public Money negated() {
        return new Money(-pesewas);
    }

    /** Multiply by a quantity and round back to whole pesewas, once. */
    public Money times(Quantity quantity) {
        return ofMajor(toMajor().multiply(quantity.amount()));
    }

    public boolean isNegative() {
        return pesewas < 0L;
    }

    public boolean isZero() {
        return pesewas == 0L;
    }

    @Override
    public int compareTo(Money other) {
        return Long.compare(pesewas, other.pesewas());
    }

    /** Plain 2dp, no currency symbol — display formatting belongs to the UI. */
    @Override
    public String toString() {
        return toMajor().toPlainString();
    }
}
