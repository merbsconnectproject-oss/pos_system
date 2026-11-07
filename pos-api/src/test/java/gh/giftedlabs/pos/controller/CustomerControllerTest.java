package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Customers over HTTP — FR-CUST.
 *
 * <p>The rule worth proving hardest is FR-CUST-03. A shop writes the same
 * number four ways, and a list that lets one person become four records will
 * quote them four prices and show each of them a quarter of their history.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Customers HTTP contract")
class CustomerControllerTest {

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
    private String ownerName;
    private String cashierName;
    private String keeperName;
    private UUID outletId;
    private UUID secondOutletId;
    private UUID terminalId;
    private UUID secondTerminalId;
    private UUID cashierId;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("L" + run.substring(0, 5), "Customer Branch " + run)).getId();
        secondOutletId = outlets.save(new Outlet("M" + run.substring(0, 5), "Second Branch " + run)).getId();
        terminalId = terminals.save(new Terminal(outletId, "01", "Counter 1", 1L, 1000L)).getId();
        secondTerminalId = terminals.save(new Terminal(secondOutletId, "01", "Counter 1", 1L, 1000L)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        owner.assignOutlet(secondOutletId);
        users.save(owner);

        cashierName = "cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Test Cashier", passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        cashier.assignOutlet(outletId);
        cashier.assignOutlet(secondOutletId);
        cashierId = users.save(cashier).getId();

        // A storekeeper can see customers and cannot edit them.
        keeperName = "keeper-" + run.toLowerCase();
        User keeper = new User(keeperName, "Test Keeper", passwords.encode(PASSWORD));
        keeper.assignRole(Role.STOREKEEPER);
        keeper.assignOutlet(outletId);
        users.save(keeper);

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(cashierName);
        loginAttempts.recordSuccess(keeperName);
    }

    @Nested
    @DisplayName("the phone number is the key")
    class PhoneIsTheKey {

        @Test
        @DisplayName("the same number written another way is the same customer — FR-CUST-03")
        void sameNumberDifferentSpelling() throws Exception {
            Session session = signIn(cashierName);
            create(session, customer("Kwame Osei " + run, phone(1), "electrician"));

            MvcResult clash = mvc.perform(session.authorise(post("/api/customers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    customer("Kwame O " + run, phone(1).replaceFirst("^0", "+233 "), "retail"))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("CUSTOMER_PHONE_TAKEN"))
                    // The record that already exists travels with the refusal,
                    // so the counter can be offered it rather than left to
                    // invent a second number with a digit changed.
                    .andExpect(jsonPath("$.details.name").value("Kwame Osei " + run))
                    .andExpect(jsonPath("$.details.customerId").isNotEmpty())
                    .andReturn();
        }

        @Test
        @DisplayName("and is found by any spelling of it — FR-CUST-03")
        void lookupIgnoresSpelling() throws Exception {
            Session session = signIn(cashierName);
            create(session, customer("Adjoa Mensah " + run, phone(2), "retail"));

            mvc.perform(session.authorise(get("/api/customers/by-phone")
                            .param("phone", phone(2).replaceFirst("^0", "+233"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Adjoa Mensah " + run));
        }

        @Test
        @DisplayName("a number nobody has is no content, not an error — FR-CUST-01")
        void unknownNumberIsOrdinary() throws Exception {
            mvc.perform(signIn(cashierName).authorise(get("/api/customers/by-phone?phone=0500000000")))
                    .andExpect(status().isNoContent());
        }

        @Test
        @DisplayName("a number too short to find anyone by is refused")
        void tooShortIsRefused() throws Exception {
            mvc.perform(signIn(cashierName).authorise(post("/api/customers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(customer("Typo " + run, "024", "retail"))))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("a name with a digit in it does not match somebody else's number")
        void namesAreNotPhoneNumbers() throws Exception {
            Session session = signIn(cashierName);
            create(session, customer("Unit 3 Electricals " + run, phone(1), "company"));
            create(session, customer("Ama Boateng " + run, phone(14), "retail"));

            // "Unit 3" has a digit; pulling digits out of a name and matching
            // them against phone keys returns whoever has a 3 in their number.
            MvcResult result = mvc.perform(session.authorise(get("/api/customers")
                            .param("query", "Unit 3 Electricals " + run)))
                    .andExpect(status().isOk()).andReturn();

            String body = result.getResponse().getContentAsString();
            org.junit.jupiter.api.Assertions.assertFalse(body.contains("Ama Boateng " + run),
                    "a name search matched an unrelated number: " + body);
        }

        @Test
        @DisplayName("searching by the printed number finds the stored one")
        void searchMatchesOnTheKey() throws Exception {
            Session session = signIn(cashierName);
            create(session, customer("Yaw Antwi " + run, phone(3).replaceFirst("^0", "+233"), "contractor"));

            mvc.perform(session.authorise(get("/api/customers").param("query", phone(3))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].name").value("Yaw Antwi " + run));
        }
    }

    @Nested
    @DisplayName("what a customer record holds")
    class Records {

        @Test
        @DisplayName("name, phone, email, address, type and notes all survive — FR-CUST-02")
        void everyFieldIsKept() throws Exception {
            Session session = signIn(cashierName);
            Map<String, Object> body = customer("Esi Owusu " + run, phone(4), "company");
            body.put("email", "esi@example.com");
            body.put("address", "12 Lagos Avenue, East Legon");
            body.put("notes", "Buys distribution boards in tens");

            String id = create(session, body);

            mvc.perform(session.authorise(get("/api/customers/" + id)))
                    .andExpect(jsonPath("$.email").value("esi@example.com"))
                    .andExpect(jsonPath("$.address").value("12 Lagos Avenue, East Legon"))
                    .andExpect(jsonPath("$.notes").value("Buys distribution boards in tens"))
                    .andExpect(jsonPath("$.customerType").value("company"));
        }

        @Test
        @DisplayName("the type sets the price level and the starting discount — FR-CUST-04")
        void typeMapsToAPriceLevel() throws Exception {
            Session session = signIn(cashierName);

            String walkIn = create(session, customer("Walk In " + run, phone(5), "retail"));
            String trade = create(session, customer("Sparks " + run, phone(6), "electrician"));

            mvc.perform(session.authorise(get("/api/customers/" + walkIn)))
                    .andExpect(jsonPath("$.priceLevel").value("RETAIL"))
                    .andExpect(jsonPath("$.discountRate").value(0));
            mvc.perform(session.authorise(get("/api/customers/" + trade)))
                    .andExpect(jsonPath("$.priceLevel").value("TRADE"))
                    .andExpect(jsonPath("$.discountRate").value(8));
        }

        @Test
        @DisplayName("an agreed rate overrides the type's, and is not lost on the next edit — FR-PRICE-05")
        void anAgreedRateSticks() throws Exception {
            Session session = signIn(cashierName);
            Map<String, Object> body = customer("Kofi Build " + run, phone(7), "contractor");
            body.put("discountRate", "15");
            String id = create(session, body);

            mvc.perform(session.authorise(get("/api/customers/" + id)))
                    .andExpect(jsonPath("$.discountRate").value(15));

            // Editing the name while sending the same rate keeps it.
            body.put("name", "Kofi Build Ltd " + run);
            mvc.perform(session.authorise(put("/api/customers/" + id))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.discountRate").value(15));
        }

        @Test
        @DisplayName("no rate sent means the type's rate, not zero — FR-PRICE-05")
        void noRateMeansTheTypesRate() throws Exception {
            Session session = signIn(cashierName);
            String id = create(session, customer("Default Rate " + run, phone(8), "company"));

            mvc.perform(session.authorise(get("/api/customers/" + id)))
                    .andExpect(jsonPath("$.discountRate").value(12));
        }

        @Test
        @DisplayName("deactivated, never deleted — BR-17")
        void deactivatedNotDeleted() throws Exception {
            Session session = signIn(cashierName);
            String id = create(session, customer("Gone Away " + run, phone(9), "retail"));

            mvc.perform(session.authorise(post("/api/customers/" + id + "/active?value=false")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.active").value(false));

            // Off the list by default, still there when asked for.
            mvc.perform(session.authorise(get("/api/customers").param("query", "Gone Away " + run)))
                    .andExpect(jsonPath("$.length()").value(0));
            mvc.perform(session.authorise(get("/api/customers")
                            .param("includeInactive", "true").param("query", "Gone Away " + run)))
                    .andExpect(jsonPath("$.length()").value(1));
            mvc.perform(session.authorise(get("/api/customers/" + id)))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("who may read and who may write")
    class Access {

        @Test
        @DisplayName("a storekeeper may look a customer up and may not edit them")
        void readOpenWriteClosed() throws Exception {
            Session cashier = signIn(cashierName);
            String id = create(cashier, customer("Readable " + run, phone(10), "retail"));

            Session keeper = signIn(keeperName);
            mvc.perform(keeper.authorise(get("/api/customers/" + id)))
                    .andExpect(status().isOk());

            mvc.perform(keeper.authorise(put("/api/customers/" + id))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(customer("Renamed " + run, phone(10), "retail"))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }
    }

    @Nested
    @DisplayName("purchase history")
    class History {

        @Test
        @DisplayName("counts what they bought at either branch, and not what was voided — FR-CUST-05, FR-CUST-06")
        void acrossBranchesAndWithoutVoids() throws Exception {
            Session session = signIn(cashierName);
            String customerId = create(session, customer("Regular " + run, phone(11), "electrician"));

            // One purchase at each branch. BR-13 allows one open shift per
            // cashier, so the first is closed before the second opens.
            shiftService.open(terminalId, 10_000L, principal(outletId), "127.0.0.1");
            String firstProduct = stockedProduct(session, "Cable " + run, outletId);
            sell(session, customerId, firstProduct, outletId, terminalId, "40.00");
            closeOpenShift(session);

            shiftService.open(secondTerminalId, 10_000L, principal(secondOutletId), "127.0.0.1");
            String secondProduct = stockedProduct(session, "Conduit " + run, secondOutletId);
            String voided = sell(session, customerId, secondProduct, secondOutletId, secondTerminalId, "60.00");

            mvc.perform(session.authorise(get("/api/customers/" + customerId)))
                    .andExpect(jsonPath("$.salesCount").value(2))
                    .andExpect(jsonPath("$.totalPurchased").value(100.00));

            // A cashier may not void; a manager or owner does it — FR-POS-19.
            mvc.perform(signIn(ownerName).authorise(post("/api/sales/" + voided + "/void"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "Wrong item"))))
                    .andExpect(status().isOk());

            // BR-3: the sale is still in their history; it is no longer money spent.
            mvc.perform(session.authorise(get("/api/customers/" + customerId)))
                    .andExpect(jsonPath("$.salesCount").value(1))
                    .andExpect(jsonPath("$.totalPurchased").value(40.00));

            mvc.perform(session.authorise(get("/api/customers/" + customerId + "/sales")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2));
        }

        @Test
        @DisplayName("a sale carries the name the business holds, not the one the browser sent — FR-CUST-02")
        void theRecordWins() throws Exception {
            Session session = signIn(cashierName);
            String customerId = create(session, customer("Correct Name " + run, phone(12), "retail"));

            shiftService.open(terminalId, 10_000L, principal(outletId), "127.0.0.1");
            String productId = stockedProduct(session, "Socket " + run, outletId);

            Map<String, Object> body = saleBody(customerId, productId, outletId, terminalId, "40.00");
            body.put("customerName", "Whatever The Tab Remembered");
            body.put("customerPhone", "0000000000");

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.customerName").value("Correct Name " + run))
                    .andExpect(jsonPath("$.customerPhone").value(phone(12)));
        }

        @Test
        @DisplayName("a deactivated customer cannot be sold to — BR-17")
        void deactivatedCannotBuy() throws Exception {
            Session session = signIn(cashierName);
            String customerId = create(session, customer("Blocked " + run, phone(13), "retail"));
            mvc.perform(session.authorise(post("/api/customers/" + customerId + "/active?value=false")))
                    .andExpect(status().isOk());

            shiftService.open(terminalId, 10_000L, principal(outletId), "127.0.0.1");
            String productId = stockedProduct(session, "Bulb " + run, outletId);

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    saleBody(customerId, productId, outletId, terminalId, "40.00"))))
                    .andExpect(status().isBadRequest());
        }
    }

    // --- helpers -----------------------------------------------------------

    private PosPrincipal principal(UUID outlet) {
        return new PosPrincipal(cashierId, cashierName, outlet, Instant.now());
    }

    /**
     * A number unique to this run.
     *
     * <p>FR-CUST-05 makes one list for the whole business, so the phone number
     * is unique across the whole database — two test classes sharing a literal
     * number would fight over it.
     */
    private String phone(int suffix) {
        return "02%02d%03d%03d".formatted(Math.abs(run.hashCode()) % 100,
                Math.abs(run.hashCode() / 100) % 1000, suffix);
    }

    private Map<String, Object> customer(String name, String phone, String type) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("phone", phone);
        body.put("type", type);
        return body;
    }

    private String create(Session session, Map<String, Object> body) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/customers"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    /**
     * A product with stock at one branch, priced so 40.00 is above its floor.
     *
     * <p>Seeded by an owner, not by the cashier under test: a cashier cannot
     * create products or receive stock, and borrowing their session here would
     * be testing the seed rather than the customer.
     */
    private String stockedProduct(Session unusedSession, String name, UUID outlet) throws Exception {
        Session session = signIn(ownerName);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", "pc");
        body.put("retailPrice", "60.00");
        body.put("tradePrice", "50.00");
        body.put("floorPrice", "30.00");

        MvcResult created = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        String productId = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

        Map<String, Object> movement = new LinkedHashMap<>();
        movement.put("productId", productId);
        movement.put("outletId", outlet.toString());
        movement.put("type", "RECEIPT");
        movement.put("quantity", "20");
        movement.put("unitCost", "25.00");
        mvc.perform(session.authorise(post("/api/stock/movements"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(movement)))
                .andExpect(status().isCreated());
        return productId;
    }

    private Map<String, Object> saleBody(String customerId, String productId, UUID outlet,
                                         UUID terminal, String price) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("selectedUnit", "pc");
        line.put("conversionFactor", "1");
        line.put("quantity", "1");
        line.put("unitPrice", price);

        Map<String, Object> payment = new LinkedHashMap<>();
        payment.put("id", UUID.randomUUID().toString());
        payment.put("method", "cash");
        payment.put("amount", Math.round(Double.parseDouble(price) * 100));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", UUID.randomUUID().toString());
        body.put("outletId", outlet.toString());
        body.put("terminalId", terminal.toString());
        body.put("customerId", customerId);
        body.put("items", List.of(line));
        body.put("payments", List.of(payment));
        return body;
    }

    private String sell(Session session, String customerId, String productId, UUID outlet,
                        UUID terminal, String price) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/sales"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                saleBody(customerId, productId, outlet, terminal, price))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private void closeOpenShift(Session session) throws Exception {
        MvcResult open = mvc.perform(session.authorise(get("/api/shifts/current")))
                .andExpect(status().isOk()).andReturn();
        String shiftId = json.readTree(open.getResponse().getContentAsString()).get("id").asText();
        mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("countedCash", 14_000,
                                "note", "Closed to open the next branch"))))
                .andExpect(status().isOk());
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
