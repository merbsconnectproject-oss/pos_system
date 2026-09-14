package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.SignInResult;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.AuthenticationService;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DisplayName("Authenticated sessions — FR-AUTH-01/03/04/08")
class SessionServiceImplTest {
    private AuthenticationService authentication;
    private UserRepository users;
    private AuditService audit;
    private SessionServiceImpl service;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;
    private User user;
    private UUID userId;
    private UUID outletId;

    @BeforeEach void setUp() {
        authentication = mock(AuthenticationService.class); users = mock(UserRepository.class); audit = mock(AuditService.class);
        service = new SessionServiceImpl(authentication, users, audit,
                Clock.fixed(Instant.parse("2026-09-12T10:00:00Z"), ZoneOffset.UTC));
        request = new MockHttpServletRequest(); response = new MockHttpServletResponse();
        userId = UUID.randomUUID(); outletId = UUID.randomUUID();
        user = new User("ama", "Ama", "{argon2}hash"); ReflectionTestUtils.setField(user, "id", userId);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private SignInResult result(UUID outlet) {
        return new SignInResult(userId, "ama", "Ama", Set.of("cashier"), Set.of("pos.sell"),
                outlet == null ? null : new SignInResult.OutletSummary(outlet, "INC", "Inco"),
                List.of(), outlet == null, true, false);
    }

    @Nested @DisplayName("FR-AUTH-01 · successful sign-in establishes a server session")
    class Establish {
        @Test void establishesPrincipalAndAuthorities() {
            service.establish(result(outletId), request, response, "127.0.0.1");
            assertInstanceOf(PosPrincipal.class, SecurityContextHolder.getContext().getAuthentication().getPrincipal());
            assertTrue(SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
                    .anyMatch(value -> value.getAuthority().equals("pos.sell")));
            assertNotNull(request.getSession(false));
            assertNotNull(request.getSession().getAttribute("SPRING_SECURITY_CONTEXT"));
        }
    }

    @Nested @DisplayName("FR-AUTH-03 · outlet choice belongs to the signed-in user")
    class OutletChoice {
        @Test void usesPrincipalUserId() {
            service.establish(result(null), request, response, "127.0.0.1");
            when(authentication.selectOutlet(userId, outletId)).thenReturn(result(outletId));
            service.selectOutlet(outletId, request, response, "127.0.0.1");
            verify(authentication).selectOutlet(userId, outletId);
        }
    }

    @Nested @DisplayName("FR-AUTH-04 · lock and unlock preserve the session")
    class Locking {
        @Test void validOwnerPinUnlocksSameSession() {
            service.establish(result(outletId), request, response, "127.0.0.1");
            String sessionId = request.getSession().getId();
            service.lock(request, "127.0.0.1");
            when(authentication.verifyOwnPin(userId, "1234")).thenReturn(true);
            service.unlock("1234", request, "127.0.0.1");
            assertEquals(sessionId, request.getSession().getId());
            assertFalse((Boolean) request.getSession().getAttribute(SessionServiceImpl.LOCKED));
        }
    }

    @Nested @DisplayName("FR-AUTH-08 · deactivation revokes an existing session")
    class Deactivation {
        @Test void currentSessionRechecksActiveUser() {
            service.establish(result(outletId), request, response, "127.0.0.1");
            user.deactivate(); when(users.findById(userId)).thenReturn(Optional.of(user));
            assertThrows(RuntimeException.class, () -> service.current(request));
        }
    }
}
