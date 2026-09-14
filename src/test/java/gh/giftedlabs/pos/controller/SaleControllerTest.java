package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.dto.MovementRequest;
import gh.giftedlabs.pos.dto.SaleRequest;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.*;
import gh.giftedlabs.pos.rules.MovementType;
import gh.giftedlabs.pos.rules.PaymentMethod;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.InventoryService;
import gh.giftedlabs.pos.service.LoginAttemptService;
import gh.giftedlabs.pos.service.SaleService;
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
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Selling over HTTP — FR-POS, FR-PAY, BR-3, BR-5, BR-6, BR-7, BR-8, BR-9, BR-10.
 *
 * <p>Carries two of the release gates: gate 3, that the same payment submitted
 * twice records one payment and returns the original result; and gate 4, that
 * two terminals cannot sell the same last unit.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Point of sale HTTP contract")
class SaleControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired TerminalRepository terminals;
    @Autowired SaleRepository sales;
    @Autowired StockLevelRepository levels;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired InventoryService inventory;
    @Autowired SaleService saleService;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String run;
    private UUID outletId;
    private UUID terminalId;
    private UUID ownerId;
    private String outletCode;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletCode = "G" + run.substring(0, 5);
        outletId = outlets.save(new Outlet(outletCode, "Sales Branch " + run)).getId();
        terminalId = terminals.save(new Terminal(outletId, "01", "Counter 1", 1L, 1000L)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        ownerId = users.save(owner).getId();

        loginAttempts.recordSuccess(ownerName);
    }

    @Nested
    @DisplayName("completing a sale")
    class Completing {

        @Test
        @DisplayName("numbers the receipt {OUTLET}-{TERMINAL}-{SEQ} — BR-6")
        void numbersTheReceipt() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Cable " + run, "m", "14.50", "100");

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "m", "2", "14.50"),
                                    cash(2900L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.receiptNumber").value(outletCode + "-01-000001"))
                    .andExpect(jsonPath("$.total").value(2900))
                    .andExpect(jsonPath("$.status").value("COMPLETED"));

            // The next sale gets the next number, never the same one.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "m", "1", "14.50"),
                                    cash(1450L)))))
                    .andExpect(jsonPath("$.receiptNumber").value(outletCode + "-01-000002"));
        }

        @Test
        @DisplayName("decrements stock through the ledger — BR-2, FR-POS-13")
        void decrementsStock() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Bulb " + run, "pcs", "20.00", "50");

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "3", "20.00"),
                                    cash(6000L)))))
                    .andExpect(status().isCreated());

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(47.0));

            // The level still equals the sum of its movements.
            assertEquals(0, inventory.drift(UUID.fromString(productId), outletId)
                    .compareTo(BigDecimal.ZERO));
        }

        @Test
        @DisplayName("sells in a larger unit and moves base units — FR-UOM-03")
        void sellsInAPurchaseUnit() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Drum Cable " + run, "m", "14.50", "500");

            // One drum of 100 m at 1,150.00.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "Drum 100m", "100", "1", "1150.00", null, null),
                                    cash(115000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.items[0].quantityBase").value(100.0))
                    .andExpect(jsonPath("$.items[0].selectedUnit").value("Drum 100m"));

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(400.0));
        }

        @Test
        @DisplayName("freezes the cost on the line — BR-5")
        void freezesTheCost() throws Exception {
            Session session = signIn();
            // Received at 5.00 by stockedProduct, so that is the cost frozen.
            String productId = stockedProduct(session, "Margin " + run, "pcs", "20.00", "50");

            MvcResult sold = mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "20.00"), cash(2000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.items[0].frozenCostPrice").value(5.0))
                    .andReturn();
            String saleId = json.readTree(sold.getResponse().getContentAsString()).get("id").asText();

            // Receiving dearer stock afterwards must not move the margin on a
            // sale that already happened.
            inventory.record(new MovementRequest(UUID.fromString(productId), outletId,
                            MovementType.RECEIPT, new BigDecimal("50"), new BigDecimal("15.00"),
                            null, null, null, null),
                    new PosPrincipal(ownerId, ownerName, outletId, Instant.now()), true, "127.0.0.1");

            mvc.perform(session.authorise(get("/api/sales/" + saleId)))
                    .andExpect(jsonPath("$.items[0].frozenCostPrice").value(5.0));
        }

        @Test
        @DisplayName("prices from the catalogue, not from the client's total — BR-11")
        void pricesServerSide() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Switch " + run, "pcs", "18.335", "100");

            // 3 x 18.335 settles to 55.01. Rounding the rate first gives 55.02,
            // which is the bug PROGRESS records in the frozen frontend.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "3", "18.335"),
                                    cash(5501L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.total").value(5501));
        }
    }

    @Nested
    @DisplayName("payments")
    class Payments {

        @Test
        @DisplayName("must equal the total exactly, never within a tolerance — FR-PAY-05, BR-11")
        void mustEqualTheTotal() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Fuse " + run, "pcs", "10.00", "20");

            // Two pesewas short is short.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "10.00"),
                                    cash(998L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("PAYMENT_MISMATCH"));
        }

        @Test
        @DisplayName("split across methods, summing to the total — FR-PAY-04")
        void splitsAcrossMethods() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Lamp " + run, "pcs", "100.00", "20");

            Map<String, Object> body = sale(
                    line(productId, "pcs", "1", "100.00"),
                    cash(4000L), momo(6000L, "MTN-" + run));

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.payments.length()").value(2))
                    .andExpect(jsonPath("$.changeDue").value(0));
        }

        @Test
        @DisplayName("overpaid in cash gives change — FR-PAY-06")
        void cashOverpaymentGivesChange() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Tape " + run, "pcs", "35.00", "20");

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "35.00"),
                                    cash(5000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.changeDue").value(1500));
        }

        @Test
        @DisplayName("cannot be overpaid by card — FR-PAY-06")
        void cardCannotBeOverpaid() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Plug " + run, "pcs", "35.00", "20");

            Map<String, Object> payment = new LinkedHashMap<>();
            payment.put("id", UUID.randomUUID().toString());
            payment.put("method", "card");
            payment.put("amount", 5000L);
            payment.put("reference", "AUTH-" + run);

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "35.00"), payment))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("OVERPAYMENT_NOT_CASH"));
        }
    }

    @Nested
    @DisplayName("a resubmitted sale")
    class Idempotency {

        @Test
        @DisplayName("records one sale and returns the original — BR-7, release gate 3")
        void recordsOnceAndReturnsTheOriginal() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Socket " + run, "pcs", "25.00", "40");
            Map<String, Object> body = sale(line(productId, "pcs", "2", "25.00"), cash(5000L));

            MvcResult first = mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated()).andReturn();
            String receipt = json.readTree(first.getResponse().getContentAsString())
                    .get("receiptNumber").asText();

            // Twice more, as a double-click and a retry would.
            for (int attempt = 0; attempt < 2; attempt++) {
                mvc.perform(session.authorise(post("/api/sales"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json.writeValueAsString(body)))
                        .andExpect(status().isCreated())
                        // The original receipt, not a new number.
                        .andExpect(jsonPath("$.receiptNumber").value(receipt));
            }

            // Stock moved once: 40 - 2.
            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(38.0));
        }
    }

    @Nested
    @DisplayName("two terminals and one last unit")
    class Concurrency {

        @Test
        @DisplayName("cannot both sell it — BR-8, release gate 4")
        void cannotBothSellTheLastUnit() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Last " + run, "pcs", "10.00", "1");
            UUID product = UUID.fromString(productId);
            PosPrincipal actor = new PosPrincipal(ownerId, ownerName, outletId, Instant.now());

            int attempts = 8;
            ExecutorService pool = Executors.newFixedThreadPool(attempts);
            CountDownLatch startLine = new CountDownLatch(1);
            AtomicInteger succeeded = new AtomicInteger();
            AtomicInteger refused = new AtomicInteger();

            List<Future<?>> racing = new ArrayList<>();
            for (int i = 0; i < attempts; i++) {
                racing.add(pool.submit(() -> {
                    startLine.await();
                    try {
                        // Straight at the service: the row lock is what is being
                        // tested, and MockMvc would serialise these anyway.
                        saleService.complete(saleRequest(product, "pcs", "1", "10.00", 1000L),
                                actor, false, "127.0.0.1");
                        succeeded.incrementAndGet();
                    } catch (RuntimeException refusedSale) {
                        refused.incrementAndGet();
                    }
                    return null;
                }));
            }

            startLine.countDown();
            for (Future<?> attempt : racing) attempt.get(30, TimeUnit.SECONDS);
            pool.shutdown();

            assertEquals(1, succeeded.get(), "exactly one sale should take the last unit");
            assertEquals(attempts - 1, refused.get(), "every other attempt should be refused");

            assertEquals(0, levels.findByProductIdAndOutletId(product, outletId)
                    .orElseThrow().getQuantity().compareTo(BigDecimal.ZERO), "stock should be exactly zero");
            assertEquals(0, inventory.drift(product, outletId).compareTo(BigDecimal.ZERO));
        }
    }

    @Nested
    @DisplayName("below the floor price")
    class FloorPrice {

        @Test
        @DisplayName("is refused without an approver — BR-10, FR-POS-11")
        void refusedWithoutApproval() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Floor " + run, "pcs", "60.00", "20");

            // The seeded floor is 50.00; 40.00 is under it.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "40.00"),
                                    cash(4000L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("BELOW_FLOOR_PRICE"));
        }

        @Test
        @DisplayName("is allowed with one, and the approver is recorded — BR-10")
        void allowedWithApproverRecorded() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Approved " + run, "pcs", "60.00", "20");

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "40.00", null, ownerId.toString()),
                                    cash(4000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.items[0].belowFloor").value(true));
        }
    }

    @Nested
    @DisplayName("voiding")
    class Voiding {

        @Test
        @DisplayName("returns the stock and keeps both records — BR-3, FR-POS-19")
        void returnsStockAndKeepsRecords() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Void " + run, "pcs", "15.00", "30");

            MvcResult sold = mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "4", "15.00"), cash(6000L)))))
                    .andExpect(status().isCreated()).andReturn();
            String saleId = json.readTree(sold.getResponse().getContentAsString()).get("id").asText();

            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(26.0));

            mvc.perform(session.authorise(post("/api/sales/" + saleId + "/void"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "Customer changed their mind"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("VOIDED"))
                    .andExpect(jsonPath("$.voidReason").value("Customer changed their mind"));

            // Stock back, and the sale still readable — the customer may be
            // holding its receipt.
            mvc.perform(session.authorise(get("/api/stock/product/" + productId)))
                    .andExpect(jsonPath("$[0].quantity").value(30.0));
            mvc.perform(session.authorise(get("/api/sales/" + saleId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1));
        }

        @Test
        @DisplayName("happens once, and needs a reason — BR-3")
        void onlyOnceAndWithAReason() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Twice " + run, "pcs", "15.00", "30");

            MvcResult sold = mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "15.00"), cash(1500L)))))
                    .andExpect(status().isCreated()).andReturn();
            String saleId = json.readTree(sold.getResponse().getContentAsString()).get("id").asText();

            mvc.perform(session.authorise(post("/api/sales/" + saleId + "/void"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", ""))))
                    .andExpect(status().isBadRequest());

            mvc.perform(session.authorise(post("/api/sales/" + saleId + "/void"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "Wrong item"))))
                    .andExpect(status().isOk());

            mvc.perform(session.authorise(post("/api/sales/" + saleId + "/void"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("reason", "Again"))))
                    .andExpect(status().isConflict());
        }
    }

    @Nested
    @DisplayName("speed")
    class Speed {

        @Test
        @DisplayName("a five-line sale commits in well under a second — NFR-2")
        void completesUnderOneSecond() throws Exception {
            Session session = signIn();

            List<Map<String, Object>> lines = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                String productId = stockedProduct(session, "Timed " + run + "-" + i, "pcs", "10.00", "100");
                lines.add(line(productId, "pcs", "2", "10.00"));
            }

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("id", UUID.randomUUID().toString());
            body.put("outletId", outletId.toString());
            body.put("terminalId", terminalId.toString());
            body.put("items", lines);
            body.put("payments", List.of(cash(10000L)));
            String payload = json.writeValueAsString(body);

            // Everything a sale does is inside this: the receipt number under a
            // row lock, five priced lines, five stock decrements each taking
            // their own lock, and the payment — one transaction, measured
            // against a real Postgres rather than an in-memory stand-in.
            long startedAt = System.nanoTime();
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON).content(payload))
                    .andExpect(status().isCreated());
            long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000;

            assertTrue(elapsedMs < 1000,
                    "a five-line sale took %d ms; NFR-2 allows 1000".formatted(elapsedMs));
            System.out.println("[NFR-2] five-line sale committed in " + elapsedMs + " ms");
        }
    }

    @Nested
    @DisplayName("sales history")
    class History {

        @Test
        @DisplayName("lists past transactions with no search term — FR-POS-18")
        void listsWithoutASearchTerm() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Listed " + run, "pcs", "12.00", "20");

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "12.00"), cash(1200L)))))
                    .andExpect(status().isCreated());

            // An absent query must not blow up: a null bound into upper(...)
            // leaves Postgres unable to infer the type and it reports
            // "upper(bytea) does not exist".
            mvc.perform(session.authorise(get("/api/sales").param("outletId", outletId.toString())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1));
        }

        @Test
        @DisplayName("finds a sale by its receipt number — FR-POS-18")
        void findsByReceiptNumber() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Found " + run, "pcs", "9.00", "20");

            MvcResult sold = mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "9.00"), cash(900L)))))
                    .andExpect(status().isCreated()).andReturn();
            String receipt = json.readTree(sold.getResponse().getContentAsString())
                    .get("receiptNumber").asText();

            mvc.perform(session.authorise(get("/api/sales").param("q", receipt)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].receiptNumber").value(receipt));
        }
    }

    @Nested
    @DisplayName("selling past zero")
    class Oversell {

        @Test
        @DisplayName("is refused with what is on hand — BR-9, FR-POS-13")
        void refusedWithTheAvailableFigure() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Short " + run, "pcs", "10.00", "2");
            PosPrincipal actor = new PosPrincipal(ownerId, ownerName, outletId, Instant.now());

            // The owner holds stock.oversell, so the refusal is exercised at the
            // service with the permission withheld — which is what a cashier is.
            var refused = assertThrows(RuntimeException.class, () ->
                    saleService.complete(saleRequest(UUID.fromString(productId), "pcs", "5", "10.00", 5000L),
                            actor, false, "127.0.0.1"));
            assertTrue(refused.getMessage().contains("2"), "the message should say what is on hand");
        }
    }

    // --- helpers -----------------------------------------------------------

    private SaleRequest saleRequest(UUID productId, String unit, String quantity, String price, long paid) {
        return new SaleRequest(UUID.randomUUID(), outletId, terminalId, null, null, null,
                List.of(new SaleRequest.Line(productId, unit, BigDecimal.ONE, new BigDecimal(quantity),
                        new BigDecimal(price), 0L, null)),
                List.of(new SaleRequest.PaymentLine(UUID.randomUUID(), PaymentMethod.cash, paid, null, null)));
    }

    private Map<String, Object> line(String productId, String unit, String quantity, String price) {
        return line(productId, unit, "1", quantity, price, null, null);
    }

    private Map<String, Object> line(String productId, String unit, String quantity, String price,
                                     Long discount, String approver) {
        return line(productId, unit, "1", quantity, price, discount, approver);
    }

    private Map<String, Object> line(String productId, String unit, String factor, String quantity,
                                     String price, Long discount, String approver) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("productId", productId);
        item.put("selectedUnit", unit);
        item.put("conversionFactor", factor);
        item.put("quantity", quantity);
        item.put("unitPrice", price);
        if (discount != null) item.put("discount", discount);
        if (approver != null) item.put("floorApprovedBy", approver);
        return item;
    }

    private Map<String, Object> cash(long amount) {
        Map<String, Object> payment = new LinkedHashMap<>();
        payment.put("id", UUID.randomUUID().toString());
        payment.put("method", "cash");
        payment.put("amount", amount);
        return payment;
    }

    private Map<String, Object> momo(long amount, String reference) {
        Map<String, Object> payment = new LinkedHashMap<>();
        payment.put("id", UUID.randomUUID().toString());
        payment.put("method", "momo");
        payment.put("amount", amount);
        payment.put("provider", "MTN MoMo");
        payment.put("reference", reference);
        return payment;
    }

    @SafeVarargs
    private Map<String, Object> sale(Map<String, Object> item, Map<String, Object>... payments) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", UUID.randomUUID().toString());
        body.put("outletId", outletId.toString());
        body.put("terminalId", terminalId.toString());
        body.put("items", List.of(item));
        body.put("payments", List.of(payments));
        return body;
    }

    /** A product with stock already received, so a sale has something to take. */
    private String stockedProduct(Session session, String name, String baseUnit,
                                  String retailPrice, String quantity) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", baseUnit);
        body.put("retailPrice", retailPrice);
        body.put("tradePrice", retailPrice);
        body.put("floorPrice", "50.00".equals(retailPrice) ? retailPrice : lowerFloor(retailPrice));

        MvcResult created = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        String productId = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

        inventory.record(new MovementRequest(UUID.fromString(productId), outletId, MovementType.RECEIPT,
                        new BigDecimal(quantity), new BigDecimal("5.00"), null, null, null, null),
                new PosPrincipal(ownerId, ownerName, outletId, Instant.now()), true, "127.0.0.1");

        return productId;
    }

    /** A floor comfortably under retail, except where a test wants to breach it. */
    private String lowerFloor(String retailPrice) {
        BigDecimal retail = new BigDecimal(retailPrice);
        return retail.compareTo(new BigDecimal("60.00")) == 0
                ? "50.00"
                : retail.multiply(new BigDecimal("0.5")).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
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
