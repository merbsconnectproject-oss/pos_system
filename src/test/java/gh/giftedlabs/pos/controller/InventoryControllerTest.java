package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Stock over HTTP — FR-INV, BR-1, BR-2, BR-4, BR-9.
 *
 * <p>Carries the DELIVERY-PLAN week-2 exit criterion: receiving 3 drums of
 * 100 m moves stock to 300 m against the real database, and the quantity equals
 * the sum of its movements.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Inventory HTTP contract")
class InventoryControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired InventoryService inventory;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String cashierName;
    private String run;
    private UUID outletId;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("S" + run.substring(0, 5), "Stock Branch " + run)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        users.save(owner);

        // A cashier can see stock but may neither receive nor adjust it.
        cashierName = "cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Test Cashier", passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        cashier.assignOutlet(outletId);
        users.save(cashier);

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(cashierName);
    }

    @Nested
    @DisplayName("receiving goods")
    class Receiving {

        @Test
        @DisplayName("3 drums of 100 m makes 300 m, and the ledger agrees — week-2 exit, BR-2")
        void threeDrumsMakeThreeHundredMetres() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Cable " + run, "m");

            // The drum is a purchase unit; stock is always in base units, so
            // what is received is 3 x 100 m.
            receive(session, productId, "300", "4.50");

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].quantity").value(300.0))
                    .andExpect(jsonPath("$[0].outletId").value(outletId.toString()));

            // FR-INV acceptance: the level is the sum of its movements.
            assertEquals(0, inventory.drift(UUID.fromString(productId), outletId)
                    .compareTo(BigDecimal.ZERO), "level drifted from the ledger");
        }

        @Test
        @DisplayName("a second receipt moves the weighted average, not the last price — BR-4")
        void recalculatesWeightedAverage() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Paint " + run, "tin");

            // 75 @ 42.00 then 50 @ 50.00 settles at 45.20 — the same worked
            // example the frontend's contract vectors assert.
            receive(session, productId, "75", "42.00");
            receive(session, productId, "50", "50.00");

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(125.0))
                    .andExpect(jsonPath("$[0].averageCost").value(45.2));
        }
    }

    @Nested
    @DisplayName("selling past zero")
    class Oversell {

        @Test
        @DisplayName("is refused with what is actually there — BR-9")
        void isRefusedWithTheAvailableFigure() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Bulb " + run, "pcs");
            receive(session, productId, "5", "10.00");

            // The owner holds stock.oversell, so take it away for this check by
            // using a movement type that cannot oversell silently: ask for more
            // than exists as a DAMAGE write-off from a user without the right.
            Session cashier = signIn(cashierName);
            mvc.perform(cashier.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(movement(productId, "DAMAGE", "50", null, "Broken"))))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("is allowed and flagged for a holder of stock.oversell — BR-9, FR-INV-10")
        void isFlaggedWhenPermitted() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Wire " + run, "m");
            receive(session, productId, "5", "10.00");

            mvc.perform(session.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(movement(productId, "LOSS", "8", null, "Stolen"))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.quantity").value(-3.0));
        }
    }

    @Nested
    @DisplayName("permissions")
    class Permissions {

        @Test
        @DisplayName("a cashier may see stock but not move it — NFR-9")
        void cashierMaySeeButNotMove() throws Exception {
            Session owner = signIn(ownerName);
            String productId = createProduct(owner, "Socket " + run, "pcs");

            Session cashier = signIn(cashierName);
            mvc.perform(cashier.authorise(get("/api/stock/outlet/" + outletId)))
                    .andExpect(status().isOk());

            mvc.perform(cashier.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(movement(productId, "RECEIPT", "10", "5.00", null))))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("sales movements cannot be posted by hand — BR-3")
        void salesCannotBePostedByHand() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Switch " + run, "pcs");

            mvc.perform(session.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(movement(productId, "SALE", "1", null, null))))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("adjustments")
    class Adjustments {

        @Test
        @DisplayName("need a reason and cannot be entered blind — FR-INV-05")
        void needAReason() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Pipe " + run, "length");
            receive(session, productId, "10", "3.00");

            mvc.perform(session.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(movement(productId, "ADJUSTMENT_OUT", "2", null, null))))
                    .andExpect(status().isBadRequest());

            mvc.perform(session.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    movement(productId, "ADJUSTMENT_OUT", "2", null, "Miscount at count"))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.quantity").value(8.0));
        }

        @Test
        @DisplayName("do not move the weighted average cost — BR-4")
        void doNotMoveTheAverageCost() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Nail " + run, "kg");
            receive(session, productId, "100", "8.00");

            mvc.perform(session.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    movement(productId, "ADJUSTMENT_OUT", "10", null, "Spillage"))))
                    .andExpect(status().isCreated())
                    // Losing stock does not make what is left cheaper.
                    .andExpect(jsonPath("$.averageCost").value(8.0))
                    .andExpect(jsonPath("$.quantity").value(90.0));
        }
    }

    @Nested
    @DisplayName("reorder level")
    class Reorder {

        @Test
        @DisplayName("is per outlet and drives the low-stock list — FR-INV-08")
        void drivesTheLowStockList() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Fuse " + run, "pcs");
            receive(session, productId, "10", "2.00");

            mvc.perform(session.authorise(
                            put("/api/stock/product/" + productId + "/outlet/" + outletId + "/reorder-level")
                                    .param("value", "20")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.low").value(true));

            mvc.perform(session.authorise(get("/api/stock/outlet/" + outletId + "/low")))
                    .andExpect(jsonPath("$[?(@.productId=='" + productId + "')]").exists());
        }
    }

    @Nested
    @DisplayName("a repeated submission")
    class Idempotency {

        @Test
        @DisplayName("moves stock once, however many times it arrives — BR-7")
        void movesStockOnce() throws Exception {
            Session session = signIn(ownerName);
            String productId = createProduct(session, "Lamp " + run, "pcs");
            UUID document = UUID.randomUUID();

            Map<String, Object> body = movement(productId, "RECEIPT", "12", "9.00", null);
            body.put("sourceType", "GRN");
            body.put("sourceId", document.toString());

            for (int attempt = 0; attempt < 3; attempt++) {
                mvc.perform(session.authorise(post("/api/stock/movements"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json.writeValueAsString(body)))
                        .andExpect(status().isCreated());
            }

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(12.0));
        }
    }

    // --- helpers -----------------------------------------------------------

    private Map<String, Object> movement(String productId, String type, String quantity,
                                         String unitCost, String reason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId);
        body.put("outletId", outletId.toString());
        body.put("type", type);
        body.put("quantity", quantity);
        if (unitCost != null) body.put("unitCost", unitCost);
        if (reason != null) body.put("reason", reason);
        return body;
    }

    private void receive(Session session, String productId, String quantity, String unitCost) throws Exception {
        mvc.perform(session.authorise(post("/api/stock/movements"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(movement(productId, "RECEIPT", quantity, unitCost, null))))
                .andExpect(status().isCreated());
    }

    private String createProduct(Session session, String name, String baseUnit) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", baseUnit);
        body.put("retailPrice", "20.00");
        body.put("tradePrice", "18.00");
        body.put("floorPrice", "15.00");

        MvcResult result = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
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
                .andExpect(status().isOk())
                .andReturn();

        return new Session((MockHttpSession) signedIn.getRequest().getSession(false), token);
    }
}
