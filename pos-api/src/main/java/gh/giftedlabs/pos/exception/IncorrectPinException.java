package gh.giftedlabs.pos.exception;

/**
 * A wrong unlock PIN — FR-AUTH-04.
 *
 * <p>Distinct from {@link SessionAuthenticationException} on purpose. Both are
 * {@code 401}, but they ask the client for opposite things: a dead session must
 * return the cashier to the sign-in screen, whereas a mistyped PIN must leave
 * them exactly where they are, shift intact, with an inline message. Sharing one
 * code would force the client to choose, and either choice is wrong half the
 * time.
 */
public class IncorrectPinException extends RuntimeException {
    public IncorrectPinException(String message) {
        super(message);
    }
}
