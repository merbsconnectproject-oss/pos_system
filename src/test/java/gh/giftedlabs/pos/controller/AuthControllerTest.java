package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.service.LoginAttemptService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The HTTP contract of {@code /api/auth/**}, exercised through the real filter
 * chain — FR-AUTH-01, FR-AUTH-03, FR-AUTH-04, NFR-9, NFR-10.
 *
 * <p>The service tests prove the decisions; this proves the wiring. Status
 * codes, the {@code ApiError} body shape, CSRF and the session guard are all
 * decided by filters and configuration that no service test can observe — the
 * missing 401 entry point was invisible to a fully green service suite because
 * Spring answered it before any tested code ran.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Auth HTTP contract")
class AuthControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";
    private static final String PIN = "4321";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;
    @Autowired @Qualifier("pinEncoder") PasswordEncoder pins;

    private String username;
    private UUID outletId;

    /**
     * Seeds committed, uniquely-named data rather than rolling back.
     *
     * <p>{@code @Transactional} would be the reflex here and it does not work:
     * {@link gh.giftedlabs.pos.service.AuditService} writes in
     * {@code REQUIRES_NEW} so an audit entry survives a rolled-back business
     * transaction — correct for BR-15, and it means the audit insert cannot see
     * a user the test has not committed. Names are unique per test instead, and
     * the container is discarded at the end of the run.
     */
    @BeforeEach
    void seedOneCashier() {
        // Unique per test: the rate limiter is process-wide and keyed by
        // identifier, so a shared name would leak lockouts between tests.
        username = "cashier-" + UUID.randomUUID().toString().substring(0, 8);

        // BR-6: the code is the receipt segment, so it must stay hyphen-free.
        Outlet outlet = outlets.save(new Outlet(
                "T" + username.substring(8, 12).toUpperCase(), "Test Outlet " + username));
        outletId = outlet.getId();

        User user = new User(username, "Test Cashier", passwords.encode(PASSWORD));
        user.setEmail(username + "@example.com");
        user.setPinHash(pins.encode(PIN));
        user.assignRole(Role.OWNER);
        user.assignOutlet(outletId);
        users.save(user);

        loginAttempts.recordSuccess(username);
    }

    @Nested
    @DisplayName("an unauthenticated caller")
    class Unauthenticated {

        @Test
        @DisplayName("is told to sign in with 401, not a bodiless 403")
        void getsUnauthorizedNotForbidden() throws Exception {
            mvc.perform(get("/api/auth/session"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("NOT_AUTHENTICATED"))
                    .andExpect(jsonPath("$.message").value("Sign in to continue"));
        }

        @Test
        @DisplayName("may fetch a CSRF token so the sign-in form can post")
        void mayFetchCsrf() throws Exception {
            mvc.perform(get("/api/auth/csrf"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.headerName").value("X-XSRF-TOKEN"))
                    .andExpect(jsonPath("$.token").isNotEmpty());
        }

        @Test
        @DisplayName("cannot sign in without the CSRF header — NFR-9")
        void cannotSignInWithoutCsrf() throws Exception {
            mvc.perform(post("/api/auth/sign-in")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(credentials(username, PASSWORD)))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("signing in")
    class SignIn {

        @Test
        @DisplayName("returns the session and places a single-outlet user — FR-AUTH-01, FR-AUTH-03")
        void succeedsAndPlacesTheUser() throws Exception {
            Session session = signIn(username, PASSWORD);

            mvc.perform(session.authorise(get("/api/auth/session")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.username").value(username))
                    .andExpect(jsonPath("$.mustChooseOutlet").value(false))
                    .andExpect(jsonPath("$.activeOutlet.id").value(outletId.toString()))
                    .andExpect(jsonPath("$.pinSet").value(true));
        }

        @Test
        @DisplayName("reports attempts remaining without revealing the username — FR-AUTH-06")
        void reportsAttemptsRemaining() throws Exception {
            Session anonymous = csrf();

            mvc.perform(anonymous.authorise(post("/api/auth/sign-in"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(credentials(username, "wrong-password")))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"))
                    .andExpect(jsonPath("$.message").value("Username or password is incorrect"))
                    .andExpect(jsonPath("$.details.attemptsRemaining").value(4));
        }

        @Test
        @DisplayName("rejects a blank identifier per field — A-02")
        void rejectsBlankIdentifier() throws Exception {
            Session anonymous = csrf();

            mvc.perform(anonymous.authorise(post("/api/auth/sign-in"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(credentials("", PASSWORD)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details.identifier").value("Enter your username or email"));
        }
    }

    @Nested
    @DisplayName("a locked screen")
    class Locked {

        @Test
        @DisplayName("refuses ordinary work with 423 but still accepts the unlock — FR-AUTH-04")
        void refusesWorkButAcceptsUnlock() throws Exception {
            Session session = signIn(username, PASSWORD);

            mvc.perform(session.authorise(post("/api/auth/lock")))
                    .andExpect(status().isNoContent());

            mvc.perform(session.authorise(post("/api/auth/outlet/" + outletId)))
                    .andExpect(status().isLocked())
                    .andExpect(jsonPath("$.code").value("SCREEN_LOCKED"))
                    .andExpect(jsonPath("$.message").value("Unlock the POS to continue"));

            // PIN_INCORRECT, not SESSION_INVALID: a typo must not look to the
            // client like a dead session, or it would drop an open shift.
            mvc.perform(session.authorise(post("/api/auth/unlock"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("pin", "0000"))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("PIN_INCORRECT"))
                    .andExpect(jsonPath("$.message").value("PIN is incorrect"));

            // ...and the screen is still locked, not signed out.
            mvc.perform(session.authorise(post("/api/auth/outlet/" + outletId)))
                    .andExpect(status().isLocked());

            mvc.perform(session.authorise(post("/api/auth/unlock"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("pin", PIN))))
                    .andExpect(status().isNoContent());

            mvc.perform(session.authorise(post("/api/auth/outlet/" + outletId)))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("signing out")
    class SignOut {

        @Test
        @DisplayName("invalidates the session, and the next call is a clean 401")
        void invalidatesTheSession() throws Exception {
            Session session = signIn(username, PASSWORD);

            mvc.perform(session.authorise(post("/api/auth/sign-out")))
                    .andExpect(status().isNoContent());

            mvc.perform(session.authorise(get("/api/auth/session")))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("NOT_AUTHENTICATED"));
        }
    }

    @Nested
    @DisplayName("the administrator reset route")
    class AdministratorReset {

        @Test
        @DisplayName("answers an unauthenticated caller with 401, not 403 — the client shows sign-in")
        void unauthenticatedGetsUnauthorized() throws Exception {
            Session anonymous = csrf();

            mvc.perform(anonymous.authorise(post("/api/auth/users/" + UUID.randomUUID() + "/password-reset"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("newPassword", "Replacement-1"))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("NOT_AUTHENTICATED"));
        }

        @Test
        @DisplayName("refuses an administrator resetting their own password — FR-AUTH-07")
        void refusesSelfReset() throws Exception {
            Session session = signIn(username, PASSWORD);
            UUID self = users.findByUsernameOrEmail(username).orElseThrow().getId();

            mvc.perform(session.authorise(post("/api/auth/users/" + self + "/password-reset"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("newPassword", "Replacement-1"))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }
    }

    @Nested
    @DisplayName("a counter override")
    class Approval {

        @Test
        @DisplayName("names the manager whose PIN it is — FR-AUTH-02, BR-10")
        void namesTheApprover() throws Exception {
            Session session = signIn(username, PASSWORD);

            mvc.perform(session.authorise(post("/api/auth/approve"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "pin", PIN, "permission", "sale.void"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.approved").value(true))
                    .andExpect(jsonPath("$.approverName").value("Test Cashier"));
        }

        @Test
        @DisplayName("refuses a wrong PIN — the browser cannot decide this")
        void refusesAWrongPin() throws Exception {
            Session session = signIn(username, PASSWORD);

            mvc.perform(session.authorise(post("/api/auth/approve"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "pin", "0000", "permission", "sale.void"))))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("refuses a valid PIN for a permission its owner lacks — BR-10")
        void pinIsNotAuthority() throws Exception {
            Session session = signIn(username, PASSWORD);

            // The seeded user is an OWNER and holds everything, so ask for a
            // code no role carries: a correct PIN must still not authorise it.
            mvc.perform(session.authorise(post("/api/auth/approve"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "pin", PIN, "permission", "not.a.real.permission"))))
                    .andExpect(status().isBadRequest());
        }
    }

    // --- helpers -----------------------------------------------------------
    //
    // MockMvc holds no cookie jar, so a session is carried explicitly: the
    // MockHttpSession for the servlet session and the CSRF token for the
    // header. A browser does both automatically; here it has to be stated.

    private record Session(MockHttpSession http, String csrfToken) {
        MockHttpServletRequestBuilder authorise(MockHttpServletRequestBuilder builder) {
            return builder.session(http).header("X-XSRF-TOKEN", csrfToken)
                    .cookie(new Cookie("XSRF-TOKEN", csrfToken));
        }
    }

    private Session csrf() throws Exception {
        // The token lives in a cookie, not the session, so fetching it creates
        // no session. One is supplied here for sign-in to adopt.
        MockHttpSession http = new MockHttpSession();
        MvcResult result = mvc.perform(get("/api/auth/csrf").session(http))
                .andExpect(status().isOk())
                .andReturn();
        String token = json.readTree(result.getResponse().getContentAsString()).get("token").asText();
        return new Session(http, token);
    }

    private Session signIn(String identifier, String password) throws Exception {
        Session anonymous = csrf();
        MvcResult result = mvc.perform(anonymous.authorise(post("/api/auth/sign-in"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(identifier, password)))
                .andExpect(status().isOk())
                .andReturn();

        // Sign-in rotates the session id against fixation, so the established
        // session is the one on the response, never the one we sent.
        MockHttpSession established = (MockHttpSession) result.getRequest().getSession(false);
        return new Session(established, anonymous.csrfToken());
    }

    private String credentials(String identifier, String password) throws Exception {
        return json.writeValueAsString(Map.of("identifier", identifier, "password", password));
    }
}
