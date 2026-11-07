package gh.giftedlabs.pos.exception;

import java.time.Duration;

/**
 * A sign-in that did not succeed — FR-AUTH-06, FR-AUTH-08.
 *
 * <p>Carries a {@link Reason} so the API layer can decide what to disclose.
 * The distinction matters in two directions and they pull against each other:
 *
 * <ul>
 *   <li>FR-AUTH-08 requires a deactivated user to see a <em>clear message</em>,
 *       so {@link Reason#ACCOUNT_DEACTIVATED} must be distinguishable.</li>
 *   <li>Telling an anonymous caller that a username exists but the password is
 *       wrong is user enumeration. {@link Reason#BAD_CREDENTIALS} therefore
 *       covers both "no such user" and "wrong password", and the API renders
 *       one message for both.</li>
 * </ul>
 *
 * <p>Resolving that tension is a policy decision, which is why it lives in the
 * exception handler rather than being baked into the message here.
 */
public class AuthenticationFailedException extends RuntimeException {

    public enum Reason {
        /** No such user, or the password did not match. Deliberately ambiguous. */
        BAD_CREDENTIALS,
        /** FR-AUTH-08: the account exists but is deactivated. */
        ACCOUNT_DEACTIVATED,
        /** FR-AUTH-06: too many failures; the caller must wait. */
        RATE_LIMITED
    }

    private final Reason reason;
    private final int attemptsRemaining;
    private final Duration retryAfter;

    public AuthenticationFailedException(Reason reason, String message) {
        this(reason, message, 0, Duration.ZERO);
    }

    public AuthenticationFailedException(Reason reason, String message, int attemptsRemaining, Duration retryAfter) {
        super(message);
        this.reason = reason;
        this.attemptsRemaining = attemptsRemaining;
        this.retryAfter = retryAfter;
    }

    public Reason getReason() {
        return reason;
    }

    /** FR-AUTH-06 · A-02: the sign-in screen shows attempts remaining. */
    public int getAttemptsRemaining() {
        return attemptsRemaining;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
