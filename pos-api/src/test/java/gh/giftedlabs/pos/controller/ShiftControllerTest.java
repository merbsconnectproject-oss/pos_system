package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.dto.MovementRequest;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.MovementType;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.InventoryService;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shifts and the cash drawer over HTTP — FR-CASH, BR-13, BR-14.
 *
 * <p>Carries release gate 9: a blind close records the variance against the
 * cashier and demands a note past the threshold.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Shifts and cash HTTP contract")
class ShiftControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired TerminalRepository terminals;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired InventoryService inventory;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String mateName;
    private String run;
    private UUID outletId;
    private UUID terminalId;
    private UUID secondTerminalId;
    private UUID ownerId;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("J" + run.substring(0, 5), "Cash Branch " + run)).getId();
        terminalId = terminals.save(new Terminal(outletId, "01", "Counter 1", 1L, 1000L)).getId();
        secondTerminalId = terminals.save(new Terminal(outletId, "02", "Counter 2", 2000L, 1000L)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        ownerId = users.save(owner).getId();

        mateName = "mate-" + run.toLowerCase();
        User mate = new User(mateName, "Test Mate", passwords.encode(PASSWORD));
        mate.assignRole(Role.OWNER);
        mate.assignOutlet(outletId);
        users.save(mate);

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(mateName);
    }

    @Nested
    @DisplayName("opening")
    class Opening {

        @Test
        @DisplayName("records the declared float against user, till and outlet — FR-CASH-01")
        void recordsTheFloat() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(post("/api/shifts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "terminalId", terminalId.toString(), "openingFloat", 20000))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.openingFloat").value(20000))
                    .andExpect(jsonPath("$.status").value("OPEN"))
                    .andExpect(jsonPath("$.cashierName").value("Test Owner"))
                    .andExpect(jsonPath("$.terminalId").value(terminalId.toString()));
        }

        @Test
        @DisplayName("a cashier cannot hold two — BR-13")
        void oneOpenPerCashier() throws Exception {
            Session session = signIn(ownerName);
            open(session, terminalId, 10000);

            mvc.perform(session.authorise(post("/api/shifts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "terminalId", secondTerminalId.toString(), "openingFloat", 5000))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("SHIFT_ALREADY_OPEN"));
        }

        @Test
        @DisplayName("a till cannot hold two either, and says who has it — BR-13")
        void oneOpenPerTerminal() throws Exception {
            open(signIn(ownerName), terminalId, 10000);

            Session theirs = signIn(mateName);
            mvc.perform(theirs.authorise(post("/api/shifts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "terminalId", terminalId.toString(), "openingFloat", 5000))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TERMINAL_ALREADY_OPEN"))
                    .andExpect(jsonPath("$.details.cashier").value("Test Owner"));
        }
    }

    @Nested
    @DisplayName("an open shift")
    class WhileOpen {

        @Test
        @DisplayName("never reveals what it expects — FR-CASH-04")
        void keepsTheExpectationHidden() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);
            sellFor(session, "6000");

            // Expected cash, takings and the sale total would each give the
            // count away — cash takings plus the float *is* the expectation.
            mvc.perform(session.authorise(get("/api/shifts/" + shiftId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.openingFloat").value(20000))
                    .andExpect(jsonPath("$.expectedCash").doesNotExist())
                    .andExpect(jsonPath("$.saleTotal").doesNotExist())
                    .andExpect(jsonPath("$.takingsByMethod").isEmpty());
        }

        @Test
        @DisplayName("takes cash movements, each with a reason — FR-CASH-03")
        void takesCashMovements() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);

            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/cash"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "type", "PAYOUT", "amount", 3000, "reason", "Fuel for the delivery van"))))
                    .andExpect(status().isCreated())
                    // The sign belongs to the type: a payout leaves the drawer
                    // however the amount was typed.
                    .andExpect(jsonPath("$.cashMovements[0].amount").value(-3000))
                    .andExpect(jsonPath("$.cashMovements[0].reason").value("Fuel for the delivery van"));
        }

        @Test
        @DisplayName("refuses a cash movement with no reason — FR-CASH-03")
        void refusesAReasonlessMovement() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);

            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/cash"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "type", "PAYOUT", "amount", 3000, "reason", ""))))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("closing")
    class Closing {

        @Test
        @DisplayName("expected is float + cash sales − payouts, and variance is recorded — BR-14, FR-CASH-05")
        void computesExpectedAndVariance() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);

            sellFor(session, "6000");   // 60.00 cash in
            payOut(session, shiftId, 3000, "Fuel");  // 30.00 out

            // 200.00 float + 60.00 taken − 30.00 paid out = 230.00 expected.
            // The drawer holds 228.00, so it is 2.00 short.
            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("countedCash", 22800))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CLOSED"))
                    .andExpect(jsonPath("$.expectedCash").value(23000))
                    .andExpect(jsonPath("$.countedCash").value(22800))
                    .andExpect(jsonPath("$.variance").value(-200))
                    // FR-CASH-07: non-cash takings appear only now.
                    .andExpect(jsonPath("$.takingsByMethod.cash").value(6000))
                    .andExpect(jsonPath("$.saleCount").value(1));
        }

        @Test
        @DisplayName("demands a note when the drawer is out past the threshold — release gate 9, FR-CASH-06")
        void demandsAnExplanation() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);

            // 100.00 short, well past the 5.00 threshold.
            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("countedCash", 10000))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("VARIANCE_NEEDS_NOTE"));

            // Refused, so the shift is still open and can be closed properly.
            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "countedCash", 10000,
                                    "note", "Took 100 to the bank and forgot to record the drop"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.variance").value(-10000))
                    .andExpect(jsonPath("$.varianceNote")
                            .value("Took 100 to the bank and forgot to record the drop"));
        }

        @Test
        @DisplayName("a small variance closes without one — FR-CASH-06")
        void smallVarianceNeedsNoNote() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);

            // 1.00 short, inside the threshold.
            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("countedCash", 19900))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.variance").value(-100));
        }

        @Test
        @DisplayName("cannot be reopened; a correction is another movement — FR-CASH-09")
        void cannotBeReopened() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);

            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("countedCash", 20000))))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("countedCash", 20000))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("SHIFT_CLOSED"));

            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/cash"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "type", "CORRECTION", "amount", 500, "reason", "Found under the till"))))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("frees the cashier and the till for the next shift — BR-13")
        void freesTheCashierAndTerminal() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);

            mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("countedCash", 20000))))
                    .andExpect(status().isOk());

            // The partial unique index only covers OPEN rows, so a closed shift
            // does not block the next one.
            open(session, terminalId, 15000);
        }
    }

    @Nested
    @DisplayName("the current shift")
    class Current {

        @Test
        @DisplayName("is 204 when the cashier has none")
        void noneIsNoContent() throws Exception {
            mvc.perform(signIn(ownerName).authorise(get("/api/shifts/current")))
                    .andExpect(status().isNoContent());
        }

        @Test
        @DisplayName("is the cashier's own, not the till's")
        void isTheirOwn() throws Exception {
            Session session = signIn(ownerName);
            String shiftId = open(session, terminalId, 20000);

            mvc.perform(session.authorise(get("/api/shifts/current")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(shiftId));

            // Their mate shares the outlet but has no shift.
            mvc.perform(signIn(mateName).authorise(get("/api/shifts/current")))
                    .andExpect(status().isNoContent());
        }
    }

    // --- helpers -----------------------------------------------------------

    private String open(Session session, UUID till, long floatPesewas) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/shifts"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "terminalId", till.toString(), "openingFloat", floatPesewas))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private void payOut(Session session, String shiftId, long amount, String reason) throws Exception {
        mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/cash"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "type", "PAYOUT", "amount", amount, "reason", reason))))
                .andExpect(status().isCreated());
    }

    /** One cash sale, so the shift has takings to count. */
    private void sellFor(Session session, String pesewas) throws Exception {
        Map<String, Object> product = new LinkedHashMap<>();
        product.put("name", "Cash Item " + run + "-" + pesewas);
        product.put("category", "Hardware & Tools");
        product.put("brand", "Generic");
        product.put("baseUnit", "pcs");
        product.put("retailPrice", new java.math.BigDecimal(pesewas).movePointLeft(2).toPlainString());
        product.put("tradePrice", new java.math.BigDecimal(pesewas).movePointLeft(2).toPlainString());
        product.put("floorPrice", "0.01");

        MvcResult created = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(product)))
                .andExpect(status().isCreated()).andReturn();
        String productId = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

        inventory.record(new MovementRequest(UUID.fromString(productId), outletId, MovementType.RECEIPT,
                        new BigDecimal("10"), new BigDecimal("1.00"), null, null, null, null),
                new PosPrincipal(ownerId, ownerName, outletId, Instant.now()), true, "127.0.0.1");

        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("selectedUnit", "pcs");
        line.put("conversionFactor", "1");
        line.put("quantity", "1");
        line.put("unitPrice", new java.math.BigDecimal(pesewas).movePointLeft(2).toPlainString());

        Map<String, Object> payment = new LinkedHashMap<>();
        payment.put("id", UUID.randomUUID().toString());
        payment.put("method", "cash");
        payment.put("amount", Long.parseLong(pesewas));

        Map<String, Object> sale = new LinkedHashMap<>();
        sale.put("id", UUID.randomUUID().toString());
        sale.put("outletId", outletId.toString());
        sale.put("terminalId", terminalId.toString());
        sale.put("items", List.of(line));
        sale.put("payments", List.of(payment));

        mvc.perform(session.authorise(post("/api/sales"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(sale)))
                .andExpect(status().isCreated());
    }

    private record Session(MockHttpSession http, String csrfToken) {
        MockHttpServletRequestBuilder authorise(MockHttpServletRequestBuilder builder) {
            return builder.session(http).header("X-XSRF-TOKEN", csrfToken)
                    .cookie(new Cookie("XSRF-TOKEN", csrfToken));
        }
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
}
