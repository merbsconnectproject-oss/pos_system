package gh.giftedlabs.pos.dto;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * The outcome of a successful sign-in — FR-AUTH-01, FR-AUTH-03.
 *
 * <p>{@code outletChoices} is populated only when the user is assigned to more
 * than one outlet and has not yet chosen. In that state {@code activeOutlet} is
 * null and the client must call outlet selection before doing anything else.
 * Modelling it this way means "not yet placed" is visible in the type rather
 * than inferred from an empty field.
 *
 * <p>Permissions are sent as resolved wire codes so the UI can hide what the
 * user cannot do. NFR-9 is emphatic that this is a convenience, never a
 * control — every endpoint re-checks server-side regardless.
 */
public record SignInResult(
        UUID userId,
        String username,
        String fullName,
        Set<String> roles,
        Set<String> permissions,
        OutletSummary activeOutlet,
        List<OutletSummary> outletChoices,
        boolean mustChooseOutlet,
        boolean pinSet) {

    /** Minimal outlet projection — the sign-in screen needs a name, not the row. */
    public record OutletSummary(UUID id, String code, String name) {
    }
}
