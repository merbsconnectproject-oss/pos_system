package gh.giftedlabs.pos.exception;

import java.util.Map;
import java.util.UUID;

/** A shift that cannot be opened or closed as asked — FR-CASH, BR-13. */
public class ShiftException extends RuntimeException {
    private final String code;
    private final Map<String, Object> details;

    private ShiftException(String code, String message, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    /** BR-13: one open shift per user. */
    public static ShiftException cashierAlreadyOpen(UUID shiftId) {
        return new ShiftException("SHIFT_ALREADY_OPEN",
                "You already have an open shift. Close it before opening another.",
                shiftId == null ? Map.of() : Map.of("shiftId", shiftId.toString()));
    }

    /** BR-13: one open shift per till. */
    public static ShiftException terminalAlreadyOpen(String terminalCode, String cashier) {
        return new ShiftException("TERMINAL_ALREADY_OPEN",
                "%s already has an open shift, held by %s.".formatted(terminalCode, cashier),
                Map.of("terminal", terminalCode, "cashier", cashier));
    }

    /** FR-CASH-09. */
    public static ShiftException alreadyClosed() {
        return new ShiftException("SHIFT_CLOSED",
                "This shift is closed. Corrections are recorded as cash movements, not by reopening it.",
                Map.of());
    }

    /** FR-CASH-06: a large variance is not accepted silently. */
    public static ShiftException varianceNeedsExplanation(long variance, long threshold) {
        return new ShiftException("VARIANCE_NEEDS_NOTE",
                "The drawer is out by %s, past the %s threshold. Explain the difference before closing."
                        .formatted(major(Math.abs(variance)), major(threshold)),
                Map.of("variance", variance, "threshold", threshold));
    }

    /** FR-POS-02 · BR-13: selling with no shift open. */
    public static ShiftException noOpenShift() {
        return new ShiftException("NO_OPEN_SHIFT",
                "Open a shift before selling, so the takings can be counted against it.",
                Map.of());
    }

    public String getCode() { return code; }
    public Map<String, Object> getDetails() { return details; }

    private static String major(long pesewas) {
        return java.math.BigDecimal.valueOf(pesewas, 2).toPlainString();
    }
}
