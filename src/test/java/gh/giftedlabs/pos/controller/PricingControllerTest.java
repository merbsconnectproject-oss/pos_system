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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pricing over HTTP — FR-PRICE.
 *
 * <p>These are the numbers a customer is charged, so the tests are about what
 * the server refuses: a branch price that cannot be reached, a cost figure
 * sent to somebody without the right to see it, and a floor that belongs to
 * the branch rather than the product.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Pricing HTTP contract")
class PricingControllerTest {

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
    private UUID outletId;
    private UUID otherOutletId;
    private UUID terminalId;
    private UUID ownerId;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("E" + run.substring(0, 5), "Price Branch " + run)).getId();
        otherOutletId = outlets.save(new Outlet("F" + run.substring(0, 5), "Other Branch " + run)).getId();
        terminalId = terminals.save(new Terminal(outletId, "01", "Counter 1", 1L, 1000L)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        owner.assignOutlet(otherOutletId);
        ownerId = users.save(owner).getId();

        // A cashier may see stock and may not see cost — FR-PRICE-07.
        cashierName = "cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Test Cashier", passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        cashier.assignOutlet(outletId);
        users.save(cashier);

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(cashierName);
    }

    @Nested
    @DisplayName("a branch's own prices — FR-PRICE-03")
    class Overrides {

        @Test
        @DisplayName("one level overridden leaves the others shared")
        void levelsAreIndependent() throws Exception {
            Session session = signIn(ownerName);
            String productId = product(session, "Cable " + run);

            mvc.perform(session.authorise(put("/api/products/" + productId + "/prices/" + outletId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(override("72.00", null, null))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.retailPrice").value(72.00))
                    // Null travels as null: "this branch charges the shared
                    // price" must be distinguishable from "this branch charges
                    // nothing".
                    .andExpect(jsonPath("$.tradePrice").doesNotExist())
                    .andExpect(jsonPath("$.floorPrice").doesNotExist());

            mvc.perform(session.authorise(get("/api/products/" + productId + "/prices")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].outletId").value(outletId.toString()));
        }

        @Test
        @DisplayName("clearing every level removes the override rather than storing an empty one")
        void clearingRemovesTheRow() throws Exception {
            Session session = signIn(ownerName);
            String productId = product(session, "Conduit " + run);

            mvc.perform(session.authorise(put("/api/products/" + productId + "/prices/" + outletId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(override("72.00", null, null))))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(delete("/api/products/" + productId + "/prices/" + outletId)))
                    .andExpect(status().isNoContent());

            mvc.perform(session.authorise(get("/api/products/" + productId + "/prices")))
                    .andExpect(jsonPath("$.length()").value(0));
        }

        @Test
        @DisplayName("a branch floor above its retail is refused — BR-10 holds per branch")
        void theFloorCannotExceedRetail() throws Exception {
            Session session = signIn(ownerName);
            String productId = product(session, "Breaker " + run);

            mvc.perform(session.authorise(put("/api/products/" + productId + "/prices/" + outletId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(override(null, null, "90.00"))))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("a cashier cannot set one — FR-PRICE-03 needs price.edit")
        void needsPriceEdit() throws Exception {
            String productId = product(signIn(ownerName), "Socket " + run);

            mvc.perform(signIn(cashierName).authorise(put("/api/products/" + productId + "/prices/" + outletId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(override("10.00", null, null))))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("the branch's floor is what the till is held to — FR-PRICE-03, BR-10")
        void theSaleUsesTheBranchFloor() throws Exception {
            Session session = signIn(ownerName);
            String productId = stocked(session, "Lamp " + run);
            shiftService.open(terminalId, 10_000L,
                    new PosPrincipal(ownerId, ownerName, outletId, Instant.now()), "127.0.0.1");

            // The product's floor is 30.00, so 25.00 needs approval.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(productId, "25.00"))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("BELOW_FLOOR_PRICE"));

            // This branch lowers its floor to 20.00. The same price is now
            // inside it, and no approval is needed.
            mvc.perform(session.authorise(put("/api/products/" + productId + "/prices/" + outletId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(override(null, null, "20.00"))))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(productId, "25.00"))))
                    .andExpect(status().isCreated());
        }
    }

    @Nested
    @DisplayName("cost is not for everybody — FR-PRICE-07")
    class CostVisibility {

        @Test
        @DisplayName("a cashier reading stock is sent no cost at all")
        void costIsStrippedNotHidden() throws Exception {
            Session owner = signIn(ownerName);
            String productId = stocked(owner, "Priced " + run);

            // The owner sees cost, and the replacement cost beside it.
            mvc.perform(owner.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].averageCost").value(10.00))
                    .andExpect(jsonPath("$[0].lastPurchaseCost").value(10.00));

            // The cashier sees the quantity and nothing about what it cost.
            // Stripped rather than hidden: a cashier could otherwise read every
            // cost in the shop from the network tab.
            mvc.perform(signIn(cashierName).authorise(get("/api/stock/product/" + productId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].quantity").value(20.0))
                    .andExpect(jsonPath("$[0].averageCost").doesNotExist())
                    .andExpect(jsonPath("$[0].lastPurchaseCost").doesNotExist());
        }

        @Test
        @DisplayName("the replacement cost is the latest receipt, not the average — FR-PRICE-08")
        void replacementCostIsTheLatestReceipt() throws Exception {
            Session session = signIn(ownerName);
            String productId = stocked(session, "Restocked " + run);

            // A second delivery at triple the price. The weighted average moves
            // partway; the replacement cost is what the last one cost.
            receive(session, productId, "20", "30.00");

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].averageCost").value(20.00))
                    .andExpect(jsonPath("$[0].lastPurchaseCost").value(30.00));
        }
    }

    @Nested
    @DisplayName("price history — FR-PRICE-06")
    class History {

        @Test
        @DisplayName("records each price the product has carried, and who set it")
        void everyChangeIsKept() throws Exception {
            Session session = signIn(ownerName);
            String productId = product(session, "Repriced " + run);

            Map<String, Object> body = productBody("Repriced " + run);
            body.put("retailPrice", "75.00");
            mvc.perform(session.authorise(put("/api/products/" + productId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(get("/api/products/" + productId + "/price-history")))
                    .andExpect(status().isOk())
                    // Newest first: what it costs now, then what it used to.
                    .andExpect(jsonPath("$[0].retailPrice").value(75.00))
                    .andExpect(jsonPath("$[0].changedBy").value("Test Owner"))
                    .andExpect(jsonPath("$[1].retailPrice").value(60.00));
        }

        @Test
        @DisplayName("a cashier cannot read it — it needs price.edit or report.view")
        void historyIsGated() throws Exception {
            String productId = product(signIn(ownerName), "Guarded " + run);

            mvc.perform(signIn(cashierName).authorise(get("/api/products/" + productId + "/price-history")))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("a customer's agreed rate — FR-PRICE-05")
    class AgreedRate {

        @Test
        @DisplayName("is honoured past the cashier's own ceiling")
        void agreedRateBeatsTheCeiling() throws Exception {
            Session session = signIn(ownerName);
            String productId = stocked(session, "Contracted " + run);
            shiftService.open(terminalId, 10_000L,
                    new PosPrincipal(ownerId, ownerName, outletId, Instant.now()), "127.0.0.1");

            // A contractor with 15% agreed, against an owner ceiling of 5%.
            Map<String, Object> customerBody = new LinkedHashMap<>();
            customerBody.put("name", "Kofi Build " + run);
            customerBody.put("phone", "024" + run.hashCode() % 1000000);
            customerBody.put("type", "contractor");
            customerBody.put("discountRate", "15");
            MvcResult created = mvc.perform(session.authorise(post("/api/customers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(customerBody)))
                    .andExpect(status().isCreated()).andReturn();
            String customerId = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

            lowerOwnerCeilingTo(session, 5);
            try {
                // 15% off 60.00 is 9.00 — past the 5% ceiling, inside the deal.
                Map<String, Object> body = sale(productId, "60.00");
                body.put("customerId", customerId);
                ((Map<String, Object>) ((List<?>) body.get("items")).get(0)).put("discount", 900L);
                body.put("payments", List.of(payment(5100L)));

                mvc.perform(session.authorise(post("/api/sales"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json.writeValueAsString(body)))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.discountTotal").value(900));

                // 40% is past the deal as well, and is still refused.
                Map<String, Object> greedy = sale(productId, "60.00");
                greedy.put("customerId", customerId);
                ((Map<String, Object>) ((List<?>) greedy.get("items")).get(0)).put("discount", 2400L);
                greedy.put("payments", List.of(payment(3600L)));

                mvc.perform(session.authorise(post("/api/sales"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json.writeValueAsString(greedy)))
                        .andExpect(status().isUnprocessableEntity())
                        .andExpect(jsonPath("$.code").value("DISCOUNT_ABOVE_CEILING"));
            } finally {
                lowerOwnerCeilingTo(session, 100);
            }
        }
    }

    // --- helpers -----------------------------------------------------------

    /** The ceilings are one global settings row; this puts back what it moves. */
    private void lowerOwnerCeilingTo(Session session, int percent) throws Exception {
        MvcResult current = mvc.perform(session.authorise(get("/api/settings")))
                .andExpect(status().isOk()).andReturn();
        Map<String, Object> view = json.readValue(current.getResponse().getContentAsString(), Map.class);

        @SuppressWarnings("unchecked")
        Map<String, Object> thresholds = new HashMap<>((Map<String, Object>) view.get("thresholds"));
        thresholds.put("discountCeilingByRole",
                Map.of("owner", percent, "manager", 25, "cashier", 10, "storekeeper", 0));

        Map<String, Object> body = new HashMap<>(view);
        body.remove("updatedAt");
        body.put("thresholds", thresholds);
        if (body.get("companyName") == null) body.put("companyName", "Pricing Test Co");

        mvc.perform(session.authorise(put("/api/settings"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    private Map<String, Object> override(String retail, String trade, String floor) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("retailPrice", retail);
        body.put("tradePrice", trade);
        body.put("floorPrice", floor);
        return body;
    }

    private Map<String, Object> productBody(String name) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", "pc");
        body.put("retailPrice", "60.00");
        body.put("tradePrice", "50.00");
        body.put("floorPrice", "30.00");
        return body;
    }

    private String product(Session session, String name) throws Exception {
        MvcResult created = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(productBody(name))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(created.getResponse().getContentAsString()).get("id").asText();
    }

    private String stocked(Session session, String name) throws Exception {
        String productId = product(session, name);
        receive(session, productId, "20", "10.00");
        return productId;
    }

    private void receive(Session session, String productId, String quantity, String unitCost) throws Exception {
        Map<String, Object> movement = new LinkedHashMap<>();
        movement.put("productId", productId);
        movement.put("outletId", outletId.toString());
        movement.put("type", "RECEIPT");
        movement.put("quantity", quantity);
        movement.put("unitCost", unitCost);
        mvc.perform(session.authorise(post("/api/stock/movements"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(movement)))
                .andExpect(status().isCreated());
    }

    private Map<String, Object> payment(long amount) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", UUID.randomUUID().toString());
        row.put("method", "cash");
        row.put("amount", amount);
        return row;
    }

    private Map<String, Object> sale(String productId, String price) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("selectedUnit", "pc");
        line.put("conversionFactor", "1");
        line.put("quantity", "1");
        line.put("unitPrice", price);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", UUID.randomUUID().toString());
        body.put("outletId", outletId.toString());
        body.put("terminalId", terminalId.toString());
        body.put("items", List.of(line));
        body.put("payments", List.of(payment(Math.round(Double.parseDouble(price) * 100))));
        return body;
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
