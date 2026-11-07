package gh.giftedlabs.pos.exception;

import java.util.UUID;

/**
 * A user tried to act in an outlet they are not assigned to — FR-AUTH-03.
 *
 * <p>Separate from {@link AuthenticationFailedException} because the user is
 * authenticated; it is authorisation that failed. Collapsing the two would make
 * the API answer 401 where 403 is correct, and would push a signed-in user back
 * to the sign-in screen for what is a permissions problem.
 */
public class OutletNotPermittedException extends RuntimeException {

    private final UUID outletId;

    public OutletNotPermittedException(UUID outletId) {
        super("You are not assigned to this outlet");
        this.outletId = outletId;
    }

    public UUID getOutletId() {
        return outletId;
    }
}
