package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.SignInRequest;
import gh.giftedlabs.pos.dto.SignInResult;

import java.util.UUID;

/**
 * Sign-in and counter-level approval — FR-AUTH-01, 02, 03, 06, 08.
 *
 * <p>Deliberately narrow. Session lifetime belongs to {@link SessionService}
 * and screen locking to {@link ScreenLockService}, because FR-AUTH-05 makes
 * them different outcomes: an idle POS with an open shift <em>locks</em>, it
 * does not sign out. Fusing the three is precisely how that requirement gets
 * implemented wrongly.
 */
public interface AuthenticationService {

    /**
     * FR-AUTH-01: sign in with a username or an email.
     *
     * @throws gh.giftedlabs.pos.exception.AuthenticationFailedException on bad
     *         credentials, a deactivated account (FR-AUTH-08) or lockout
     *         (FR-AUTH-06)
     */
    SignInResult signIn(SignInRequest request, String clientIp);

    /**
     * FR-AUTH-03: place the user in an outlet after sign-in.
     *
     * <p>A user assigned to one outlet is placed automatically by
     * {@link #signIn}; this is the explicit choice made by a user assigned to
     * several.
     *
     * @throws gh.giftedlabs.pos.exception.OutletNotPermittedException if the
     *         user is not assigned to that outlet
     */
    SignInResult selectOutlet(UUID userId, UUID outletId);

    /**
     * Verify a manager PIN for a counter-level approval — FR-AUTH-02, BR-10.
     *
     * <p>Not a sign-in. It answers one question: may <em>this</em> user approve
     * <em>this</em> action right now. The caller records the approver on the
     * sale; this method never mutates a session.
     *
     * @return true when the PIN matches and the user holds the permission
     */
    boolean verifyApprovalPin(UUID approverId, String pin, gh.giftedlabs.pos.rules.Permission required);

    /** FR-AUTH-04: verify the signed-in shift owner's own PIN for unlock. */
    boolean verifyOwnPin(UUID userId, String pin);
}
