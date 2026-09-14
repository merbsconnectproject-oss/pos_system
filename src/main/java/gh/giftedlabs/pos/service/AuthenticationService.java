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

    /**
     * FR-AUTH-02 · BR-10: who this PIN belongs to, if they may authorise it.
     *
     * <p>A counter override asks for a PIN and nothing else — the manager does
     * not stop to type a username — so the PIN has to identify them. Only staff
     * assigned to this outlet who hold the permission are considered, which
     * keeps the search small and means a PIN cannot authorise something its
     * owner is not entitled to.
     *
     * @return the approver's id, or empty if no permitted holder matches
     */
    /** The approver's display name, for the line that records who authorised it. */
    String nameOf(UUID userId);

    java.util.Optional<UUID> findApprover(String pin, gh.giftedlabs.pos.rules.Permission required, UUID outletId);

    /** FR-AUTH-04: verify the signed-in shift owner's own PIN for unlock. */
    boolean verifyOwnPin(UUID userId, String pin);

    /**
     * FR-AUTH-02 · FR-USER-01: set your own approval PIN.
     *
     * <p>Self-service on purpose. An approval PIN identifies the approver, so
     * one that somebody else chose — or that everybody shares — makes the
     * approvals it authorises anonymous, which is the one thing they exist not
     * to be.
     *
     * <p>The current password is required. Without it, an unattended session is
     * enough for a passer-by to mint themselves an approval credential that
     * outlives the session they borrowed.
     *
     * @throws gh.giftedlabs.pos.exception.AuthenticationFailedException if the
     *         password does not match
     */
    void changeOwnPin(UUID userId, String currentPassword, String newPin, String clientIp);

    /**
     * FR-AUTH-07: choose your own password.
     *
     * <p>The only path that clears the must-change flag an administrator's
     * password set. A reset by somebody else changes the password and leaves
     * the flag standing, because the point of the flag is that two people know
     * the current one.
     */
    void changeOwnPassword(UUID userId, String currentPassword, String newPassword, String clientIp);

    /**
     * This user as they stand now, with no credential check.
     *
     * <p>For re-reading a session whose user has changed underneath it — a
     * password chosen, a permission granted. It proves nothing by itself and
     * must never be called on anything but an already-authenticated session.
     */
    SignInResult describe(UUID userId, UUID activeOutletId);
}
