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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Suppliers and deliveries over HTTP — FR-SUP, BR-4.
 *
 * <p>Carries the checklist's non-functional line for K: receiving 75 @ 42.00
 * then 50 @ 50.00 yields 125 @ 45.20 — here through two real deliveries rather
 * than by calling the costing rule directly.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Suppliers and goods receipt HTTP contract")
class SupplierControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String cashierName;
    private String run;
    private UUID outletId;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("K" + run.substring(0, 5), "Supply Branch " + run)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        users.save(owner);

        cashierName = "cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Test Cashier", passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        cashier.assignOutlet(outletId);
        users.save(cashier);

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(cashierName);
    }

    @Nested
    @DisplayName("the supplier directory")
    class Directory {

        @Test
        @DisplayName("records the contact details a shop actually keeps — FR-SUP-01")
        void recordsContactDetails() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(post("/api/suppliers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(supplier("Nexans Ghana " + run))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.name").value("Nexans Ghana " + run))
                    .andExpect(jsonPath("$.contactPerson").value("Ama Serwaa"))
                    .andExpect(jsonPath("$.paymentTerms").value("Net 30"))
                    .andExpect(jsonPath("$.active").value(true))
                    .andExpect(jsonPath("$.totalSupplied").value(0));
        }

        @Test
        @DisplayName("refuses a name that differs only in case")
        void refusesACaseVariant() throws Exception {
            Session session = signIn(ownerName);
            String name = "Tropical Cables " + run;
            createSupplier(session, name);

            Map<String, Object> duplicate = supplier(name.toUpperCase());
            mvc.perform(session.authorise(post("/api/suppliers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(duplicate)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("LIST_NAME_TAKEN"));
        }

        @Test
        @DisplayName("a cashier may read it but not change it — NFR-9")
        void cashierMayReadNotWrite() throws Exception {
            Session cashier = signIn(cashierName);

            mvc.perform(cashier.authorise(get("/api/suppliers")))
                    .andExpect(status().isOk());

            mvc.perform(cashier.authorise(post("/api/suppliers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(supplier("Sneaky " + run))))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("receiving a delivery")
    class Receiving {

        @Test
        @DisplayName("3 drums of 100 m books in 300 m at 4.50 a metre — FR-SUP-04, FR-UOM-05")
        void drumsConvertToBaseUnits() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Drum Supplier " + run);
            String productId = createProduct(session, "Cable " + run, "m");

            // A drum of 100 m costing 450 is 4.50 a metre.
            mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "Drum 100m", "100", "3", "450.00")))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.lines[0].quantityInBaseUnits").value(300.0))
                    .andExpect(jsonPath("$.lines[0].resultingQuantity").value(300.0))
                    .andExpect(jsonPath("$.lines[0].resultingAverageCost").value(4.5))
                    .andExpect(jsonPath("$.total").value(1350.0));
        }

        @Test
        @DisplayName("75 @ 42.00 then 50 @ 50.00 yields 125 @ 45.20 — BR-4")
        void blendsTheWeightedAverage() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Paint Supplier " + run);
            String productId = createProduct(session, "Paint " + run, "tin");

            mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "tin", "1", "75", "42.00")))))
                    .andExpect(status().isCreated());

            mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "tin", "1", "50", "50.00")))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.lines[0].resultingQuantity").value(125.0))
                    .andExpect(jsonPath("$.lines[0].resultingAverageCost").value(45.2));
        }

        @Test
        @DisplayName("is refused against a retired supplier")
        void refusedAgainstARetiredSupplier() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Gone Supplier " + run);
            String productId = createProduct(session, "Widget " + run, "pcs");

            mvc.perform(session.authorise(post("/api/suppliers/" + supplierId + "/active?value=false")))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "pcs", "1", "10", "5.00")))))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("a cashier cannot book goods in — NFR-9")
        void cashierCannotReceive() throws Exception {
            Session owner = signIn(ownerName);
            String supplierId = createSupplier(owner, "Guarded Supplier " + run);
            String productId = createProduct(owner, "Guarded " + run, "pcs");

            Session cashier = signIn(cashierName);
            mvc.perform(cashier.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "pcs", "1", "10", "5.00")))))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("correcting a delivery")
    class Reversing {

        @Test
        @DisplayName("is a reversing document, and both stay visible — FR-SUP-06, BR-3")
        void reversesRatherThanEdits() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Wrong Supplier " + run);
            String productId = createProduct(session, "Mistake " + run, "pcs");

            MvcResult booked = mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "pcs", "1", "40", "6.00")))))
                    .andExpect(status().isCreated())
                    .andReturn();
            String receiptId = json.readTree(booked.getResponse().getContentAsString()).get("id").asText();

            mvc.perform(session.authorise(post("/api/goods-receipts/" + receiptId + "/reverse")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.reversesId").value(receiptId))
                    // The stock went back where it was.
                    .andExpect(jsonPath("$.lines[0].resultingQuantity").value(0.0));

            // Both documents remain, and the original is marked reversed.
            mvc.perform(session.authorise(get("/api/suppliers/" + supplierId + "/receipts")))
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[?(@.id=='" + receiptId + "')].reversed")
                            .value(org.hamcrest.Matchers.contains(true)));
        }

        @Test
        @DisplayName("happens once — FR-SUP-06")
        void onlyOnce() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Twice Supplier " + run);
            String productId = createProduct(session, "Twice " + run, "pcs");

            MvcResult booked = mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "pcs", "1", "5", "2.00")))))
                    .andExpect(status().isCreated()).andReturn();
            String receiptId = json.readTree(booked.getResponse().getContentAsString()).get("id").asText();

            mvc.perform(session.authorise(post("/api/goods-receipts/" + receiptId + "/reverse")))
                    .andExpect(status().isOk());
            mvc.perform(session.authorise(post("/api/goods-receipts/" + receiptId + "/reverse")))
                    .andExpect(status().isConflict());
        }
    }

    @Nested
    @DisplayName("purchase history")
    class History {

        @Test
        @DisplayName("totals what a supplier delivered, net of reversals — FR-SUP-07")
        void totalsNetOfReversals() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "History Supplier " + run);
            String productId = createProduct(session, "Tracked " + run, "pcs");

            mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "pcs", "1", "10", "20.00")))))
                    .andExpect(status().isCreated());

            mvc.perform(session.authorise(get("/api/suppliers/" + supplierId)))
                    .andExpect(jsonPath("$.totalSupplied").value(200.0));

            MvcResult second = mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId,
                                    line(productId, "pcs", "1", "5", "20.00")))))
                    .andExpect(status().isCreated()).andReturn();
            String secondId = json.readTree(second.getResponse().getContentAsString()).get("id").asText();

            mvc.perform(session.authorise(post("/api/goods-receipts/" + secondId + "/reverse")))
                    .andExpect(status().isOk());

            // 200 + 100 - 100: a reversed delivery is not business done.
            mvc.perform(session.authorise(get("/api/suppliers/" + supplierId)))
                    .andExpect(jsonPath("$.totalSupplied").value(200.0));

            mvc.perform(session.authorise(get("/api/products/" + productId + "/purchase-history")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].supplierName").value("History Supplier " + run))
                    .andExpect(jsonPath("$[0].lines[0].productId").value(productId));
        }
    }

    // --- helpers -----------------------------------------------------------

    private Map<String, Object> supplier(String name) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("contactPerson", "Ama Serwaa");
        body.put("phone", "+233 24 888 1234");
        body.put("email", "sales@example.com");
        body.put("address", "Spintex Road, Accra");
        body.put("paymentTerms", "Net 30");
        body.put("categorySupplied", "Cables & Wires");
        return body;
    }

    private Map<String, Object> line(String productId, String unit, String factor,
                                     String quantity, String unitCost) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("purchaseUnit", unit);
        line.put("conversionFactor", factor);
        line.put("quantity", quantity);
        line.put("unitCost", unitCost);
        return line;
    }

    private Map<String, Object> receipt(String supplierId, Map<String, Object>... lines) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outletId", outletId.toString());
        body.put("supplierId", supplierId);
        body.put("reference", "INV-" + run);
        body.put("lines", List.of(lines));
        return body;
    }

    private String createSupplier(Session session, String name) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/suppliers"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(supplier(name))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private String createProduct(Session session, String name, String baseUnit) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", baseUnit);
        body.put("retailPrice", "60.00");
        body.put("tradePrice", "55.00");
        body.put("floorPrice", "50.00");

        MvcResult result = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
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
                .andExpect(status().isOk()).andReturn();

        return new Session((MockHttpSession) signedIn.getRequest().getSession(false), token);
    }
}
