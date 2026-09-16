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
import gh.giftedlabs.pos.service.InventoryService;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * One product, all the way through — BR-1, BR-2, BR-4, FR-UOM-03, FR-INV-08.
 *
 * <p>Every flow that moves stock is tested on its own elsewhere. Two faults
 * lived in the joins between them and so were not visible from any single one:
 *
 * <ul>
 *   <li>a reorder level set when the product was created came back as the branch
 *       default the moment anything else refreshed the figure, because nothing
 *       had ever stored what was typed;</li>
 *   <li>the factor converting a purchase unit to base units was taken from the
 *       request body on every one of these paths, so what a box was worth could
 *       differ between the order, the delivery and the sale of the same product.</li>
 * </ul>
 *
 * <p>So this walks a single product through setting up, ordering, receiving and
 * selling, and asserts after each step that the quantity is what arithmetic says
 * and that BR-2 still holds — the level equals the sum of its movements.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Stock stays consistent across the product, receiving and selling flows")
class StockConsistencyTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired TerminalRepository terminals;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired InventoryService inventory;
    @Autowired ShiftService shifts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String run;
    private UUID outletId;
    private UUID ownerId;

    @BeforeEach
    void seed() {
        // Twelve hex characters: these classes share one database and a shorter
        // suffix collides often enough to fail a build for no reason.
        run = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        outletId = outlets.save(new Outlet("C" + run.substring(0, 5), "Consistency Branch " + run)).getId();
        UUID terminalId = terminals.save(new Terminal(outletId, "01", "Counter 1", 1L, 1000L)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        ownerId = users.save(owner).getId();
        loginAttempts.recordSuccess(ownerName);

        // FR-POS-02: nothing sells without an open shift.
        shifts.open(terminalId, 20_000L,
                new PosPrincipal(ownerId, ownerName, outletId, Instant.now()), "127.0.0.1");
    }

    @Nested
    @DisplayName("the reorder level a product was set up with")
    class ReorderLevel {

        @Test
        @DisplayName("survives a sale — FR-INV-08")
        void survivesASale() throws Exception {
            // The reported bug. Set a reorder level, sell one, and the level was
            // back to zero. The level and the quantity live on the same row, and
            // selling writes the quantity — so this asserts that writing one does
            // not carry the other away with it.
            Session session = signIn();
            String productId = createProduct(session, "Reorder Bulb " + run, "pcs", List.of());

            receive(session, productId, "pcs", "1", "50", "5.00");
            setReorderLevel(session, productId, "20");

            sell(session, productId, "pcs", "1", "3", "20.00", 6000L)
                    .andExpect(status().isCreated());

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(47.0))
                    .andExpect(jsonPath("$[0].reorderLevel").value(20.0));
        }

        @Test
        @DisplayName("survives a delivery, which writes the same row — FR-SUP-04")
        void survivesADelivery() throws Exception {
            Session session = signIn();
            String supplierId = createSupplier(session, "Reorder Supplier " + run);
            String productId = createProduct(session, "Reorder Pipe " + run, "pcs", List.of());

            setReorderLevel(session, productId, "15");
            deliver(session, supplierId, null, line(productId, "pcs", "1", "40", "6.00"))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(40.0))
                    .andExpect(jsonPath("$[0].reorderLevel").value(15.0))
                    // FR-INV-08: 40 on hand against a level of 15 is not low.
                    .andExpect(jsonPath("$[0].low").value(false));
        }

        @Test
        @DisplayName("is what decides the low-stock list, not the branch default")
        void drivesTheLowList() throws Exception {
            Session session = signIn();
            String productId = createProduct(session, "Reorder Switch " + run, "pcs", List.of());

            receive(session, productId, "pcs", "1", "10", "3.00");
            setReorderLevel(session, productId, "25");

            mvc.perform(session.authorise(get("/api/stock/outlet/" + outletId + "/low")))
                    .andExpect(jsonPath("$[?(@.productId == '" + productId + "')].reorderLevel").value(25.0));
        }
    }

    @Nested
    @DisplayName("what a unit is worth")
    class UnitFactors {

        @Test
        @DisplayName("a sale uses the catalogue's factor, not the one it was sent — FR-UOM-03")
        void aSaleIsRefusedAStaleFactor() throws Exception {
            // A box is twelve. A screen holding an older version of the product
            // says it is one. Accepting that sold a box, billed for a box, and
            // took a single piece off the shelf — the level and the ledger
            // agreeing with each other and both wrong about the stockroom.
            Session session = signIn();
            String productId = createProduct(session, "Boxed Screws " + run, "pcs",
                    List.of(sellingUnit("Box of 12", "12", "60.00")));

            receive(session, productId, "pcs", "1", "120", "4.00");

            sell(session, productId, "Box of 12", "1", "1", "60.00", 6000L)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("UNIT_FACTOR_STALE"));

            // Refused before anything moved.
            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(120.0));

            // With the catalogue's own figure the same line takes twelve.
            sell(session, productId, "Box of 12", "12", "1", "60.00", 6000L)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.items[0].quantityBase").value(12.0));

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(108.0));
        }

        @Test
        @DisplayName("a sale in a unit the product does not carry is refused — FR-UOM-03")
        void aSaleIsRefusedAnUnknownUnit() throws Exception {
            Session session = signIn();
            String productId = createProduct(session, "Plain Bolt " + run, "pcs", List.of());
            receive(session, productId, "pcs", "1", "100", "2.00");

            sell(session, productId, "Pallet", "500", "1", "900.00", 90000L)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("UNIT_NOT_SOLD"));

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(100.0));
        }

        @Test
        @DisplayName("a delivery is refused a factor that contradicts the catalogue — FR-UOM-05")
        void aDeliveryIsRefusedAStaleFactor() throws Exception {
            Session session = signIn();
            String supplierId = createSupplier(session, "Factor Supplier " + run);
            String productId = createProduct(session, "Boxed Nails " + run, "pcs",
                    List.of(sellingUnit("Box of 12", "12", "60.00")));

            deliver(session, supplierId, null, line(productId, "Box of 12", "10", "5", "40.00"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("UNIT_FACTOR_STALE"));
        }

        @Test
        @DisplayName("a delivery in a purchase-only unit keeps its own factor — FR-UOM-05")
        void aDeliveryMayUseAUnitTheShopNeverSellsIn() throws Exception {
            // A pallet is how it arrives and not how it is sold. Refusing it for
            // not being a selling unit would block a delivery that genuinely
            // turned up that way, so only a unit the catalogue knows is checked.
            Session session = signIn();
            String supplierId = createSupplier(session, "Pallet Supplier " + run);
            String productId = createProduct(session, "Palleted Block " + run, "pcs", List.of());

            deliver(session, supplierId, null, line(productId, "Pallet", "500", "2", "600.00"))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(1000.0));

            assertBalanced(productId);
        }
    }

    @Nested
    @DisplayName("a product from set-up to sold")
    class FullFlow {

        @Test
        @DisplayName("opening, delivery and sales add up, and the ledger agrees at every step — BR-2")
        void theArithmeticHolds() throws Exception {
            Session session = signIn();
            String supplierId = createSupplier(session, "Flow Supplier " + run);

            // Sold by the metre, bought by the 100 m drum.
            String productId = createProduct(session, "Flow Cable " + run, "m",
                    List.of(sellingUnit("Drum 100m", "100", "1150.00")));

            // 1. Opening count from the product form: 50 m already on the floor.
            openingCount(session, productId, "50", "4.00");
            assertQuantity(session, productId, 50.0);
            assertBalanced(productId);

            // 2. A delivery of 3 drums. FR-UOM-05: 3 x 100 m, not 3.
            deliver(session, supplierId, null, line(productId, "Drum 100m", "100", "3", "450.00"))
                    .andExpect(status().isOk());
            assertQuantity(session, productId, 350.0);
            assertBalanced(productId);

            // 3. A cut length off the drum — BR-12 keeps the half metre.
            sell(session, productId, "m", "1", "12.5", "14.50", 18125L)
                    .andExpect(status().isCreated());
            assertQuantity(session, productId, 337.5);
            assertBalanced(productId);

            // 4. A whole drum over the counter.
            sell(session, productId, "Drum 100m", "100", "1", "1150.00", 115000L)
                    .andExpect(status().isCreated());
            assertQuantity(session, productId, 237.5);
            assertBalanced(productId);

            // BR-4: 50 m at 4.00 blended with 300 m at 4.50 a metre is 4.4167,
            // and neither sale moved it — selling does not revalue what is left.
            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].averageCost").value(4.4167));
        }

        @Test
        @DisplayName("an order closes on the quantity that arrived, in base units — FR-SUP-08")
        void anOrderIsSatisfiedInBaseUnits() throws Exception {
            // The order is written in drums and the delivery arrives in drums.
            // Both sides are converted with the catalogue's factor now, so the
            // comparison is between two numbers that mean the same thing.
            Session session = signIn();
            String supplierId = createSupplier(session, "Order Flow Supplier " + run);
            String productId = createProduct(session, "Order Flow Cable " + run, "m",
                    List.of(sellingUnit("Drum 100m", "100", "1150.00")));

            MvcResult raised = mvc.perform(session.authorise(post("/api/purchase-orders"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(order(supplierId,
                                    line(productId, "Drum 100m", "100", "3", "450.00")))))
                    .andExpect(status().isOk())
                    .andReturn();
            String orderId = json.readTree(raised.getResponse().getContentAsString()).get("id").asText();

            mvc.perform(session.authorise(post("/api/purchase-orders/" + orderId + "/send")))
                    .andExpect(status().isOk());

            deliver(session, supplierId, orderId, line(productId, "Drum 100m", "100", "3", "450.00"))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(get("/api/purchase-orders/" + orderId)))
                    .andExpect(jsonPath("$.delivery").value("COMPLETE"))
                    .andExpect(jsonPath("$.status").value("CLOSED"));

            assertQuantity(session, productId, 300.0);
            assertBalanced(productId);
        }
    }

    // --- assertions ---------------------------------------------------------

    private void assertQuantity(Session session, String productId, double expected) throws Exception {
        mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                .andExpect(jsonPath("$[0].quantity").value(expected));
    }

    /** BR-2 · NFR-17: the level is the sum of its movements, or it is drift. */
    private void assertBalanced(String productId) {
        assertEquals(0, inventory.drift(UUID.fromString(productId), outletId).compareTo(BigDecimal.ZERO),
                "the stock level has drifted from its ledger");
    }

    // --- fixtures -----------------------------------------------------------

    private String createProduct(Session session, String name, String baseUnit,
                                 List<Map<String, Object>> sellingUnits) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", baseUnit);
        body.put("retailPrice", "20.00");
        body.put("tradePrice", "18.00");
        body.put("floorPrice", "5.00");
        if (!sellingUnits.isEmpty()) body.put("sellingUnits", sellingUnits);

        MvcResult created = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(created.getResponse().getContentAsString()).get("id").asText();
    }

    private Map<String, Object> sellingUnit(String name, String conversionFactor, String price) {
        Map<String, Object> unit = new LinkedHashMap<>();
        unit.put("name", name);
        unit.put("conversionFactor", conversionFactor);
        unit.put("price", price);
        unit.put("tradePrice", price);
        return unit;
    }

    private String createSupplier(Session session, String name) throws Exception {
        MvcResult created = mvc.perform(session.authorise(post("/api/suppliers"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("name", name, "phone", "024" + run.substring(0, 7)))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(created.getResponse().getContentAsString()).get("id").asText();
    }

    /** The movement the product form posts for an opening count — FR-INV-02. */
    private void openingCount(Session session, String productId, String quantity, String unitCost)
            throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId);
        body.put("outletId", outletId.toString());
        body.put("type", "OPENING");
        body.put("quantity", quantity);
        body.put("unitCost", unitCost);

        mvc.perform(session.authorise(post("/api/stock/movements"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }

    private void receive(Session session, String productId, String unit, String factor,
                         String quantity, String unitCost) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId);
        body.put("outletId", outletId.toString());
        body.put("type", "RECEIPT");
        body.put("quantity", quantity);
        body.put("unitCost", unitCost);

        mvc.perform(session.authorise(post("/api/stock/movements"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }

    private void setReorderLevel(Session session, String productId, String value) throws Exception {
        mvc.perform(session.authorise(put("/api/stock/product/" + productId
                        + "/outlet/" + outletId + "/reorder-level").param("value", value)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reorderLevel").value(Double.parseDouble(value)));
    }

    private Map<String, Object> line(String productId, String purchaseUnit, String conversionFactor,
                                     String quantity, String unitCost) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("purchaseUnit", purchaseUnit);
        line.put("conversionFactor", conversionFactor);
        line.put("quantity", quantity);
        line.put("unitCost", unitCost);
        return line;
    }

    private Map<String, Object> order(String supplierId, Map<String, Object> line) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outletId", outletId.toString());
        body.put("supplierId", supplierId);
        body.put("lines", List.of(line));
        return body;
    }

    private org.springframework.test.web.servlet.ResultActions deliver(
            Session session, String supplierId, String purchaseOrderId, Map<String, Object> line)
            throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outletId", outletId.toString());
        body.put("supplierId", supplierId);
        if (purchaseOrderId != null) body.put("purchaseOrderId", purchaseOrderId);
        body.put("reference", "INV-" + run.substring(0, 6));
        body.put("lines", List.of(line));

        return mvc.perform(session.authorise(post("/api/goods-receipts"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    private org.springframework.test.web.servlet.ResultActions sell(
            Session session, String productId, String unit, String conversionFactor,
            String quantity, String unitPrice, long cashPesewas) throws Exception {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", productId);
        line.put("selectedUnit", unit);
        line.put("conversionFactor", conversionFactor);
        line.put("quantity", quantity);
        line.put("unitPrice", unitPrice);

        Map<String, Object> payment = new LinkedHashMap<>();
        payment.put("id", UUID.randomUUID().toString());
        payment.put("method", "CASH");
        payment.put("amount", cashPesewas);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", UUID.randomUUID().toString());
        body.put("outletId", outletId.toString());
        body.put("items", List.of(line));
        body.put("payments", List.of(payment));

        return mvc.perform(session.authorise(post("/api/sales"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    private record Session(MockHttpSession http, String csrfToken) {
        MockHttpServletRequestBuilder authorise(MockHttpServletRequestBuilder builder) {
            return builder.session(http).header("X-XSRF-TOKEN", csrfToken)
                    .cookie(new Cookie("XSRF-TOKEN", csrfToken));
        }
    }

    private Session signIn() throws Exception {
        MockHttpSession http = new MockHttpSession();
        MvcResult csrf = mvc.perform(get("/api/auth/csrf").session(http))
                .andExpect(status().isOk()).andReturn();
        String token = json.readTree(csrf.getResponse().getContentAsString()).get("token").asText();

        MvcResult signedIn = mvc.perform(post("/api/auth/sign-in").session(http)
                        .header("X-XSRF-TOKEN", token).cookie(new Cookie("XSRF-TOKEN", token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", ownerName, "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn();

        return new Session((MockHttpSession) signedIn.getRequest().getSession(false), token);
    }
}
