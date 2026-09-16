package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.ExpenseRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Permission;
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

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Operating expenses over HTTP.
 *
 * <p>The defect this feature exists for: an expense was recorded in React state
 * and nowhere else, so it showed on the screen, survived until a refresh, and
 * then took the P&L that was computed from it. The test that matters most is
 * therefore the dullest one — that a recorded expense is still there when
 * something else asks for it.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Expenses HTTP contract")
class ExpenseControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired ExpenseRepository expenses;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private UUID outletId;
    private String ownerName;
    private String managerName;
    private String cashierName;

    @BeforeEach
    void seed() {
        String run = UUID.randomUUID().toString().substring(0, 5).toUpperCase();
        outletId = outlets.save(new Outlet("X" + run, "Expense Branch " + run)).getId();

        ownerName = account("owner-" + run.toLowerCase(), Role.OWNER);
        managerName = account("manager-" + run.toLowerCase(), Role.MANAGER);
        cashierName = account("cashier-" + run.toLowerCase(), Role.CASHIER);
    }

    private String account(String username, Role role) {
        User user = new User(username, "Test " + role.key(), passwords.encode(PASSWORD));
        user.assignRole(role);
        user.assignOutlet(outletId);
        users.save(user);
        loginAttempts.recordSuccess(username);
        return username;
    }

    private Map<String, Object> body(long pesewas, String category, LocalDate on) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("spentOn", on.toString());
        request.put("category", category);
        request.put("title", "September rent");
        request.put("amountPesewas", pesewas);
        request.put("outletId", outletId.toString());
        request.put("payee", "Kofi Mensah Properties");
        request.put("paymentMethod", "BANK_TRANSFER");
        request.put("taxDeductible", true);
        request.put("status", "PAID");
        return request;
    }

    @Nested
    @DisplayName("recording")
    class Recording {

        @Test
        @DisplayName("an expense is persisted and still there on the next request")
        void survivesTheRequestThatMadeIt() throws Exception {
            Session session = signIn(ownerName);

            MvcResult created = mvc.perform(session.authorise(post("/api/expenses"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body(120_050, "RENT_LEASE", LocalDate.now()))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.amountPesewas").value(120_050))
                    .andExpect(jsonPath("$.category").value("RENT_LEASE"))
                    // The label travels with the key so the screen keeps no
                    // translation table of its own to drift from this one.
                    .andExpect(jsonPath("$.categoryLabel").value("Rent & Lease"))
                    .andExpect(jsonPath("$.recordedByName").value("Test owner"))
                    .andReturn();

            String id = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

            // A separate request, which is what a refresh is.
            mvc.perform(session.authorise(mine()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.expenses[0].id").value(id))
                    .andExpect(jsonPath("$.paidPesewas").value(120_050));

            assertTrue(expenses.findById(UUID.fromString(id)).isPresent(),
                    "the row should be in the database, not only in a response");
        }

        @Test
        @DisplayName("the period totals are the server's, and split paid from owed")
        void totalsAreServerSide() throws Exception {
            Session session = signIn(ownerName);
            record(session, body(50_000, "UTILITIES_POWER", LocalDate.now()));

            Map<String, Object> pending = body(30_000, "STAFF_PAYROLL", LocalDate.now());
            pending.put("status", "PENDING");
            record(session, pending);

            // An unpaid invoice is owed, not spent. Adding it to the month's
            // outgoings would overstate the month and then count it twice when
            // it is actually paid.
            mvc.perform(session.authorise(mine()))
                    .andExpect(jsonPath("$.paidPesewas").value(50_000))
                    .andExpect(jsonPath("$.pendingPesewas").value(30_000))
                    .andExpect(jsonPath("$.byCategoryPesewas.UTILITIES_POWER").value(50_000))
                    .andExpect(jsonPath("$.byCategoryPesewas.STAFF_PAYROLL").doesNotExist());
        }

        @Test
        @DisplayName("an expense dated in the future is refused")
        void refusesFutureDates() throws Exception {
            Session session = signIn(ownerName);
            // Not pedantry: a future date silently drops the cost out of every
            // P&L anybody runs until that day arrives.
            mvc.perform(session.authorise(post("/api/expenses"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    body(10_000, "MISCELLANEOUS", LocalDate.now().plusDays(3)))))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("zero is not an expense")
        void refusesZero() throws Exception {
            Session session = signIn(ownerName);
            mvc.perform(session.authorise(post("/api/expenses"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body(0, "MISCELLANEOUS", LocalDate.now()))))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("removing")
    class Removing {

        @Test
        @DisplayName("a removed expense leaves the figures but stays on the record")
        void voidKeepsTheRow() throws Exception {
            Session session = signIn(ownerName);
            String id = record(session, body(75_000, "MAINTENANCE_REPAIRS", LocalDate.now()));

            mvc.perform(session.authorise(delete("/api/expenses/" + id))
                            .param("reason", "Entered twice"))
                    .andExpect(status().isNoContent());

            mvc.perform(session.authorise(mine()))
                    .andExpect(jsonPath("$.paidPesewas").value(0))
                    .andExpect(jsonPath("$.expenses.length()").value(0));

            // Still there. A P&L somebody filed last month has to keep
            // reproducing, which a deleted row would not allow.
            assertTrue(expenses.findById(UUID.fromString(id)).orElseThrow().isVoided());
        }

        @Test
        @DisplayName("removing it twice is a conflict, not a second silent success")
        void refusesDoubleVoid() throws Exception {
            Session session = signIn(ownerName);
            String id = record(session, body(9_000, "PACKAGING_BAGS", LocalDate.now()));

            mvc.perform(session.authorise(delete("/api/expenses/" + id)))
                    .andExpect(status().isNoContent());
            mvc.perform(session.authorise(delete("/api/expenses/" + id)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("EXPENSE_ALREADY_VOIDED"));
        }
    }

    @Nested
    @DisplayName("who may do it")
    class Access {

        @Test
        @DisplayName("a cashier can neither read nor record — acceptance criterion 7")
        void cashierIsShutOut() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(get("/api/expenses")))
                    .andExpect(status().isForbidden());
            mvc.perform(session.authorise(post("/api/expenses"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body(1_000, "MISCELLANEOUS", LocalDate.now()))))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a manager records what the branch spends")
        void managerMayRecord() throws Exception {
            Session session = signIn(managerName);
            mvc.perform(session.authorise(post("/api/expenses"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body(22_500, "DELIVERY_HAULAGE", LocalDate.now()))))
                    .andExpect(status().isCreated());
        }

        /**
         * FR-USER-03: this is the granting the owner actually asked to be able to
         * do — give one person a right their role does not carry, and have the
         * server honour it rather than the screen merely showing the tab.
         */
        @Test
        @DisplayName("a granted override lets a cashier read expenses — FR-USER-03")
        void grantedOverrideIsHonoured() throws Exception {
            User cashier = users.findByUsernameOrEmail(cashierName).orElseThrow();
            cashier.override(Permission.EXPENSE_VIEW, true);
            users.save(cashier);

            Session session = signIn(cashierName);
            mvc.perform(session.authorise(get("/api/expenses")))
                    .andExpect(status().isOk());

            // Reading is not recording. The grant was for one code and it bought
            // exactly that one.
            mvc.perform(session.authorise(post("/api/expenses"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body(1_000, "MISCELLANEOUS", LocalDate.now()))))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a revoked override takes it back off a manager — FR-USER-03")
        void revokedOverrideIsHonoured() throws Exception {
            User manager = users.findByUsernameOrEmail(managerName).orElseThrow();
            manager.override(Permission.EXPENSE_MANAGE, false);
            users.save(manager);

            Session session = signIn(managerName);
            mvc.perform(session.authorise(post("/api/expenses"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body(5_000, "OFFICE_COMMUNICATION", LocalDate.now()))))
                    .andExpect(status().isForbidden());

            // The revocation was narrow: they can still see them.
            mvc.perform(session.authorise(get("/api/expenses")))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("a permission change takes effect at once")
    class LivePermissions {

        /**
         * FR-USER-03 · NFR-9.
         *
         * <p>The rights were resolved once at sign-in and carried in the session,
         * so revoking one did nothing until that person signed in again. On a
         * counter PC where somebody signs in at eight and stays in all day, that
         * is a whole trading day of a right the owner believed they had taken
         * away.
         */
        @Test
        @DisplayName("revoking mid-session stops the next request, with no re-login")
        void revokeAppliesImmediately() throws Exception {
            Session session = signIn(managerName);

            mvc.perform(session.authorise(get("/api/expenses")))
                    .andExpect(status().isOk());

            User manager = users.findByUsernameOrEmail(managerName).orElseThrow();
            manager.override(Permission.EXPENSE_VIEW, false);
            users.save(manager);

            // Same session, same cookie, no sign-in in between.
            mvc.perform(session.authorise(get("/api/expenses")))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("granting mid-session works on the next click too")
        void grantAppliesImmediately() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(get("/api/expenses")))
                    .andExpect(status().isForbidden());

            User cashier = users.findByUsernameOrEmail(cashierName).orElseThrow();
            cashier.override(Permission.EXPENSE_VIEW, true);
            users.save(cashier);

            mvc.perform(session.authorise(get("/api/expenses")))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("an unchanged session keeps working — the refresh is not a sign-out")
        void unchangedSessionSurvives() throws Exception {
            Session session = signIn(managerName);
            for (int i = 0; i < 3; i++) {
                mvc.perform(session.authorise(get("/api/expenses")))
                        .andExpect(status().isOk());
            }
        }
    }

    // --- helpers -----------------------------------------------------------

    /**
     * This test's own branch.
     *
     * <p>The suite shares one database and these rows commit, so an unscoped
     * total is the sum of every test that ran before. Each test seeds its own
     * outlet and reads that.
     */
    private MockHttpServletRequestBuilder mine() {
        return get("/api/expenses").param("outletId", outletId.toString());
    }

    private String record(Session session, Map<String, Object> request) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/expenses"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(request)))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private Session signIn(String identifier) throws Exception {
        MockHttpSession http = new MockHttpSession();
        MvcResult csrf = mvc.perform(get("/api/auth/csrf").session(http))
                .andExpect(status().isOk()).andReturn();
        String token = json.readTree(csrf.getResponse().getContentAsString()).get("token").asText();

        MvcResult signedIn = mvc.perform(post("/api/auth/sign-in").session(http)
                        .header("X-XSRF-TOKEN", token).cookie(new Cookie("XSRF-TOKEN", token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", identifier, "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn();

        return new Session((MockHttpSession) signedIn.getRequest().getSession(false), token);
    }

    private record Session(MockHttpSession http, String csrfToken) {
        MockHttpServletRequestBuilder authorise(MockHttpServletRequestBuilder builder) {
            return builder.session(http).header("X-XSRF-TOKEN", csrfToken)
                    .cookie(new Cookie("XSRF-TOKEN", csrfToken));
        }
    }
}
