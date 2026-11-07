package gh.giftedlabs.pos.dto;

import java.util.Map;

/**
 * The single error shape for every endpoint.
 *
 * @param code    a stable machine-readable token the client can branch on;
 *                never a message, so copy changes do not break the UI
 * @param message text safe to show a cashier — plain, actionable, no internals
 * @param details per-field validation messages, attempts remaining, retry
 *                windows. Empty rather than null so clients need no null check
 */
public record ApiError(String code, String message, Map<String, Object> details) {

    public ApiError {
        details = details == null ? Map.of() : Map.copyOf(details);
    }
}
