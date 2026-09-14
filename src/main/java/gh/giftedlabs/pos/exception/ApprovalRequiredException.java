package gh.giftedlabs.pos.exception;

import java.math.BigDecimal;
import java.util.Map;

/**
 * FR-INV-06: this is worth too much to be done unapproved.
 *
 * <p>Distinct from a plain refusal because the client can act on it: the
 * answer is to fetch an approver, not to give up. The threshold travels with
 * it so the screen can say how much, rather than "too much".
 */
public class ApprovalRequiredException extends RuntimeException {

    private final Map<String, Object> details;

    public ApprovalRequiredException(String message, Map<String, Object> details) {
        super(message);
        this.details = details;
    }

    /** The value of an adjustment that passed the configured threshold. */
    public static ApprovalRequiredException adjustment(BigDecimal value, long thresholdPesewas) {
        BigDecimal threshold = BigDecimal.valueOf(thresholdPesewas).movePointLeft(2);
        return new ApprovalRequiredException(
                "This adjustment is worth GH₵ %s, past the GH₵ %s that may be entered without approval."
                        .formatted(value.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString(),
                                threshold.toPlainString()),
                Map.of("value", value, "threshold", threshold));
    }

    public Map<String, Object> getDetails() { return details; }
}
