package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Customer;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.CustomerRepository;
import gh.giftedlabs.pos.repository.InstallmentPlanRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.CustomerType;
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

import java.time.Clock;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Installment plans over HTTP.
 *
 * <p>A plan is a debt, and the thing this replaces held it in a React array. A
 * shop that refreshed the page lost the schedule and the customer kept the goods.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Installment plans HTTP contract")
class InstallmentControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired CustomerRepository customers;
    @Autowired InstallmentPlanRepository plans;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired Clock clock;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private UUID outletId;
    private UUID customerId;
    private String ownerName;
    private String managerName;
    private String cashierName;

    @BeforeEach
    void seed() {
        String run = UUID.randomUUID().toString().substring(0, 5).toUpperCase();
        outletId = outlets.save(new Outlet("P" + run, "Plan Branch " + run)).getId();

        Customer customer = new Customer("Kwesi Boateng " + run, "024" + run.hashCode(),
                CustomerType.CONTRACTOR, null, clock.instant());
        customerId = customers.save(customer).getId();

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

    /** GH₵1,000 of goods, GH₵100 down, three monthly installments. */
    private Map<String, Object> planBody(long totalPesewas, long downPesewas, int count) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("customerId", customerId.toString());
        body.put("outletId", outletId.toString());
        body.put("totalPesewas", totalPesewas);
        body.put("downPaymentPesewas", downPesewas);
        body.put("frequency", "MONTHLY");
        body.put("installmentCount", count);
        body.put("startDate", LocalDate.now().toString());
        body.put("items", java.util.List.of(Map.of(
                "productName", "2.5mm Twin & Earth Cable",
                "quantity", "2.000",
                "unitPrice", "500.0000",
                "lineTotalPesewas", totalPesewas)));
        return body;
    }

    private Map<String, Object> payment(long pesewas) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("amountPesewas", pesewas);
        body.put("receivedOn", LocalDate.now().toString());
        body.put("paymentMethod", "CASH");
        return body;
    }

    @Nested
    @DisplayName("agreeing a plan")
    class Creating {

        @Test
        @DisplayName("the plan and its whole schedule are persisted")
        void schedulePersists() throws Exception {
            Session session = signIn(ownerName);

            MvcResult created = mvc.perform(session.authorise(post("/api/installment-plans"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(planBody(100_000, 10_000, 3))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.planNumber").value(org.hamcrest.Matchers.startsWith("INST-")))
                    .andExpect(jsonPath("$.status").value("ACTIVE"))
                    // 1000 less the 100 down, spread over three.
                    .andExpect(jsonPath("$.outstandingPesewas").value(90_000))
                    .andExpect(jsonPath("$.schedule.length()").value(3))
                    .andExpect(jsonPath("$.schedule[0].expectedPesewas").value(30_000))
                    .andExpect(jsonPath("$.customerName").value(org.hamcrest.Matchers.startsWith("Kwesi")))
                    .andReturn();

            String id = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

            // The whole point: a separate request still has it.
            mvc.perform(session.authorise(get("/api/installment-plans/" + id)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.schedule.length()").value(3))
                    .andExpect(jsonPath("$.items[0].productName").value("2.5mm Twin & Earth Cable"));

            assertTrue(plans.findById(UUID.fromString(id)).isPresent());
        }

        @Test
        @DisplayName("a down payment larger than the goods is refused")
        void refusesOversizedDownPayment() throws Exception {
            Session session = signIn(ownerName);
            mvc.perform(session.authorise(post("/api/installment-plans"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(planBody(50_000, 60_000, 3))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("DOWN_PAYMENT_TOO_LARGE"));
        }
    }

    @Nested
    @DisplayName("taking payments")
    class Paying {

        @Test
        @DisplayName("a payment settles the oldest installment first and spills forward")
        void spillsForward() throws Exception {
            Session session = signIn(ownerName);
            String id = create(session, planBody(100_000, 10_000, 3));

            // 450 against three 300 installments: settles the first, puts 150
            // on the second, leaves the third untouched.
            mvc.perform(session.authorise(post("/api/installment-plans/" + id + "/payments"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(payment(45_000))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.schedule[0].status").value("PAID"))
                    .andExpect(jsonPath("$.schedule[1].status").value("PARTIAL"))
                    .andExpect(jsonPath("$.schedule[1].paidPesewas").value(15_000))
                    .andExpect(jsonPath("$.schedule[2].status").value("PENDING"))
                    .andExpect(jsonPath("$.outstandingPesewas").value(45_000));
        }

        @Test
        @DisplayName("a payment remains visible after reopening and its receipt reprints through ESC/POS")
        void paymentHistoryAndReceiptPersist() throws Exception {
            Session session = signIn(ownerName);
            String id = create(session, planBody(100_000, 10_000, 3));

            MvcResult paid = mvc.perform(session.authorise(
                            post("/api/installment-plans/" + id + "/payments"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(payment(45_000))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.payments.length()").value(1))
                    .andExpect(jsonPath("$.payments[0].amountPesewas").value(45_000))
                    .andExpect(jsonPath("$.payments[0].balanceAfterPesewas").value(45_000))
                    .andExpect(jsonPath("$.payments[0].receiptNumber")
                            .value(org.hamcrest.Matchers.containsString("-IP-")))
                    .andReturn();
            String paymentId = json.readTree(paid.getResponse().getContentAsString())
                    .get("payments").get(0).get("id").asText();

            // A fresh request still has the individual collection, not only an
            // aggregate paid amount on the schedule.
            mvc.perform(session.authorise(get("/api/installment-plans/" + id)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.payments[0].id").value(paymentId))
                    .andExpect(jsonPath("$.outstandingPesewas").value(45_000));

            MvcResult original = mvc.perform(session.authorise(get(
                            "/api/installment-plans/" + id + "/payments/" + paymentId + "/receipt")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.reprint").value(false))
                    .andReturn();
            String originalText = receiptText(original);
            assertTrue(originalText.contains("INSTALLMENT PAYMENT RECEIPT"), originalText);
            assertTrue(originalText.contains("GHS 450.00"), originalText);
            assertTrue(originalText.contains("Remaining balance: GHS 450.00"), originalText);

            MvcResult reprint = mvc.perform(session.authorise(post(
                            "/api/installment-plans/" + id + "/payments/" + paymentId
                                    + "/receipt/reprint")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.reprint").value(true))
                    .andReturn();
            assertTrue(receiptText(reprint).contains("*** REPRINT ***"));
        }

        @Test
        @DisplayName("settling the balance completes the plan even with rows still pending")
        void completesOnBalance() throws Exception {
            Session session = signIn(ownerName);
            String id = create(session, planBody(100_000, 10_000, 3));

            // Paying the lot at once. The plan is settled; it must not stay
            // ACTIVE because installments 2 and 3 were never separately due.
            mvc.perform(session.authorise(post("/api/installment-plans/" + id + "/payments"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(payment(90_000))))
                    .andExpect(jsonPath("$.status").value("COMPLETED"))
                    .andExpect(jsonPath("$.outstandingPesewas").value(0));
        }

        @Test
        @DisplayName("more than is owed is refused, and says what is owed")
        void refusesOverpayment() throws Exception {
            Session session = signIn(ownerName);
            String id = create(session, planBody(100_000, 10_000, 3));

            // Absorbing it would record the money against a debt that does not
            // exist instead of as the change it actually is.
            mvc.perform(session.authorise(post("/api/installment-plans/" + id + "/payments"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(payment(95_000))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PLAN_OVERPAYMENT"))
                    .andExpect(jsonPath("$.details.outstanding").value(90_000));
        }

        @Test
        @DisplayName("a settled plan takes no further payment")
        void refusesPaymentOnCompletedPlan() throws Exception {
            Session session = signIn(ownerName);
            String id = create(session, planBody(100_000, 10_000, 3));

            mvc.perform(session.authorise(post("/api/installment-plans/" + id + "/payments"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(payment(90_000))))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(post("/api/installment-plans/" + id + "/payments"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(payment(1_000))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PLAN_NOT_ACTIVE"));
        }
    }

    @Nested
    @DisplayName("who may do it")
    class Access {

        @Test
        @DisplayName("a cashier has no credit authority by default")
        void cashierRefused() throws Exception {
            Session session = signIn(cashierName);
            mvc.perform(session.authorise(get("/api/installment-plans")))
                    .andExpect(status().isForbidden());
            mvc.perform(session.authorise(post("/api/installment-plans"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(planBody(50_000, 0, 2))))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("granting customer.credit to one cashier is enough — FR-USER-03")
        void grantedOverrideIsHonoured() throws Exception {
            User cashier = users.findByUsernameOrEmail(cashierName).orElseThrow();
            cashier.override(Permission.CUSTOMER_CREDIT, true);
            users.save(cashier);

            Session session = signIn(cashierName);
            mvc.perform(session.authorise(post("/api/installment-plans"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(planBody(60_000, 0, 2))))
                    .andExpect(status().isCreated());
        }

        @Test
        @DisplayName("writing a debt off needs more than the authority to agree one")
        void defaultingNeedsSettingsGeneral() throws Exception {
            Session owner = signIn(ownerName);
            String id = create(owner, planBody(100_000, 10_000, 3));

            // A manager runs plans but does not decide the shop will not collect.
            Session manager = signIn(managerName);
            mvc.perform(manager.authorise(post("/api/installment-plans/" + id + "/default")))
                    .andExpect(status().isForbidden());

            mvc.perform(owner.authorise(post("/api/installment-plans/" + id + "/default"))
                            .param("reason", "Customer has left the district"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("DEFAULTED"));

            // And a written-off plan stops accepting money.
            mvc.perform(owner.authorise(post("/api/installment-plans/" + id + "/payments"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(payment(1_000))))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("the book's outstanding total counts only live plans")
        void outstandingCountsActiveOnly() throws Exception {
            Session session = signIn(ownerName);
            create(session, planBody(100_000, 10_000, 3));

            mvc.perform(session.authorise(get("/api/installment-plans")
                            .param("outletId", outletId.toString())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.outstandingPesewas").value(90_000))
                    .andExpect(jsonPath("$.activeCount").value(1));
        }
    }

    // --- helpers -----------------------------------------------------------

    private String create(Session session, Map<String, Object> body) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/installment-plans"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private String receiptText(MvcResult result) throws Exception {
        StringBuilder text = new StringBuilder();
        json.readTree(result.getResponse().getContentAsString()).get("lines")
                .forEach(line -> text.append(line.asText()).append('\n'));
        return text.toString();
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
