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
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Reports over HTTP — FR-RPT.
 *
 * <p>Two things are worth proving. That the figures are the database's answer
 * over the whole period, not a sum of whatever a screen had loaded — which is
 * right at a hundred sales and quietly wrong at a hundred and one. And
 * FR-RPT-05: that a caller without {@code report.view_profit} is not sent a
 * cost at all, rather than sent one the screen promises to hide.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Reports HTTP contract")
class ReportControllerTest {

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
    private UUID terminalId;
    private UUID ownerId;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("R" + run.substring(0, 5), "Report Branch " + run)).getId();
        terminalId = terminals.save(new Terminal(outletId, "01", "Counter 1", 1L, 1000L)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        ownerId = users.save(owner).getId();

        // A cashier may sell and see their own dashboard, and holds neither
        // report.view nor report.view_profit.
        cashierName = "cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Test Cashier", passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        cashier.assignOutlet(outletId);
        users.save(cashier);

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(cashierName);
    }

    @Nested
    @DisplayName("the figures are the database's, over the whole period")
    class Figures {

        @Test
        @DisplayName("revenue, cost and profit come from the frozen cost — FR-RPT-06, BR-5")
        void profitUsesTheFrozenCost() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            // Received at 10.00, sold at 40.00: 30.00 profit a unit.
            String productId = stockedProduct(session, "Cable " + run, "10.00");
            sell(session, productId, "2", "40.00");

            mvc.perform(session.authorise(get("/api/reports/summary").param("outletId", outletId.toString())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.saleCount").value(1))
                    .andExpect(jsonPath("$.revenue").value(80.00))
                    .andExpect(jsonPath("$.cost").value(20.00))
                    .andExpect(jsonPath("$.profit").value(60.00))
                    .andExpect(jsonPath("$.marginPercent").value(75.0));
        }

        @Test
        @DisplayName("a later cost change does not restate an old sale — BR-5, FR-RPT-06")
        void restockingDoesNotRewriteHistory() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String productId = stockedProduct(session, "Conduit " + run, "10.00");
            sell(session, productId, "1", "40.00");

            // The next delivery costs three times as much. The sale already
            // made keeps the cost it was made at.
            receive(session, productId, "10", "30.00");

            mvc.perform(session.authorise(get("/api/reports/summary").param("outletId", outletId.toString())))
                    .andExpect(jsonPath("$.cost").value(10.00))
                    .andExpect(jsonPath("$.profit").value(30.00));
        }

        @Test
        @DisplayName("a voided sale is not revenue, and is counted as a void — BR-3")
        void voidsAreNotRevenue() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String productId = stockedProduct(session, "Socket " + run, "10.00");
            String kept = sell(session, productId, "1", "40.00");
            String scrapped = sell(session, productId, "1", "60.00");

            mvc.perform(session.authorise(post("/api/sales/" + scrapped + "/void"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "Wrong item"))))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(get("/api/reports/summary").param("outletId", outletId.toString())))
                    .andExpect(jsonPath("$.saleCount").value(1))
                    .andExpect(jsonPath("$.revenue").value(40.00))
                    .andExpect(jsonPath("$.voidCount").value(1))
                    .andExpect(jsonPath("$.voidedValue").value(60.00));

            // BR-3: the void is still on the record, with who and why.
            mvc.perform(session.authorise(get("/api/reports/exceptions").param("log", "void")
                            .param("outletId", outletId.toString())))
                    .andExpect(jsonPath("$[0].reason").value("Wrong item"))
                    .andExpect(jsonPath("$[0].approver").value("Test Owner"));
            org.junit.jupiter.api.Assertions.assertNotNull(kept);
        }

        @Test
        @DisplayName("a date range outside the sales returns zero, not the whole table")
        void theRangeIsHonoured() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String productId = stockedProduct(session, "Bulb " + run, "10.00");
            sell(session, productId, "1", "40.00");

            Instant lastYear = Instant.now().minus(400, ChronoUnit.DAYS);
            mvc.perform(session.authorise(get("/api/reports/summary").param("outletId", outletId.toString())
                            .param("from", lastYear.toString())
                            .param("to", lastYear.plus(1, ChronoUnit.DAYS).toString())))
                    .andExpect(jsonPath("$.saleCount").value(0))
                    .andExpect(jsonPath("$.revenue").value(0));
        }
    }

    @Nested
    @DisplayName("grouped reports")
    class Grouped {

        @Test
        @DisplayName("by product, by category and by cashier each add up to the same revenue")
        void groupingsAgree() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String first = stockedProduct(session, "Breaker " + run, "10.00");
            String second = stockedProduct(session, "Switch " + run, "5.00");
            sell(session, first, "2", "40.00");
            sell(session, second, "1", "50.00");

            // 2 x 40 + 1 x 50 = 130.00 however it is sliced.
            for (String by : List.of("product", "category", "cashier", "customer")) {
                MvcResult result = mvc.perform(session.authorise(get("/api/reports/breakdown").param("by", by)
                                .param("outletId", outletId.toString())))
                        .andExpect(status().isOk()).andReturn();
                double total = 0;
                for (var row : json.readTree(result.getResponse().getContentAsString())) {
                    total += row.get("revenue").asDouble();
                }
                org.junit.jupiter.api.Assertions.assertEquals(130.00, total, 0.001,
                        "grouping by " + by + " did not agree: " + result.getResponse().getContentAsString());
            }
        }

        @Test
        @DisplayName("a payment breakdown counts payments, not sales — a split sale is two rows")
        void splitPaymentsAreTwoRows() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String productId = stockedProduct(session, "Meter " + run, "10.00");

            Map<String, Object> body = saleBody(productId, "1", "40.00");
            body.put("payments", List.of(
                    payment("cash", 1500L),
                    payment("momo", 2500L)));
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated());

            mvc.perform(session.authorise(get("/api/reports/breakdown").param("by", "payment")
                            .param("outletId", outletId.toString())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2));
        }

        @Test
        @DisplayName("slow movers include what sold nothing at all")
        void slowMoversIncludeTheUnsold() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String moving = stockedProduct(session, "Popular " + run, "10.00");
            String stuck = stockedProduct(session, "Gathering Dust " + run, "10.00");
            sell(session, moving, "5", "40.00");

            MvcResult result = mvc.perform(session.authorise(get("/api/reports/ranking")
                            .param("direction", "slow").param("limit", "50")
                            .param("outletId", outletId.toString())))
                    .andExpect(status().isOk()).andReturn();

            String body = result.getResponse().getContentAsString();
            // A product with no sales never appears in a sales table, and it is
            // exactly the one a slow-movers report exists to show.
            org.junit.jupiter.api.Assertions.assertTrue(body.contains("Gathering Dust " + run), body);
            org.junit.jupiter.api.Assertions.assertEquals(stuck,
                    json.readTree(body).get(0).get("key").asText(),
                    "the least-sold product should be first: " + body);
        }

        @Test
        @DisplayName("an unknown grouping is refused rather than answered with something else")
        void unknownGroupingIsRefused() throws Exception {
            mvc.perform(signIn(ownerName).authorise(get("/api/reports/breakdown").param("by", "weather")))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("the dashboard chart's series")
    class Series {

        @Test
        @DisplayName("returns every bucket in the range, including the quiet days")
        void quietDaysAreZeroNotMissing() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String productId = stockedProduct(session, "Charted " + run, "10.00");
            sell(session, productId, "1", "40.00");

            Instant to = Instant.now();
            Instant from = to.minus(6, ChronoUnit.DAYS);

            MvcResult result = mvc.perform(session.authorise(get("/api/reports/series")
                            .param("bucket", "DAY")
                            .param("from", from.toString()).param("to", to.toString())
                            .param("outletId", outletId.toString())))
                    .andExpect(status().isOk()).andReturn();

            var body = json.readTree(result.getResponse().getContentAsString());
            // Seven days asked for, seven points back. A chart drawn only
            // through the busy days is the wrong shape.
            org.junit.jupiter.api.Assertions.assertEquals(7, body.size(), body.toString());

            double sales = 0;
            for (var point : body) sales += point.get("sales").asDouble();
            org.junit.jupiter.api.Assertions.assertEquals(40.00, sales, 0.001, body.toString());
        }

        @Test
        @DisplayName("counts goods received as purchases, against the takings")
        void purchasesAreTheOtherSide() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            // 20 received at 10.00 is GH200.00 of purchases.
            String productId = stockedProduct(session, "Delivered " + run, "10.00");
            sell(session, productId, "1", "40.00");

            MvcResult result = mvc.perform(session.authorise(get("/api/reports/series")
                            .param("bucket", "DAY")
                            .param("outletId", outletId.toString())))
                    .andExpect(status().isOk()).andReturn();

            double purchases = 0;
            for (var point : json.readTree(result.getResponse().getContentAsString())) {
                purchases += point.get("purchases").asDouble();
            }
            org.junit.jupiter.api.Assertions.assertEquals(200.00, purchases, 0.001);
        }

        @Test
        @DisplayName("splits takings by the kind of customer — FR-CUST-04")
        void byCustomerType() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String productId = stockedProduct(session, "Split " + run, "10.00");

            Map<String, Object> customerBody = new LinkedHashMap<>();
            customerBody.put("name", "Sparks " + run);
            customerBody.put("phone", "059" + Math.abs(run.hashCode() % 1000000));
            customerBody.put("type", "electrician");
            MvcResult created = mvc.perform(session.authorise(post("/api/customers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(customerBody)))
                    .andExpect(status().isCreated()).andReturn();
            String customerId = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

            Map<String, Object> attributed = saleBody(productId, "1", "40.00");
            attributed.put("customerId", customerId);
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(attributed)))
                    .andExpect(status().isCreated());

            // And one walk-in, which is a row of its own, not a gap.
            sell(session, productId, "1", "60.00");

            MvcResult result = mvc.perform(session.authorise(get("/api/reports/breakdown")
                            .param("by", "customer_type").param("outletId", outletId.toString())))
                    .andExpect(status().isOk()).andReturn();

            String body = result.getResponse().getContentAsString();
            org.junit.jupiter.api.Assertions.assertTrue(body.contains("electrician"), body);
            org.junit.jupiter.api.Assertions.assertTrue(body.contains("walk-in"), body);
        }
    }

    @Nested
    @DisplayName("who sees cost — FR-RPT-05")
    class Profit {

        @Test
        @DisplayName("a cashier cannot open a report at all")
        void reportsNeedReportView() throws Exception {
            mvc.perform(signIn(cashierName).authorise(get("/api/reports/summary").param("outletId", outletId.toString())))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("without report.view_profit the cost is absent, not hidden")
        void costIsNotSent() throws Exception {
            Session owner = signIn(ownerName);
            openShift();
            String productId = stockedProduct(owner, "Priced " + run, "10.00");
            sell(owner, productId, "1", "40.00");

            // A manager who reports but may not see profit: report.view granted,
            // report.view_profit withheld.
            String reader = "reader-" + run.toLowerCase();
            User user = new User(reader, "Test Reader", passwords.encode(PASSWORD));
            user.assignRole(Role.MANAGER);
            user.assignOutlet(outletId);
            UUID readerId = users.save(user).getId();
            loginAttempts.recordSuccess(reader);

            mvc.perform(owner.authorise(put("/api/users/" + readerId + "/permissions/report.view_profit")
                            .param("granted", "false")))
                    .andExpect(status().isOk());

            Session theirs = signIn(reader);
            mvc.perform(theirs.authorise(get("/api/reports/summary").param("outletId", outletId.toString())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.revenue").value(40.00))
                    .andExpect(jsonPath("$.cost").doesNotExist())
                    .andExpect(jsonPath("$.profit").doesNotExist());

            mvc.perform(theirs.authorise(get("/api/reports/breakdown").param("by", "product")
                            .param("outletId", outletId.toString())))
                    .andExpect(jsonPath("$[0].revenue").value(40.00))
                    .andExpect(jsonPath("$[0].cost").doesNotExist());

            mvc.perform(theirs.authorise(get("/api/reports/stock").param("view", "valuation")
                            .param("outletId", outletId.toString())))
                    .andExpect(jsonPath("$[0].averageCost").doesNotExist())
                    .andExpect(jsonPath("$[0].valueAtCost").doesNotExist());
        }
    }

    @Nested
    @DisplayName("the dashboard — FR-RPT-01, FR-RPT-02")
    class DashboardScope {

        @Test
        @DisplayName("shows today's figures and a combined line")
        void showsTodayAndCombined() throws Exception {
            Session session = signIn(ownerName);
            openShift();
            String productId = stockedProduct(session, "Dash " + run, "10.00");
            sell(session, productId, "1", "40.00");

            MvcResult result = mvc.perform(session.authorise(get("/api/reports/dashboard")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.combined.outletName").value("All branches"))
                    .andReturn();

            var body = json.readTree(result.getResponse().getContentAsString());
            var mine = java.util.stream.StreamSupport
                    .stream(body.get("outlets").spliterator(), false)
                    .filter(row -> row.get("outletId").asText().equals(outletId.toString()))
                    .findFirst().orElseThrow();

            org.junit.jupiter.api.Assertions.assertEquals(40.00, mine.get("salesToday").asDouble(), 0.001);
            org.junit.jupiter.api.Assertions.assertEquals(1, mine.get("receiptsToday").asInt());
            org.junit.jupiter.api.Assertions.assertEquals(1, mine.get("openShifts").asInt());
            // BR-14: the float plus what the till took in cash.
            org.junit.jupiter.api.Assertions.assertEquals(140.00, mine.get("expectedCash").asDouble(), 0.001);
        }

        @Test
        @DisplayName("a cashier sees only the branch they are assigned to")
        void scopedToAssignedBranches() throws Exception {
            // A second branch the cashier is not assigned to.
            UUID otherId = outlets.save(new Outlet("S" + run.substring(0, 5), "Other Branch " + run)).getId();

            MvcResult result = mvc.perform(signIn(cashierName).authorise(get("/api/reports/dashboard")))
                    .andExpect(status().isOk()).andReturn();

            String body = result.getResponse().getContentAsString();
            org.junit.jupiter.api.Assertions.assertTrue(body.contains(outletId.toString()), body);
            org.junit.jupiter.api.Assertions.assertFalse(body.contains(otherId.toString()),
                    "a cashier was shown a branch they are not assigned to: " + body);
        }
    }

    // --- helpers -----------------------------------------------------------

    private void openShift() {
        shiftService.open(terminalId, 10_000L,
                new PosPrincipal(ownerId, ownerName, outletId, Instant.now()), "127.0.0.1");
    }

    private String stockedProduct(Session session, String name, String unitCost) throws Exception {
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
        receive(session, productId, "20", unitCost);
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

    private Map<String, Object> payment(String method, long amount) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", UUID.randomUUID().toString());
        row.put("method", method);
        row.put("amount", amount);
        return row;
    }

    private Map<String, Object> saleBody(String productId, String quantity, String price) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("selectedUnit", "pc");
        line.put("conversionFactor", "1");
        line.put("quantity", quantity);
        line.put("unitPrice", price);

        long total = Math.round(Double.parseDouble(quantity) * Double.parseDouble(price) * 100);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", UUID.randomUUID().toString());
        body.put("outletId", outletId.toString());
        body.put("terminalId", terminalId.toString());
        body.put("items", List.of(line));
        body.put("payments", List.of(payment("cash", total)));
        return body;
    }

    private String sell(Session session, String productId, String quantity, String price) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/sales"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(saleBody(productId, quantity, price))))
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
