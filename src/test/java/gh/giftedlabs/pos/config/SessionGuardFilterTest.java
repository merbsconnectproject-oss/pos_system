package gh.giftedlabs.pos.config;

import gh.giftedlabs.pos.support.ShippedRoleGrants;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.SettingsService;
import gh.giftedlabs.pos.service.ShiftService;
import gh.giftedlabs.pos.service.impl.SessionServiceImpl;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DisplayName("Idle and locked session guard — FR-AUTH-05")
class SessionGuardFilterTest {
    private UserRepository users;
    private SessionGuardFilter filter;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;
    private FilterChain chain;
    private ShiftService shiftService;
    private UUID userId;
    private Instant now;

    @BeforeEach void setUp() {
        users = mock(UserRepository.class); AuditService audit = mock(AuditService.class);
        now = Instant.parse("2026-09-12T10:30:00Z");
        var auth = new PosProperties.Auth(5, Duration.ofMinutes(15), Duration.ofMinutes(15),
                Duration.ofMinutes(15), Duration.ofMinutes(30), "http://localhost/reset", "", "noreply@localhost");
        var props = new PosProperties(new PosProperties.Deployment(PosProperties.Mode.COUNTER, "INC", "01"), auth,
                new PosProperties.Consolidator(false, "", "", Duration.ofMinutes(15), Duration.ofSeconds(10),
                        new PosProperties.Ingest("", Duration.ofMinutes(45))), new PosProperties.Web(""),
                // NFR-6: off in unit tests — nothing here should shell out to pg_dump.
                new PosProperties.Backup(false, java.time.Duration.ofMinutes(15), "backups",
                        java.time.Duration.ofDays(30), java.time.Duration.ofDays(2), "pg_dump",
                        java.time.Duration.ofMinutes(5),
                        new PosProperties.Offsite("", "", "", "", "auto", "")));
        // FR-AUTH-05 now asks the shift service rather than reading a session
        // flag, so the two outcomes are driven by what it answers.
        shiftService = mock(ShiftService.class);
        filter = new SessionGuardFilter(users, props, audit, new ObjectMapper(),
                Clock.fixed(now, ZoneOffset.UTC), new org.springframework.beans.factory.ObjectProvider<>() {
                    @Override public ShiftService getObject() { return shiftService; }
                    @Override public ShiftService getObject(Object... args) { return shiftService; }
                    @Override public ShiftService getIfAvailable() { return shiftService; }
                    @Override public ShiftService getIfUnique() { return shiftService; }
                },
                // FR-SET-06: the idle lock is a setting now. None is configured
                // in this unit test, so the filter falls back to PosProperties
                // — which is the behaviour worth having on this path anyway.
                new org.springframework.beans.factory.ObjectProvider<>() {
                    @Override public SettingsService getObject() { return null; }
                    @Override public SettingsService getObject(Object... args) { return null; }
                    @Override public SettingsService getIfAvailable() { return null; }
                    @Override public SettingsService getIfUnique() { return null; }
                },
                // FR-USER-02: what a role grants is editable, so the filter asks
                // rather than reading the enum. These tests are about the idle
                // lock, and the shipped defaults are the right answer for them.
                new org.springframework.beans.factory.ObjectProvider<>() {
                    private final gh.giftedlabs.pos.service.RolePermissionService grants =
                            new ShippedRoleGrants();
                    @Override public gh.giftedlabs.pos.service.RolePermissionService getObject() { return grants; }
                    @Override public gh.giftedlabs.pos.service.RolePermissionService getObject(Object... args) { return grants; }
                    @Override public gh.giftedlabs.pos.service.RolePermissionService getIfAvailable() { return grants; }
                    @Override public gh.giftedlabs.pos.service.RolePermissionService getIfUnique() { return grants; }
                });
        request = new MockHttpServletRequest("GET", "/api/products"); response = new MockHttpServletResponse();
        chain = mock(FilterChain.class); userId = UUID.randomUUID();
        User user = new User("ama", "Ama", "hash");
        ReflectionTestUtils.setField(user, "credentialsChangedAt", now.minusSeconds(2));
        when(users.findById(userId)).thenReturn(Optional.of(user));
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new PosPrincipal(userId, "ama", UUID.randomUUID(), now.minusSeconds(1)), null, java.util.List.of()));
        request.getSession().setAttribute(SessionServiceImpl.LAST_ACTIVITY, now.minus(Duration.ofMinutes(16)));
        request.getSession().setAttribute(SessionServiceImpl.LOCKED, false);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Nested @DisplayName("idle outcome depends on shift state")
    class Idle {
        @Test void noOpenShiftExpiresSession() throws Exception {
            when(shiftService.openShiftFor(userId)).thenReturn(Optional.empty());
            filter.doFilter(request, response, chain);
            assertEquals(401, response.getStatus()); verifyNoInteractions(chain);
        }
        @Test void openShiftLocksInsteadOfSigningOut() throws Exception {
            when(shiftService.openShiftFor(userId)).thenReturn(Optional.of(UUID.randomUUID()));
            filter.doFilter(request, response, chain);
            assertEquals(423, response.getStatus());
            assertTrue((Boolean) request.getSession().getAttribute(SessionServiceImpl.LOCKED));
        }
    }

    @Nested @DisplayName("locked screen permits only recovery routes")
    class Locked {
        @Test void unlockRoutePassesThrough() throws Exception {
            request.setRequestURI("/api/auth/unlock");
            request.getSession().setAttribute(SessionServiceImpl.LOCKED, true);
            filter.doFilter(request, response, chain);
            verify(chain).doFilter(request, response);
        }
    }
}
