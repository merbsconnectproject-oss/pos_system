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
import gh.giftedlabs.pos.service.LoginAttemptService;
import gh.giftedlabs.pos.service.AuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Feature A — sign-in, outlet placement, approval PINs.
 *
 * <p>No Spring context and no database. The service depends on interfaces, so
 * the collaborators are stubs and every branch is reachable directly — which is
 * the practical payoff of dependency inversion, not a theoretical one.
 */
@DisplayName("Authentication — FR-AUTH")
class AuthenticationServiceImplTest {

    private static final String IP = "127.0.0.1";
    private static final Instant NOW = Instant.parse("2026-09-12T09:00:00Z");

    private UserRepository users;
    private OutletRepository outlets;
    private PasswordEncoder passwordEncoder;
    private PasswordEncoder pinEncoder;
    private LoginAttemptService loginAttempts;
    private AuditService audit;
    private AuthenticationServiceImpl service;

    private User cashier;
    private Outlet inco;
    private Outlet radiance;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        outlets = mock(OutletRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        pinEncoder = mock(PasswordEncoder.class);
        loginAttempts = mock(LoginAttemptService.class);
        audit = mock(AuditService.class);

        service = new AuthenticationServiceImpl(
                users, outlets, passwordEncoder, pinEncoder, loginAttempts, audit,
                Clock.fixed(NOW, ZoneOffset.UTC));

        inco = outlet("INC", "Inco Hardware");
        radiance = outlet("RAD", "Radiance Lighting");

        cashier = new User("ama", "Ama Mensah", "{argon2}hashed");
        ReflectionTestUtils.setField(cashier, "id", UUID.randomUUID());
        cashier.assignRole(Role.CASHIER);

        when(loginAttempts.check(anyString())).thenReturn(LoginAttemptService.Decision.allow(5));
        when(loginAttempts.recordFailure(anyString())).thenReturn(LoginAttemptService.Decision.allow(4));
    }

    private Outlet outlet(String code, String name) {
        Outlet outlet = new Outlet(code, name);
        ReflectionTestUtils.setField(outlet, "id", UUID.randomUUID());
        return outlet;
    }

    private SignInRequest request(UUID outletId) {
        return new SignInRequest("ama", "correct-horse", outletId);
    }

    private void credentialsAreValid() {
        when(users.findByUsernameOrEmail("ama")).thenReturn(Optional.of(cashier));
        when(passwordEncoder.matches(any(), any())).thenReturn(true);
    }

    // ------------------------------------------------------------ FR-AUTH-01

    @Nested
    @DisplayName("FR-AUTH-01 · sign in with username or email")
    class SignIn {

        @Test
        @DisplayName("a valid sign-in returns the user's resolved permissions")
        void succeeds() {
            credentialsAreValid();
            cashier.assignOutlet(inco.getId());
            when(outlets.findAllById(cashier.getOutletIds())).thenReturn(List.of(inco));

            SignInResult result = service.signIn(request(null), IP);

            assertEquals("ama", result.username());
            assertTrue(result.permissions().contains(Permission.Codes.POS_SELL));
            // PRD §11 criterion 7: a cashier sees no cost, no profit, no reports.
            assertFalse(result.permissions().contains(Permission.Codes.PRICE_VIEW_COST));
            assertFalse(result.permissions().contains(Permission.Codes.REPORT_VIEW));
            verify(loginAttempts).recordSuccess("ama");
        }

        @Test
        @DisplayName("a wrong password and an unknown user are indistinguishable")
        void doesNotLeakWhichUsernamesExist() {
            when(users.findByUsernameOrEmail("ama")).thenReturn(Optional.of(cashier));
            when(passwordEncoder.matches(any(), any())).thenReturn(false);

            var wrongPassword = assertThrows(AuthenticationFailedException.class,
                    () -> service.signIn(request(null), IP));

            when(users.findByUsernameOrEmail("ama")).thenReturn(Optional.empty());
            var noSuchUser = assertThrows(AuthenticationFailedException.class,
                    () -> service.signIn(request(null), IP));

            assertEquals(noSuchUser.getReason(), wrongPassword.getReason());
            assertEquals(noSuchUser.getMessage(), wrongPassword.getMessage());
            assertEquals(Reason.BAD_CREDENTIALS, wrongPassword.getReason());
        }
    }

    // ------------------------------------------------------------ FR-AUTH-08

    /**
     * Nested deliberately. A plain @Test declared on a class that also has
     * @Nested members is not discovered by the default surefire run — it only
     * executes when named explicitly. A silently skipped test on an access
     * control requirement is worse than no test at all.
     */
    @Nested
    @DisplayName("FR-AUTH-08 · deactivated accounts")
    class Deactivated {

        @Test
        @DisplayName("a deactivated user gets a clear message, but only after proving the password")
        void isToldClearly() {
            credentialsAreValid();
            cashier.deactivate();

            var thrown = assertThrows(AuthenticationFailedException.class,
                    () -> service.signIn(request(null), IP));

            assertEquals(Reason.ACCOUNT_DEACTIVATED, thrown.getReason());
            assertTrue(thrown.getMessage().toLowerCase().contains("deactivated"));
        }
    }

    // ------------------------------------------------------------ FR-AUTH-06

    @Nested
    @DisplayName("FR-AUTH-06 · failed attempts are rate limited")
    class RateLimiting {

        @Test
        @DisplayName("a locked-out caller is refused before any hash work happens")
        void refusesBeforeHashing() {
            when(loginAttempts.check("ama"))
                    .thenReturn(LoginAttemptService.Decision.block(Duration.ofMinutes(15)));

            var thrown = assertThrows(AuthenticationFailedException.class,
                    () -> service.signIn(request(null), IP));

            assertEquals(Reason.RATE_LIMITED, thrown.getReason());
            // The point of checking first: no password verification is attempted,
            // so this endpoint cannot be used to burn CPU while locked out.
            verify(passwordEncoder, never()).matches(any(), any());
            verify(users, never()).findByUsernameOrEmail(anyString());
        }

        @Test
        @DisplayName("a failure reports the attempts remaining — A-02")
        void reportsAttemptsRemaining() {
            when(users.findByUsernameOrEmail("ama")).thenReturn(Optional.of(cashier));
            when(passwordEncoder.matches(any(), any())).thenReturn(false);
            when(loginAttempts.recordFailure("ama"))
                    .thenReturn(LoginAttemptService.Decision.allow(2));

            var thrown = assertThrows(AuthenticationFailedException.class,
                    () -> service.signIn(request(null), IP));

            assertEquals(2, thrown.getAttemptsRemaining());
        }
    }

    // ------------------------------------------------------------ FR-AUTH-03

    @Nested
    @DisplayName("FR-AUTH-03 · outlet placement")
    class OutletPlacement {

        @Test
        @DisplayName("one assigned outlet places the user automatically")
        void singleOutletIsAutomatic() {
            credentialsAreValid();
            cashier.assignOutlet(inco.getId());
            when(outlets.findAllById(cashier.getOutletIds())).thenReturn(List.of(inco));

            SignInResult result = service.signIn(request(null), IP);

            assertFalse(result.mustChooseOutlet());
            assertNotNull(result.activeOutlet());
            assertEquals("INC", result.activeOutlet().code());
        }

        @Test
        @DisplayName("two assigned outlets require an explicit choice")
        void multipleOutletsRequireAChoice() {
            credentialsAreValid();
            cashier.assignOutlet(inco.getId());
            cashier.assignOutlet(radiance.getId());
            when(outlets.findAllById(cashier.getOutletIds())).thenReturn(List.of(inco, radiance));

            SignInResult result = service.signIn(request(null), IP);

            assertTrue(result.mustChooseOutlet());
            assertNull(result.activeOutlet());
            assertEquals(2, result.outletChoices().size());
        }

        @Test
        @DisplayName("an unassigned outlet is refused")
        void unassignedOutletIsRefused() {
            credentialsAreValid();
            cashier.assignOutlet(inco.getId());
            when(outlets.findAllById(cashier.getOutletIds())).thenReturn(List.of(inco));

            assertThrows(OutletNotPermittedException.class,
                    () -> service.signIn(request(radiance.getId()), IP));
        }
    }

    // ------------------------------------------------- FR-AUTH-02 · BR-10

    @Nested
    @DisplayName("FR-AUTH-02 · approval PINs")
    class ApprovalPin {

        private User manager;

        @BeforeEach
        void manager() {
            manager = new User("kofi", "Kofi Owusu", "{argon2}hashed");
            ReflectionTestUtils.setField(manager, "id", UUID.randomUUID());
            manager.assignRole(Role.MANAGER);
            manager.setPinHash("{argon2}pin");
            when(users.findById(manager.getId())).thenReturn(Optional.of(manager));
        }

        @Test
        @DisplayName("a correct PIN from a permitted user approves")
        void approves() {
            when(pinEncoder.matches(any(), any())).thenReturn(true);

            assertTrue(service.verifyApprovalPin(
                    manager.getId(), "1234", Permission.SALE_APPROVE_BELOW_FLOOR));
        }

        @Test
        @DisplayName("BR-10 · a valid PIN does not grant a permission the user lacks")
        void pinIsNotAuthority() {
            when(pinEncoder.matches(any(), any())).thenReturn(true);

            // A manager holds no user.manage — the PIN proves who they are,
            // not what they may do.
            assertFalse(service.verifyApprovalPin(
                    manager.getId(), "1234", Permission.USER_MANAGE));
        }

        @Test
        @DisplayName("a wrong PIN is refused and counted")
        void wrongPinIsCounted() {
            when(pinEncoder.matches(any(), any())).thenReturn(false);

            assertFalse(service.verifyApprovalPin(
                    manager.getId(), "0000", Permission.SALE_APPROVE_BELOW_FLOOR));
            verify(loginAttempts).recordFailure("pin:" + manager.getId());
        }

        @Test
        @DisplayName("a user with no PIN set cannot approve")
        void noPinCannotApprove() {
            manager.setPinHash(null);

            assertFalse(service.verifyApprovalPin(
                    manager.getId(), "1234", Permission.SALE_APPROVE_BELOW_FLOOR));
        }
    }
}
