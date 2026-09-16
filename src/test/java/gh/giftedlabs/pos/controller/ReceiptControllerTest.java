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
 * Receipts over HTTP — FR-RCPT.
 *
 * <p>The layout itself is asserted without a database in {@code ReceiptLayoutTest}.
 * What is proved here is that the receipt is built from the sale as <em>stored</em>,
 * that a reprint is marked and logged, and that both paper widths produce
 * something a printer could take.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Receipts HTTP contract")
class ReceiptControllerTest {

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
    private String outletCode;
    private UUID outletId;
    private UUID terminalId;
    private UUID managerId;
    private String managerName;
    private String cashierName;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletCode = "P" + run.substring(0, 4);
        Outlet outlet = new Outlet(outletCode, "Receipt Branch " + run);
        outletId = outlets.save(outlet).getId();
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
    @DisplayName("printing a sale")
    class Printing {

        @Test
        @DisplayName("the receipt is built from the sale as stored — FR-RCPT-04")
        void builtFromTheStoredSale() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Armoured Cable " + run, "60.00");
            String saleId = sell(session, productId, "3", "60.00");

            MvcResult result = mvc.perform(session.authorise(get("/api/receipts/sale/" + saleId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.width").value("80mm"))
                    .andExpect(jsonPath("$.columns").value(48))
                    .andExpect(jsonPath("$.reprint").value(false))
                    .andReturn();

            String text = text(result);
            assertTrue(text.contains("Armoured Cable " + run), "the item should be on it:\n" + text);
            // 3 × 60.00, computed by the server from what it stored.
            assertTrue(text.contains("180.00"), "the total should be on it:\n" + text);
            assertTrue(text.contains("Receipt Branch " + run),
                    "the branch prints its own name — FR-SET-02:\n" + text);
            assertTrue(text.contains(outletCode + "-01-"),
                    "BR-6: the receipt number carries outlet and terminal:\n" + text);
        }

        @Test
        @DisplayName("both rolls render, and neither overflows its width — FR-RCPT-03")
        void bothWidths() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Distribution Board " + run, "340.00");
            String saleId = sell(session, productId, "1", "340.00");

            for (Map.Entry<String, Integer> roll : Map.of("80mm", 48, "58mm", 32).entrySet()) {
                MvcResult result = mvc.perform(session.authorise(get("/api/receipts/sale/" + saleId)
                                .param("width", roll.getKey())))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.columns").value(roll.getValue()))
                        .andReturn();

                JsonNode lines = json.readTree(result.getResponse().getContentAsString()).get("lines");
                lines.forEach(line -> assertTrue(line.asText().length() <= roll.getValue(),
                        "%s overflowed: \"%s\"".formatted(roll.getKey(), line.asText())));
            }
        }

        @Test
        @DisplayName("the ESC/POS job initialises and cuts — FR-RCPT-02")
        void escPosIsPrintable() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Conduit " + run, "15.00");
            String saleId = sell(session, productId, "2", "15.00");

            MvcResult result = mvc.perform(session.authorise(get("/api/receipts/sale/" + saleId)))
                    .andExpect(status().isOk()).andReturn();

            String encoded = json.readTree(result.getResponse().getContentAsString())
                    .get("escPos").asText();
            byte[] job = Base64.getDecoder().decode(encoded);

            assertEquals(0x1B, job[0], "a job must start by initialising the printer");
            assertEquals('@', job[1]);
            assertEquals('V', job[job.length - 3], "and end by cutting the paper");
        }

        @Test
        @DisplayName("an unknown paper width is refused rather than guessed")
        void unknownWidthRefused() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Clip " + run, "3.00");
            String saleId = sell(session, productId, "1", "3.00");

            mvc.perform(session.authorise(get("/api/receipts/sale/" + saleId)
                            .param("width", "76mm")))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("reprinting")
    class Reprinting {

        @Test
        @DisplayName("a reprint is marked, and otherwise identical — FR-RCPT-06")
        void reprintIsMarkedAndIdentical() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Breaker " + run, "95.00");
            String saleId = sell(session, productId, "2", "95.00");

            String original = text(mvc.perform(session.authorise(get("/api/receipts/sale/" + saleId)))
                    .andExpect(status().isOk()).andReturn());

            String reprint = text(mvc.perform(session.authorise(
                            post("/api/receipts/sale/" + saleId + "/reprint")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.reprint").value(true))
                    .andReturn());

            assertTrue(reprint.contains("*** REPRINT ***"), "a second copy must say so");
            assertFalse(original.contains("REPRINT"), "the original must not");

            // Everything else is the same document. A reprint that differed from
            // the original would be a different receipt for the same sale.
            assertEquals(
                    original.replaceAll("[-\\s]", ""),
                    reprint.replace("*** REPRINT ***", "").replaceAll("[-\\s]", ""),
                    "a reprint must be the same receipt");
        }

        @Test
        @DisplayName("a reprint is logged — somebody may have to account for the second copy")
        void reprintIsAudited() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Socket " + run, "25.00");
            String saleId = sell(session, productId, "1", "25.00");

            mvc.perform(session.authorise(post("/api/receipts/sale/" + saleId + "/reprint")))
                    .andExpect(status().isOk());

            MvcResult log = mvc.perform(session.authorise(get("/api/audit")
                            .param("limit", "20")))
                    .andExpect(status().isOk()).andReturn();
            assertTrue(log.getResponse().getContentAsString().contains("RECEIPT_REPRINTED"),
                    "BR-15: a reprint belongs in the audit log");
        }

        @Test
        @DisplayName("a cashier may reprint by default — PRD §6 gives them sale.reprint")
        void cashierMayReprint() throws Exception {
            Session manager = signIn(managerName);
            openShift();
            String productId = stockedProduct(manager, "Lamp " + run, "18.00");
            String saleId = sell(manager, productId, "1", "18.00");

            // A customer asking for another copy at the counter is ordinary, so
            // the right sits with the person standing there.
            mvc.perform(signIn(cashierName).authorise(
                            post("/api/receipts/sale/" + saleId + "/reprint")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.reprint").value(true));
        }

        @Test
        @DisplayName("revoking sale.reprint from one cashier takes it away — FR-USER-03")
        void revokedOverrideIsHonoured() throws Exception {
            Session manager = signIn(managerName);
            openShift();
            String productId = stockedProduct(manager, "Fuse " + run, "6.00");
            String saleId = sell(manager, productId, "1", "6.00");

            User cashier = users.findByUsernameOrEmail(cashierName).orElseThrow();
            cashier.override(Permission.SALE_REPRINT, false);
            users.save(cashier);

            Session session = signIn(cashierName);
            mvc.perform(session.authorise(post("/api/receipts/sale/" + saleId + "/reprint")))
                    .andExpect(status().isForbidden());

            // Narrow: they can still print the sale they are ringing up.
            mvc.perform(session.authorise(get("/api/receipts/sale/" + saleId)))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("credit notes")
    class CreditNotes {

        @Test
        @DisplayName("a return prints through the same layout as the sale it reverses")
        void creditNoteMatchesTheReceiptShape() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Returned Lamp " + run, "45.00");
            String saleId = sell(session, productId, "2", "45.00");

            String receipt = text(mvc.perform(session.authorise(get("/api/receipts/sale/" + saleId)))
                    .andExpect(status().isOk()).andReturn());

            String returnId = refund(session, saleId, "1");
            String note = text(mvc.perform(session.authorise(
                            get("/api/receipts/return/" + returnId)))
                    .andExpect(status().isOk()).andReturn());

            // Same shop block, same rules, same right-aligned money. A customer
            // handed a receipt on the way in and a differently shaped slip on the
            // way out has two documents from what looks like two businesses.
            assertTrue(note.contains("Receipt Branch " + run), note);
            assertTrue(note.contains("CREDIT NOTE"), "the slip must say what it is:\n" + note);
            assertFalse(receipt.contains("CREDIT NOTE"), "a sale is not a credit note");

            assertTrue(note.contains("45.00"), "the price paid, not today's price:\n" + note);
            assertTrue(note.contains(outletCode + "-R"), "its own document number:\n" + note);
        }

        @Test
        @DisplayName("every printed amount carries a currency, on both documents")
        void amountsAreNeverBare() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String productId = stockedProduct(session, "Currency " + run, "30.00");
            String saleId = sell(session, productId, "1", "30.00");
            String returnId = refund(session, saleId, "1");

            for (String url : List.of("/api/receipts/sale/" + saleId,
                    "/api/receipts/return/" + returnId)) {
                String printed = text(mvc.perform(session.authorise(get(url)))
                        .andExpect(status().isOk()).andReturn());
                // GHS, not GH₵: code page 437 cannot render the cedi sign and it
                // would print as two pieces of rubbish. A bare 30.00 is the other
                // failure.
                assertTrue(printed.contains("GHS 30.00"),
                        "amounts must carry an ASCII currency:\n" + printed);
                assertFalse(printed.contains("₵"), "the cedi sign cannot be printed:\n" + printed);
            }
        }

        @Test
        @DisplayName("a swap says so, and names the receipt for the replacement goods")
        void exchangeNoteNamesBothSlips() throws Exception {
            Session session = signIn(managerName);
            openShift();
            String returned = stockedProduct(session, "Wrong " + run, "30.00");
            String replacement = stockedProduct(session, "Right " + run, "50.00");
            String saleId = sell(session, returned, "1", "30.00");

            MvcResult swap = mvc.perform(session.authorise(post("/api/returns"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(exchangeBody(saleId,
                                    firstLineId(session, saleId), replacement))))
                    .andExpect(status().isCreated()).andReturn();
            String returnId = json.readTree(swap.getResponse().getContentAsString()).get("id").asText();

            String note = text(mvc.perform(session.authorise(
                            get("/api/receipts/return/" + returnId)))
                    .andExpect(status().isOk()).andReturn());

            assertTrue(note.contains("EXCHANGE NOTE"), note);
            assertTrue(note.contains("Exchanged on"),
                    "the two slips have to be joinable:\n" + note);
        }
    }

    @Nested
    @DisplayName("previewing a layout")
    class Preview {

        @Test
        @DisplayName("both widths preview through the same layout the printer uses — FR-RCPT-09")
        void previewUsesTheRealLayout() throws Exception {
            Session session = signIn(managerName);

            for (String roll : List.of("80mm", "58mm")) {
                mvc.perform(session.authorise(get("/api/receipts/preview").param("width", roll)))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.width").value(roll))
                        .andExpect(jsonPath("$.receiptNumber").value("PREVIEW"))
                        .andExpect(jsonPath("$.lines.length()")
                                .value(org.hamcrest.Matchers.greaterThan(5)));
            }
        }

        @Test
        @DisplayName("previewing is a terminal setting, not something any cashier opens")
        void previewNeedsTerminalSettings() throws Exception {
            mvc.perform(signIn(cashierName).authorise(get("/api/receipts/preview")))
                    .andExpect(status().isForbidden());
        }
    }

    // --- helpers -----------------------------------------------------------

    /** Takes one unit back and returns the credit note's id. */
    private String refund(Session session, String saleId, String quantity) throws Exception {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("saleItemId", firstLineId(session, saleId));
        line.put("quantityBase", quantity);
        line.put("reason", "Customer Changed Mind");
        line.put("disposition", "RESTOCK");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("originalSaleId", saleId);
        body.put("kind", "REFUND");
        body.put("items", List.of(line));
        body.put("refundMethod", "CASH");

        MvcResult result = mvc.perform(session.authorise(post("/api/returns"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private Map<String, Object> exchangeBody(String saleId, String lineId, String replacementId) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("saleItemId", lineId);
        line.put("quantityBase", "1");
        line.put("reason", "Wrong Specification / Color");
        line.put("disposition", "RESTOCK");

        Map<String, Object> swapLine = new LinkedHashMap<>();
        swapLine.put("productId", replacementId);
        swapLine.put("selectedUnit", "pc");
        swapLine.put("conversionFactor", "1");
        swapLine.put("quantity", "1");
        swapLine.put("unitPrice", "50.00");

        Map<String, Object> payment = new LinkedHashMap<>();
        payment.put("id", UUID.randomUUID().toString());
        payment.put("method", "cash");
        payment.put("amount", 5000);

        Map<String, Object> sale = new LinkedHashMap<>();
        sale.put("id", UUID.randomUUID().toString());
        sale.put("outletId", outletId.toString());
        sale.put("terminalId", terminalId.toString());
        sale.put("items", List.of(swapLine));
        sale.put("payments", List.of(payment));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("originalSaleId", saleId);
        body.put("kind", "EXCHANGE");
        body.put("items", List.of(line));
        body.put("refundMethod", "CASH");
        body.put("exchangeSale", sale);
        return body;
    }

    private String firstLineId(Session session, String saleId) throws Exception {
        MvcResult result = mvc.perform(session.authorise(
                        get("/api/returns/returnable/" + saleId)))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString())
                .get("lines").get(0).get("saleItemId").asText();
    }

    private String text(MvcResult result) throws Exception {
        JsonNode lines = json.readTree(result.getResponse().getContentAsString()).get("lines");
        StringBuilder out = new StringBuilder();
        lines.forEach(line -> out.append(line.asText()).append('\n'));
        return out.toString();
    }

    private void openShift() {
        shiftService.open(terminalId, 50_000L,
                new PosPrincipal(managerId, managerName, outletId, Instant.now()), "127.0.0.1");
    }

    private String sell(Session session, String productId, String quantity, String price)
            throws Exception {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("selectedUnit", "pc");
        line.put("conversionFactor", "1");
        line.put("quantity", quantity);
        line.put("unitPrice", price);

        long total = Math.round(Double.parseDouble(quantity) * Double.parseDouble(price) * 100);

        Map<String, Object> payment = new LinkedHashMap<>();
        payment.put("id", UUID.randomUUID().toString());
        payment.put("method", "cash");
        payment.put("amount", total);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", UUID.randomUUID().toString());
        body.put("outletId", outletId.toString());
        body.put("terminalId", terminalId.toString());
        body.put("items", List.of(line));
        body.put("payments", List.of(payment));

        MvcResult result = mvc.perform(session.authorise(post("/api/sales"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private String stockedProduct(Session session, String name, String retail) throws Exception {
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
        movement.put("unitCost", "5.00");
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
