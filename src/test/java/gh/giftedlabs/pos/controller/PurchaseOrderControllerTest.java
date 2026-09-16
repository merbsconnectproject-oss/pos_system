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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Purchase orders over HTTP — FR-SUP-08.
 *
 * <p>The cases worth having are the awkward ones: a supplier who sends part of
 * the order, one who sends more than was asked for, and one who never sends the
 * rest. All three are ordinary in a hardware shop, and all three are computed
 * from the deliveries rather than recorded — so these tests are really asserting
 * that nothing anywhere keeps a second copy of what arrived.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Purchase orders — FR-SUP-08")
class PurchaseOrderControllerTest {

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
    private String outletCode;

    @BeforeEach
    void seed() {
        // Twelve characters, not six. These tests share one database with forty
        // other classes, and a six-hex suffix collides often enough to fail a
        // build for no reason — a username is not short of room.
        run = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        outletCode = "P" + run.substring(0, 5);
        outletId = outlets.save(new Outlet(outletCode, "Order Branch " + run)).getId();

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
    @DisplayName("raising and sending")
    class Raising {

        @Test
        @DisplayName("an order is numbered per outlet and starts as a draft nothing has arrived against")
        void raisesADraft() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Order Supplier " + run);
            String productId = createProduct(session, "Ordered Cable " + run, "m");

            MvcResult raised = mvc.perform(session.authorise(post("/api/purchase-orders"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(order(supplierId,
                                    line(productId, "drum", "100", "3", "450.00")))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("DRAFT"))
                    .andExpect(jsonPath("$.delivery").value("NONE"))
                    .andExpect(jsonPath("$.number").value(outletCode + "-PO-000001"))
                    // 3 drums at 450.00 is a commitment of 1,350.00 — and no
                    // stock, because an order is not a movement.
                    .andExpect(jsonPath("$.orderedTotalPesewas").value(135000))
                    .andExpect(jsonPath("$.receivedTotalPesewas").value(0))
                    .andExpect(jsonPath("$.lines[0].outstandingQuantity").value(3.0))
                    .andReturn();

            String id = json.readTree(raised.getResponse().getContentAsString()).get("id").asText();

            mvc.perform(session.authorise(get("/api/purchase-orders/" + id)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.lines[0].sku").exists());
        }

        @Test
        @DisplayName("a draft is editable; a sent order is not")
        void draftsAreEditableAndSentOrdersAreNot() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Freeze Supplier " + run);
            String productId = createProduct(session, "Freeze Pipe " + run, "pcs");

            String id = raise(session, supplierId, line(productId, "pcs", "1", "10", "12.00"));

            mvc.perform(session.authorise(put("/api/purchase-orders/" + id))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(order(supplierId,
                                    line(productId, "pcs", "1", "20", "12.00")))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.lines[0].orderedQuantity").value(20.0));

            mvc.perform(session.authorise(post("/api/purchase-orders/" + id + "/send")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("SENT"));

            // The supplier now holds a copy. Editing it would make every delivery
            // variance meaningless, because the thing they are measured against
            // would have moved.
            mvc.perform(session.authorise(put("/api/purchase-orders/" + id))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(order(supplierId,
                                    line(productId, "pcs", "1", "5", "12.00")))))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("an empty order cannot be sent, and a cashier cannot order at all")
        void refusesEmptyOrdersAndUnauthorisedCallers() throws Exception {
            Session owner = signIn(ownerName);
            String supplierId = createSupplier(owner, "Gate Supplier " + run);

            mvc.perform(owner.authorise(post("/api/purchase-orders"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(order(supplierId))))
                    .andExpect(status().isBadRequest());

            // NFR-9: the screen is not the control. A cashier holds no
            // supplier.manage, so the endpoint refuses regardless of the UI.
            Session cashier = signIn(cashierName);
            mvc.perform(cashier.authorise(get("/api/purchase-orders")))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("what actually arrives")
    class Deliveries {

        @Test
        @DisplayName("a part delivery leaves the rest outstanding and the order open")
        void partialDelivery() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Partial Supplier " + run);
            String productId = createProduct(session, "Partial Cable " + run, "m");

            String id = raise(session, supplierId, line(productId, "drum", "100", "3", "450.00"));
            send(session, id);

            // One drum of the three. In base units that is 100 m of 300 m.
            receive(session, supplierId, id, line(productId, "drum", "100", "1", "450.00"));

            mvc.perform(session.authorise(get("/api/purchase-orders/" + id)))
                    .andExpect(jsonPath("$.status").value("SENT"))
                    .andExpect(jsonPath("$.delivery").value("PARTIAL"))
                    .andExpect(jsonPath("$.lines[0].receivedQuantity").value(1.0))
                    .andExpect(jsonPath("$.lines[0].outstandingQuantity").value(2.0))
                    .andExpect(jsonPath("$.receivedTotalPesewas").value(45000))
                    .andExpect(jsonPath("$.receipts.length()").value(1));
        }

        @Test
        @DisplayName("a delivery in the base unit still counts against an order written in drums")
        void unitsAreComparedInBaseUnits() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Unit Supplier " + run);
            String productId = createProduct(session, "Unit Cable " + run, "m");

            String id = raise(session, supplierId, line(productId, "drum", "100", "3", "450.00"));
            send(session, id);

            // 300 metres, loose. The same goods as 3 drums, and an order that
            // could not see that would report a phantom shortage of three drums
            // alongside 300 m of real stock.
            receive(session, supplierId, id, line(productId, "m", "1", "300", "4.50"));

            mvc.perform(session.authorise(get("/api/purchase-orders/" + id)))
                    .andExpect(jsonPath("$.delivery").value("COMPLETE"))
                    .andExpect(jsonPath("$.lines[0].receivedQuantity").value(3.0))
                    .andExpect(jsonPath("$.lines[0].outstandingQuantity").value(0.0));
        }

        @Test
        @DisplayName("receiving everything closes the order without anybody remembering to")
        void fullDeliveryClosesTheOrder() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Full Supplier " + run);
            String productId = createProduct(session, "Full Pipe " + run, "pcs");

            String id = raise(session, supplierId, line(productId, "pcs", "1", "10", "12.00"));
            send(session, id);
            receive(session, supplierId, id, line(productId, "pcs", "1", "10", "12.00"));

            mvc.perform(session.authorise(get("/api/purchase-orders/" + id)))
                    .andExpect(jsonPath("$.status").value("CLOSED"))
                    .andExpect(jsonPath("$.delivery").value("COMPLETE"))
                    .andExpect(jsonPath("$.closeReason").value("Received in full"));
        }

        @Test
        @DisplayName("more than was ordered is recorded as over-delivered, not refused")
        void overDelivery() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Over Supplier " + run);
            String productId = createProduct(session, "Over Bolt " + run, "pcs");

            String id = raise(session, supplierId, line(productId, "pcs", "1", "10", "3.00"));
            send(session, id);

            // Eleven arrived. The storekeeper has already shelved them; a system
            // that refused the eleventh would be telling the shop its own stock
            // does not exist.
            receive(session, supplierId, id, line(productId, "pcs", "1", "11", "3.00"));

            mvc.perform(session.authorise(get("/api/purchase-orders/" + id)))
                    .andExpect(jsonPath("$.delivery").value("OVER"))
                    .andExpect(jsonPath("$.lines[0].receivedQuantity").value(11.0))
                    .andExpect(jsonPath("$.lines[0].outstandingQuantity").value(-1.0))
                    .andExpect(jsonPath("$.status").value("CLOSED"));
        }

        @Test
        @DisplayName("a reversed delivery stops counting, so the order reads as short again")
        void aReversedDeliveryDoesNotCount() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Reverse Supplier " + run);
            String productId = createProduct(session, "Reverse Sheet " + run, "pcs");

            String id = raise(session, supplierId, line(productId, "pcs", "1", "10", "20.00"));
            send(session, id);

            String receiptId = receive(session, supplierId, id,
                    line(productId, "pcs", "1", "4", "20.00"));

            mvc.perform(session.authorise(get("/api/purchase-orders/" + id)))
                    .andExpect(jsonPath("$.lines[0].receivedQuantity").value(4.0));

            mvc.perform(session.authorise(post("/api/goods-receipts/" + receiptId + "/reverse")))
                    .andExpect(status().isOk());

            // Nothing arrived after all. A received column would still be saying
            // four, and the order would be claiming stock the ledger denies.
            mvc.perform(session.authorise(get("/api/purchase-orders/" + id)))
                    .andExpect(jsonPath("$.delivery").value("NONE"))
                    .andExpect(jsonPath("$.lines[0].receivedQuantity").value(0.0))
                    .andExpect(jsonPath("$.receivedTotalPesewas").value(0));
        }

        @Test
        @DisplayName("a delivery cannot be booked against another branch's or another supplier's order")
        void deliveriesMustMatchTheirOrder() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Match Supplier " + run);
            String otherSupplier = createSupplier(session, "Other Supplier " + run);
            String productId = createProduct(session, "Match Rod " + run, "pcs");

            String id = raise(session, supplierId, line(productId, "pcs", "1", "5", "8.00"));
            send(session, id);

            mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(otherSupplier, id,
                                    line(productId, "pcs", "1", "5", "8.00")))))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("a draft cannot be delivered against: the supplier has not seen it")
        void draftsCannotBeDeliveredAgainst() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Draft Supplier " + run);
            String productId = createProduct(session, "Draft Nail " + run, "pcs");

            String id = raise(session, supplierId, line(productId, "pcs", "1", "5", "2.00"));

            mvc.perform(session.authorise(post("/api/goods-receipts"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(receipt(supplierId, id,
                                    line(productId, "pcs", "1", "5", "2.00")))))
                    .andExpect(status().isConflict());
        }
    }

    @Nested
    @DisplayName("endings")
    class Endings {

        @Test
        @DisplayName("closing an order short demands a reason; closing in full does not")
        void shortCloseNeedsAReason() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Short Supplier " + run);
            String productId = createProduct(session, "Short Hinge " + run, "pcs");

            String id = raise(session, supplierId, line(productId, "pcs", "1", "10", "5.00"));
            send(session, id);
            receive(session, supplierId, id, line(productId, "pcs", "1", "6", "5.00"));

            mvc.perform(session.authorise(post("/api/purchase-orders/" + id + "/close")))
                    .andExpect(status().isBadRequest());

            mvc.perform(session.authorise(post("/api/purchase-orders/" + id + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    Map.of("reason", "Supplier discontinued the line"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CLOSED"))
                    .andExpect(jsonPath("$.delivery").value("PARTIAL"))
                    .andExpect(jsonPath("$.closeReason").value("Supplier discontinued the line"));
        }

        @Test
        @DisplayName("a finished order stays finished")
        void finishedOrdersDoNotReopen() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Final Supplier " + run);
            String productId = createProduct(session, "Final Screw " + run, "pcs");

            String id = raise(session, supplierId, line(productId, "pcs", "1", "4", "1.50"));
            send(session, id);
            receive(session, supplierId, id, line(productId, "pcs", "1", "4", "1.50"));

            mvc.perform(session.authorise(post("/api/purchase-orders/" + id + "/close"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "again"))))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("an order with deliveries against it is closed short, never cancelled")
        void cancellationIsForOrdersNothingArrivedAgainst() throws Exception {
            Session session = signIn(ownerName);
            String supplierId = createSupplier(session, "Cancel Supplier " + run);
            String productId = createProduct(session, "Cancel Plug " + run, "pcs");

            String untouched = raise(session, supplierId, line(productId, "pcs", "1", "5", "4.00"));
            mvc.perform(session.authorise(post("/api/purchase-orders/" + untouched + "/cancel"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "Ordered twice"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CANCELLED"));

            String delivered = raise(session, supplierId, line(productId, "pcs", "1", "5", "4.00"));
            send(session, delivered);
            receive(session, supplierId, delivered, line(productId, "pcs", "1", "2", "4.00"));

            // Cancelling this would leave two on the shelf that no document
            // explains.
            mvc.perform(session.authorise(post("/api/purchase-orders/" + delivered + "/cancel"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "Changed our minds"))))
                    .andExpect(status().isConflict());
        }
    }

    // --- helpers ------------------------------------------------------------

    private String raise(Session session, String supplierId, Map<String, Object>... lines)
            throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/purchase-orders"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(order(supplierId, lines))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private void send(Session session, String id) throws Exception {
        mvc.perform(session.authorise(post("/api/purchase-orders/" + id + "/send")))
                .andExpect(status().isOk());
    }

    /** Books a delivery against an order and returns the receipt's id. */
    private String receive(Session session, String supplierId, String orderId,
                           Map<String, Object>... lines) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/goods-receipts"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(receipt(supplierId, orderId, lines))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private Map<String, Object> order(String supplierId, Map<String, Object>... lines) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outletId", outletId.toString());
        body.put("supplierId", supplierId);
        body.put("note", "Raised by test " + run);
        body.put("lines", List.of(lines));
        return body;
    }

    private Map<String, Object> receipt(String supplierId, String purchaseOrderId,
                                        Map<String, Object>... lines) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outletId", outletId.toString());
        body.put("supplierId", supplierId);
        body.put("purchaseOrderId", purchaseOrderId);
        body.put("reference", "DN-" + run);
        body.put("lines", List.of(lines));
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

    private String createSupplier(Session session, String name) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("phone", "0244000111");
        body.put("paymentTerms", "Net 30");

        MvcResult result = mvc.perform(session.authorise(post("/api/suppliers"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
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
                        .content(json.writeValueAsString(
                                Map.of("identifier", identifier, "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn();

        return new Session((MockHttpSession) signedIn.getRequest().getSession(false), token);
    }
}
