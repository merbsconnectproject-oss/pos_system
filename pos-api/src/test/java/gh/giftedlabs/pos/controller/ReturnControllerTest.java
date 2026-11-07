package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.LoginAttemptService;
import gh.giftedlabs.pos.service.ShiftService;
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

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Returns and exchanges over HTTP.
 *
 * <p>The tests that matter most are the money ones. Refunding at today's price
 * instead of the price paid, or reversing at today's cost instead of the frozen
 * one, are both mistakes that produce plausible numbers and no error — the kind
 * a shop discovers months later when the margin is wrong and nobody can say why.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Returns and exchanges HTTP contract")
class ReturnControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired TerminalRepository terminals;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired ShiftService shiftService;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String run;
    private UUID outletId;
    private UUID terminalId;
    private UUID managerId;
    private String managerName;
    private String cashierName;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("T" + run.substring(0, 5), "Return Branch " + run)).getId();
        terminalId = terminals.save(new Terminal(outletId, "01", "Counter 1", 1L, 100000L)).getId();

        managerName = "manager-" + run.toLowerCase();
        User manager = new User(managerName, "Test Manager", passwords.encode(PASSWORD));
        manager.assignRole(Role.MANAGER);
        manager.assignOutlet(outletId);
        managerId = users.save(manager).getId();

        cashierName = "cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Test Cashier", passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        cashier.assignOutlet(outletId);
        users.save(cashier);

        loginAttempts.recordSuccess(managerName);
        loginAttempts.recordSuccess(cashierName);
    }

    @Nested
    @DisplayName("refunds")
    class Refunds {

        @Test
        @DisplayName("restocked goods come back and the money goes out at the price paid")
        void restockRefund() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Socket " + run, "10.00", "40.00");
            String saleId = sell(session, productId, "5", "40.00");

            String lineId = firstLineId(session, saleId);

            MvcResult result = mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "2", "RESTOCK"))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.kind").value("REFUND"))
                    // 2 × 40.00
                    .andExpect(jsonPath("$.refundTotalPesewas").value(8000))
                    .andExpect(jsonPath("$.returnNumber").value(org.hamcrest.Matchers.containsString("-R")))
                    .andExpect(jsonPath("$.items[0].restocked").value(true))
                    .andReturn();

            assertNotNull(result.getResponse().getContentAsString());

            // 20 received, 5 sold, 2 back on the shelf = 17. The restock is the
            // only disposition that puts anything back, so this is the number
            // that proves it did.
            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.outletId == '" + outletId + "')].quantity")
                            .value(org.hamcrest.Matchers.contains(17.0)));
        }

        @Test
        @DisplayName("the refund is at the discounted price paid, not today's price — the money bug")
        void refundsAtThePricePaid() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Cable " + run, "10.00", "100.00");

            // Sold at 80.00 rather than the 100.00 ticket price.
            String saleId = sell(session, productId, "2", "80.00");
            String lineId = firstLineId(session, saleId);

            // Refunding at the list price would hand back 100.00 a unit and the
            // shop would lose 20.00 on every returned item, with no report that
            // would ever show it.
            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "1", "RESTOCK"))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.refundTotalPesewas").value(8000))
                    .andExpect(jsonPath("$.items[0].unitPrice").value(80.0));
        }

        @Test
        @DisplayName("a damaged return comes back and is written off — two movements, no sellable stock")
        void damagedWriteOff() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Bulb " + run, "5.00", "20.00");
            String saleId = sell(session, productId, "4", "20.00");
            String lineId = firstLineId(session, saleId);

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    refundBody(saleId, lineId, "1", "DAMAGED_WRITE_OFF"))))
                    .andExpect(status().isCreated())
                    // The customer is still paid back — the goods being useless
                    // to the shop is not the customer's problem.
                    .andExpect(jsonPath("$.refundTotalPesewas").value(2000))
                    .andExpect(jsonPath("$.items[0].restocked").value(false))
                    .andExpect(jsonPath("$.items[0].disposition").value("DAMAGED_WRITE_OFF"));

            // Both movements are on the ledger: it came back, then it was
            // written off. BR-2 makes the ledger the account of what happened.
            MvcResult movements = mvc.perform(session.authorise(get("/api/stock/movements")
                            .param("outletId", outletId.toString()).param("limit", "50")))
                    .andExpect(status().isOk()).andReturn();
            String body = movements.getResponse().getContentAsString();
            assertTrue(body.contains("CUSTOMER_RETURN"), "the return movement should be on the ledger");
            assertTrue(body.contains("DAMAGE"), "the write-off should be on the ledger too");
        }

        @Test
        @DisplayName("a cash refund is a drawer payout, so the till still reconciles — BR-13, BR-14")
        void cashRefundWritesACashMovement() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Switch " + run, "4.00", "15.00");
            String saleId = sell(session, productId, "2", "15.00");
            String lineId = firstLineId(session, saleId);

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "1", "RESTOCK"))))
                    .andExpect(status().isCreated());

            // Without the payout the drawer is short by exactly the refunds
            // given, and a cashier is asked to explain a variance they did not
            // cause.
            MvcResult shift = mvc.perform(session.authorise(get("/api/shifts/current")))
                    .andExpect(status().isOk()).andReturn();
            assertTrue(shift.getResponse().getContentAsString().contains("PAYOUT"),
                    "a cash refund should appear as a drawer payout: "
                            + shift.getResponse().getContentAsString());
        }
    }

    @Nested
    @DisplayName("what may come back")
    class Limits {

        @Test
        @DisplayName("nothing can be returned twice")
        void cannotReturnTwice() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Conduit " + run, "6.00", "25.00");
            String saleId = sell(session, productId, "3", "25.00");
            String lineId = firstLineId(session, saleId);

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "3", "RESTOCK"))))
                    .andExpect(status().isCreated());

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "1", "RESTOCK"))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("RETURN_EXCEEDS_SOLD"));
        }

        @Test
        @DisplayName("more than was sold is refused, and says what is left")
        void cannotReturnMoreThanSold() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Trunking " + run, "3.00", "12.00");
            String saleId = sell(session, productId, "2", "12.00");
            String lineId = firstLineId(session, saleId);

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "5", "RESTOCK"))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("RETURN_EXCEEDS_SOLD"))
                    .andExpect(jsonPath("$.details.returnable").value("2.000"));
        }

        @Test
        @DisplayName("the returnable quantity is the server's answer, not the screen's")
        void returnableIsServerSide() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Clip " + run, "1.00", "5.00");
            String saleId = sell(session, productId, "10", "5.00");
            String lineId = firstLineId(session, saleId);

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "4", "RESTOCK"))))
                    .andExpect(status().isCreated());

            mvc.perform(session.authorise(get("/api/returns/returnable/" + saleId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.lines[0].quantitySold").value(10.0))
                    .andExpect(jsonPath("$.lines[0].quantityAlreadyReturned").value(4.0))
                    .andExpect(jsonPath("$.lines[0].quantityReturnable").value(6.0));
        }

        @Test
        @DisplayName("a voided sale cannot be returned against — BR-3 already reversed it")
        void cannotReturnAgainstAVoid() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Fuse " + run, "2.00", "8.00");
            String saleId = sell(session, productId, "2", "8.00");
            String lineId = firstLineId(session, saleId);

            mvc.perform(session.authorise(post("/api/sales/" + saleId + "/void"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "Rung up twice"))))
                    .andExpect(status().isOk());

            // Returning now would write the reversal a second time and leave
            // stock higher than it has ever been.
            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "1", "RESTOCK"))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("SALE_VOIDED"));
        }
    }

    @Nested
    @DisplayName("exchanges")
    class Exchanges {

        @Test
        @DisplayName("a swap sells the replacement as a real sale and settles the difference")
        void swapCreatesARealSale() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String returned = stockedProduct(session, "Wrong lamp " + run, "10.00", "30.00");
            String replacement = stockedProduct(session, "Right lamp " + run, "12.00", "50.00");

            String saleId = sell(session, returned, "1", "30.00");
            String lineId = firstLineId(session, saleId);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("originalSaleId", saleId);
            body.put("kind", "EXCHANGE");
            body.put("items", List.of(returnLine(lineId, "1", "RESTOCK")));
            body.put("exchangeSale", saleBody(replacement, "1", "50.00"));

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.kind").value("EXCHANGE"))
                    .andExpect(jsonPath("$.refundTotalPesewas").value(3000))
                    // The replacement is worth 20.00 more, so the customer paid it.
                    .andExpect(jsonPath("$.settlementPesewas").value(2000))
                    // A real sale, with its own receipt number — not a
                    // half-featured second way to sell.
                    .andExpect(jsonPath("$.exchangeReceiptNumber").value(
                            org.hamcrest.Matchers.containsString("-")));
        }

        @Test
        @DisplayName("an exchange with no replacement is refused rather than treated as a refund")
        void exchangeNeedsReplacement() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Lamp " + run, "10.00", "30.00");
            String saleId = sell(session, productId, "1", "30.00");
            String lineId = firstLineId(session, saleId);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("originalSaleId", saleId);
            body.put("kind", "EXCHANGE");
            body.put("items", List.of(returnLine(lineId, "1", "RESTOCK")));

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("EXCHANGE_NEEDS_REPLACEMENT"));
        }
    }

    @Nested
    @DisplayName("the payload the screen actually sends")
    class ScreenPayload {

        /**
         * The counter sends numbers, not the quoted decimals the other tests use,
         * and it sends the reason strings from the returns screen verbatim.
         */
        @Test
        @DisplayName("numeric quantities and the screen's own reason strings")
        void acceptsWhatTheScreenSends() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Screen Item " + run, "10.00", "40.00");
            String saleId = sell(session, productId, "5", "40.00");
            String lineId = firstLineId(session, saleId);

            Map<String, Object> line = new LinkedHashMap<>();
            line.put("saleItemId", lineId);
            line.put("quantityBase", 2);                       // a number, not "2"
            line.put("reason", "Defective / Faulty Item");     // verbatim from the screen
            line.put("disposition", "RESTOCK");
            line.put("conditionNotes", null);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("originalSaleId", saleId);
            body.put("kind", "REFUND");
            body.put("items", List.of(line));
            body.put("refundMethod", "CASH");
            body.put("notes", null);

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated());
        }

        /**
         * The defect this pins: the returns screen invented a customer id of the
         * form {@code cust-1757…}, which the server cannot read as a UUID at all.
         * With no handler for an unreadable body it fell through to the catch-all
         * and the counter was told "tell a manager if it keeps happening" — for
         * what is a 400, on every single return.
         */
        @Test
        @DisplayName("an unreadable id is a 400 that names the field, not a 500")
        void malformedIdIsABadRequest() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Bad Id " + run, "10.00", "40.00");
            String saleId = sell(session, productId, "1", "40.00");
            String lineId = firstLineId(session, saleId);

            Map<String, Object> body = refundBody(saleId, lineId, "1", "RESTOCK");
            body.put("kind", "EXCHANGE");
            body.put("exchangeSale", Map.of(
                    "id", UUID.randomUUID().toString(),
                    "outletId", outletId.toString(),
                    "customerId", "cust-1757954321",
                    "items", List.of(),
                    "payments", List.of()));

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_BODY"))
                    .andExpect(jsonPath("$.details.field").value("exchangeSale.customerId"));
        }

        @Test
        @DisplayName("a return after the shift that sold it has closed")
        void refundWithNoOpenShift() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Late Return " + run, "10.00", "40.00");
            String saleId = sell(session, productId, "2", "40.00");
            String lineId = firstLineId(session, saleId);

            // The drawer that took the money is closed. The refund still has to be
            // recorded; it simply cannot be paid out of a shift that is not open.
            UUID shiftId = shiftService.openShiftFor(managerId).orElseThrow();
            shiftService.close(shiftId, 50_000L, "end of day", 100_000L,
                    new PosPrincipal(managerId, managerName, outletId, Instant.now()), "127.0.0.1");

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "1", "RESTOCK"))))
                    .andExpect(status().isCreated());
        }

        @Test
        @DisplayName("two lines of the same sale in one return")
        void twoLinesAtOnce() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Multi " + run, "10.00", "40.00");
            String saleId = sell(session, productId, "5", "40.00");
            String lineId = firstLineId(session, saleId);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("originalSaleId", saleId);
            body.put("kind", "REFUND");
            body.put("items", List.of(
                    returnLine(lineId, "2", "RESTOCK"),
                    returnLine(lineId, "1", "DAMAGED_WRITE_OFF")));
            body.put("refundMethod", "CASH");

            // Three of five back, split across two dispositions. Together they must
            // not be allowed to exceed what was sold.
            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.refundTotalPesewas").value(12000));
        }
    }

    @Nested
    @DisplayName("who may refund")
    class Access {

        @Test
        @DisplayName("a cashier cannot refund by default")
        void cashierRefused() throws Exception {
            Session manager = signIn(managerName);
            openShift();
            String productId = stockedProduct(manager, "Tape " + run, "2.00", "9.00");
            String saleId = sell(manager, productId, "1", "9.00");
            String lineId = firstLineId(manager, saleId);

            Session cashier = signIn(cashierName);
            mvc.perform(cashier.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "1", "RESTOCK"))))
                    .andExpect(status().isForbidden());
            mvc.perform(cashier.authorise(get("/api/returns")))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("granting sale.refund to one cashier is enough — FR-USER-03")
        void grantedOverrideIsHonoured() throws Exception {
            Session manager = signIn(managerName);
            openShift();
            String productId = stockedProduct(manager, "Bracket " + run, "2.00", "9.00");
            String saleId = sell(manager, productId, "1", "9.00");
            String lineId = firstLineId(manager, saleId);

            User cashier = users.findByUsernameOrEmail(cashierName).orElseThrow();
            cashier.override(Permission.SALE_REFUND, true);
            users.save(cashier);

            Session session = signIn(cashierName);
            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refundBody(saleId, lineId, "1", "RESTOCK"))))
                    .andExpect(status().isCreated());
        }

        @Test
        @DisplayName("a named approver who cannot refund is refused — an id in a body is a claim")
        void approverIsVerified() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Gland " + run, "2.00", "9.00");
            String saleId = sell(session, productId, "1", "9.00");
            String lineId = firstLineId(session, saleId);

            UUID cashierId = users.findByUsernameOrEmail(cashierName).orElseThrow().getId();

            Map<String, Object> body = refundBody(saleId, lineId, "1", "RESTOCK");
            body.put("approvedBy", cashierId.toString());

            mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("APPROVER_CANNOT_REFUND"));
        }
    }

    // --- helpers -----------------------------------------------------------

    private Map<String, Object> returnLine(String saleItemId, String quantity, String disposition) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("saleItemId", saleItemId);
        line.put("quantityBase", quantity);
        line.put("reason", "Customer Changed Mind");
        line.put("disposition", disposition);
        return line;
    }

    private Map<String, Object> refundBody(String saleId, String lineId, String quantity,
                                           String disposition) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("originalSaleId", saleId);
        body.put("kind", "REFUND");
        body.put("items", List.of(returnLine(lineId, quantity, disposition)));
        body.put("refundMethod", "CASH");
        return body;
    }

    /** The sale's first line id, which is what a return is processed against. */
    private String firstLineId(Session session, String saleId) throws Exception {
        MvcResult result = mvc.perform(session.authorise(get("/api/returns/returnable/" + saleId)))
                .andExpect(status().isOk()).andReturn();
        JsonNode lines = json.readTree(result.getResponse().getContentAsString()).get("lines");
        return lines.get(0).get("saleItemId").asText();
    }

    private void openShift() {
        shiftService.open(terminalId, 50_000L,
                new PosPrincipal(managerId, managerName, outletId, Instant.now()), "127.0.0.1");
    }

    private Map<String, Object> saleBody(String productId, String quantity, String price) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("selectedUnit", "pc");
        line.put("conversionFactor", "1");
        line.put("quantity", quantity);
        line.put("unitPrice", price);

        long total = Math.round(Double.parseDouble(quantity) * Double.parseDouble(price) * 100);

        Map<String, Object> payment = new LinkedHashMap<>();
        // BR-7: the payment carries a client-generated id, like the sale does.
        payment.put("id", UUID.randomUUID().toString());
        payment.put("method", "cash");
        payment.put("amount", total);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", UUID.randomUUID().toString());
        body.put("outletId", outletId.toString());
        body.put("terminalId", terminalId.toString());
        body.put("items", List.of(line));
        body.put("payments", List.of(payment));
        return body;
    }

    private String sell(Session session, String productId, String quantity, String price)
            throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/sales"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(saleBody(productId, quantity, price))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private String stockedProduct(Session session, String name, String unitCost, String retail)
            throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", "pc");
        body.put("retailPrice", retail);
        body.put("tradePrice", retail);
        body.put("floorPrice", "1.00");

        MvcResult created = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        String productId = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

        Map<String, Object> movement = new LinkedHashMap<>();
        movement.put("productId", productId);
        movement.put("outletId", outletId.toString());
        movement.put("type", "RECEIPT");
        movement.put("quantity", "20");
        movement.put("unitCost", unitCost);
        mvc.perform(session.authorise(post("/api/stock/movements"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(movement)))
                .andExpect(status().isCreated());

        return productId;
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
