package gh.giftedlabs.pos.rules;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Quantity — BR-12.
 *
 * <p>Quantities are stored to 3 decimal places in the base unit, to support
 * cut lengths: 12.5 m off a 100 m drum leaves 287.5 m across three drums.
 *
 * <p>Port of {@code roundQuantity} in the frontend's {@code src/money.ts},
 * pinned by {@code docs/contract/test-vectors.json}.
 */
public final class Quantity {

    public static final int SCALE = 3;
    public static final RoundingMode ROUNDING = RoundingMode.HALF_UP;

    private Quantity() {
    }

    public static BigDecimal round(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(SCALE, ROUNDING);
        }
        return value.setScale(SCALE, ROUNDING);
    }
}
