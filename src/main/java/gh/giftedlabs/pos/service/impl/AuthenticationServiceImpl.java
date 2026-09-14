package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.SignInRequest;
import gh.giftedlabs.pos.dto.SignInResult;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.exception.AuthenticationFailedException;
import gh.giftedlabs.pos.exception.AuthenticationFailedException.Reason;
import gh.giftedlabs.pos.exception.OutletNotPermittedException;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.service.AuthenticationService;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.LoginAttemptService;
import gh.giftedlabs.pos.service.LoginAttemptService.Decision;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Sign-in, outlet placement and approval PINs — FR-AUTH.
 *
 * <p>Depends on repository and collaborator <em>interfaces</em> only. Nothing
 * here knows that attempts are counted in memory or that Argon2id does the
 * hashing.
 */
@Service
public class AuthenticationServiceImpl implements AuthenticationService {

    private static final Logger log = LoggerFactory.getLogger(AuthenticationServiceImpl.class);

    private final UserRepository users;
    private final OutletRepository outlets;
    private final PasswordEncoder passwordEncoder;
    private final PasswordEncoder pinEncoder;
    private final LoginAttemptService loginAttempts;
    private final AuditService audit;
    private final Clock clock;

    public AuthenticationServiceImpl(
            UserRepository users,
            OutletRepository outlets,
            PasswordEncoder passwordEncoder,
            @Qualifier("pinEncoder") PasswordEncoder pinEncoder,
            LoginAttemptService loginAttempts,
            AuditService audit,
            Clock clock) {
        this.users = users;
        this.outlets = outlets;
        this.passwordEncoder = passwordEncoder;
        this.pinEncoder = pinEncoder;
        this.loginAttempts = loginAttempts;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional
    public SignInResult signIn(SignInRequest request, String clientIp) {
        String identifier = request.identifier().trim();

        // Checked before any hash work, so a locked-out caller cannot use this
        // endpoint to burn CPU - FR-AUTH-06, NFR-10.
        Decision decision = loginAttempts.check(identifier);
        if (!decision.allowed()) {
            audit.record(null, "AUTH_SIGN_IN_RATE_LIMITED", "user", null, null,
                    java.util.Map.of("identifier", identifier), null, null, clientIp);
            log.warn("Sign-in blocked for '{}' from {} - locked out for a further {}s",
                    identifier, clientIp, decision.retryAfter().toSeconds());
            throw new AuthenticationFailedException(
                    Reason.RATE_LIMITED,
                    "Too many failed attempts. Try again in %d minutes."
                            .formatted(Math.max(1, decision.retryAfter().toMinutes())),
                    0, decision.retryAfter());
        }

        Optional<User> found = users.findByUsernameOrEmail(identifier);

        // A missing user and a wrong password answer identically, so this
        // endpoint cannot be used to discover which usernames exist.
        if (found.isEmpty() || !passwordEncoder.matches(request.password(), found.get().getPasswordHash())) {
            Decision afterFailure = loginAttempts.recordFailure(identifier);
            audit.record(found.map(User::getId).orElse(null), "AUTH_SIGN_IN_FAILED", "user",
                    found.map(User::getId).orElse(null), null,
                    java.util.Map.of("identifier", identifier, "attemptsRemaining", afterFailure.attemptsRemaining()),
                    null, null, clientIp);
            log.warn("Failed sign-in for '{}' from {} - {} attempts remaining",
                    identifier, clientIp, afterFailure.attemptsRemaining());
            throw new AuthenticationFailedException(
                    Reason.BAD_CREDENTIALS,
                    "Username or password is incorrect",
                    afterFailure.attemptsRemaining(),
                    afterFailure.retryAfter());
        }

        User user = found.get();

        // FR-AUTH-08: a deactivated user gets a clear message. Checked AFTER the
        // password so the message is only ever shown to someone who proved they
        // own the account - otherwise it leaks which usernames exist.
        if (!user.isActive()) {
            audit.record(user.getId(), "AUTH_SIGN_IN_DEACTIVATED", "user", user.getId(),
                    null, null, null, null, clientIp);
            log.warn("Sign-in refused for deactivated user '{}' from {}", identifier, clientIp);
            throw new AuthenticationFailedException(
                    Reason.ACCOUNT_DEACTIVATED,
                    "This account has been deactivated. Ask a manager to restore it.");
        }

        loginAttempts.recordSuccess(identifier);
        user.recordLogin(clock.instant());

        return place(user, request.outletId());
    }

    @Override
    @Transactional(readOnly = true)
    public SignInResult selectOutlet(UUID userId, UUID outletId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new AuthenticationFailedException(
                        Reason.BAD_CREDENTIALS, "Session is no longer valid"));

        if (!user.isActive()) {
            throw new AuthenticationFailedException(
                    Reason.ACCOUNT_DEACTIVATED, "This account has been deactivated.");
        }
        if (!user.getOutletIds().contains(outletId)) {
            throw new OutletNotPermittedException(outletId);
        }
        return place(user, outletId);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean verifyApprovalPin(UUID approverId, String pin, Permission required) {
        String throttleKey = "pin:" + approverId;

        if (!loginAttempts.check(throttleKey).allowed()) {
            return false;
        }

        Optional<User> found = users.findById(approverId);
        if (found.isEmpty() || !found.get().isActive() || !found.get().hasPin()) {
            loginAttempts.recordFailure(throttleKey);
            return false;
        }

        User approver = found.get();

        // Both conditions must hold: the PIN proves identity, the permission
        // proves authority. A manager PIN does not make a cashier a manager.
        boolean pinMatches = pinEncoder.matches(pin, approver.getPinHash());
        boolean permitted = approver.resolvePermissions().contains(required);

        if (!pinMatches) {
            loginAttempts.recordFailure(throttleKey);
            log.warn("Failed approval PIN for user {} on {}", approverId, required.code());
            return false;
        }
        if (!permitted) {
            log.warn("User {} presented a valid PIN but lacks {}", approverId, required.code());
            return false;
        }

        loginAttempts.recordSuccess(throttleKey);
        return true;
    }

    /**
     * FR-AUTH-02 · BR-10: identify the manager behind a counter override.
     *
     * <p>Throttled on the outlet rather than on a user, because the caller does
     * not yet know who is being identified — without that, an attacker could
     * try a PIN against every manager in turn for free.
     *
     * <p>Every candidate's hash is compared even after a match, so the time
     * taken does not reveal how far down the list the right person was.
     */
    @Override
    @Transactional(readOnly = true)
    public String nameOf(UUID userId) {
        return users.findById(userId).map(User::getFullName).orElse("(removed)");
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UUID> findApprover(String pin, Permission required, UUID outletId) {
        String throttleKey = "approve:" + outletId;
        if (!loginAttempts.check(throttleKey).allowed()) return Optional.empty();

        UUID approver = null;
        for (User candidate : users.findActiveAtOutlet(outletId)) {
            if (!candidate.hasPin() || !candidate.resolvePermissions().contains(required)) continue;
            if (pinEncoder.matches(pin, candidate.getPinHash()) && approver == null) {
                approver = candidate.getId();
            }
        }

        if (approver == null) {
            loginAttempts.recordFailure(throttleKey);
            log.warn("Failed counter override for {} at outlet {}", required.code(), outletId);
            return Optional.empty();
        }
        loginAttempts.recordSuccess(throttleKey);
        return Optional.of(approver);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean verifyOwnPin(UUID userId, String pin) {
        String throttleKey = "unlock:" + userId;
        if (!loginAttempts.check(throttleKey).allowed()) return false;
        Optional<User> found = users.findById(userId);
        if (found.isEmpty() || !found.get().isActive() || !found.get().hasPin()
                || !pinEncoder.matches(pin, found.get().getPinHash())) {
            loginAttempts.recordFailure(throttleKey);
            return false;
        }
        loginAttempts.recordSuccess(throttleKey);
        return true;
    }

    /**
     * FR-AUTH-03. One assigned outlet places the user automatically; several
     * means the client must choose, and {@code mustChooseOutlet} says so rather
     * than leaving the caller to infer it from a null.
     */
    private SignInResult place(User user, UUID requestedOutletId) {
        List<Outlet> assigned = outlets.findAllById(user.getOutletIds()).stream()
                .filter(Outlet::isActive)
                .sorted(Comparator.comparing(Outlet::getName))
                .toList();

        Outlet active = null;
        if (requestedOutletId != null) {
            active = assigned.stream()
                    .filter(outlet -> outlet.getId().equals(requestedOutletId))
                    .findFirst()
                    .orElseThrow(() -> new OutletNotPermittedException(requestedOutletId));
        } else if (assigned.size() == 1) {
            active = assigned.getFirst();
        }

        Set<String> permissions = user.resolvePermissions().stream()
                .map(Permission::code)
                .collect(Collectors.toUnmodifiableSet());

        Set<String> roles = user.getRoles().stream()
                .map(Role::key)
                .collect(Collectors.toUnmodifiableSet());

        return new SignInResult(
                user.getId(),
                user.getUsername(),
                user.getFullName(),
                roles,
                permissions,
                summarise(active),
                assigned.stream().map(this::summarise).toList(),
                active == null,
                user.hasPin());
    }

    private SignInResult.OutletSummary summarise(Outlet outlet) {
        return outlet == null
                ? null
                : new SignInResult.OutletSummary(outlet.getId(), outlet.getCode(), outlet.getName());
    }
}
