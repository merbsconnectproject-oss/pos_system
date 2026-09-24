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
import gh.giftedlabs.pos.service.ShiftService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
    @Autowired ShiftService shiftService;
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

        // FR-POS-02 · BR-13: a sale has to land in a shift, so every test that
        // sells needs one open. Its own test asserts the refusal.
        shiftService.open(terminalId, 20_000L,
                new PosPrincipal(ownerId, ownerName, outletId, Instant.now()), "127.0.0.1");
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
            String productId = stockedProduct(session, "Drum Cable " + run, "m", "14.50", "500",
                    List.of(sellingUnit("Drum 100m", "100", "1150.00")));

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

        @Test
        @DisplayName("non-cash payments require an explicit received-funds reference — FR-PAY-03")
        void nonCashRequiresReference() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Reference lamp " + run, "pcs", "35.00", "20");
            Map<String, Object> payment = new LinkedHashMap<>();
            payment.put("id", UUID.randomUUID().toString());
            payment.put("method", "card");
            payment.put("amount", 3500L);

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "35.00"), payment))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("PAYMENT_REFERENCE_REQUIRED"));
        }

        @Test
        @DisplayName("duplicate payment ids in one request are rejected before persistence — FR-PAY-07")
        void duplicatePaymentIdsAreRejected() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Duplicate payment " + run, "pcs", "35.00", "20");
            String id = UUID.randomUUID().toString();
            Map<String, Object> first = cash(1750L);
            first.put("id", id);
            Map<String, Object> second = cash(1750L);
            second.put("id", id);

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "35.00"), first, second))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("DUPLICATE_PAYMENT"));
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
        @DisplayName("an approver who may not approve is refused — BR-10")
        void namedApproverIsVerified() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Unapproved " + run, "pcs", "60.00", "20");

            // A cashier holds sale.discount but not sale.approve_below_floor.
            // The id arrives in the request body, so taking it on trust would
            // let the browser name anyone — including the seller themselves.
            String clerkName = "clerk-" + run.toLowerCase();
            User clerk = new User(clerkName, "Test Clerk", passwords.encode(PASSWORD));
            clerk.assignRole(Role.CASHIER);
            clerk.assignOutlet(outletId);
            UUID clerkId = users.save(clerk).getId();

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "40.00", null, clerkId.toString()),
                                    cash(4000L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("APPROVER_NOT_PERMITTED"));
        }

        @Test
        @DisplayName("a discount may not walk a line under the floor unapproved — BR-10")
        void aDiscountCannotSlipUnderTheFloor() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Floor via discount " + run, "pcs", "60.00", "20");

            // Retail 60.00, floor 50.00. The line is rung at the full 60 — which
            // passes any check made against the submitted price — and then 20.00
            // is taken off it, settling at 40.00. That is ten cedis under the
            // floor with nobody asked.
            //
            // The floor used to be checked against unit_price *before* the
            // discount was subtracted, so this was the way around BR-10: stay at
            // list price and discount to wherever you liked, up to your ceiling.
            saveCeilings(session, Map.of("owner", 100, "manager", 25, "cashier", 10, "storekeeper", 0));

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "1", "60.00", 2_000L, null),
                                    cash(4000L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("BELOW_FLOOR_PRICE"));
        }

        @Test
        @DisplayName("nor may a cart discount — BR-10, FR-POS-10")
        void aCartDiscountCannotSlipUnderTheFloorEither() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Floor via cart " + run, "pcs", "60.00", "20");

            saveCeilings(session, Map.of("owner", 100, "manager", 25, "cashier", 10, "storekeeper", 0));

            // 25% off GH₵60 is GH₵45 — under the GH₵50 floor.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(saleWithCart(
                                    List.of(line(productId, "pcs", "1", "1", "60.00", null, null)),
                                    Map.of("cartDiscountPercent", "25"),
                                    cash(4500L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("BELOW_FLOOR_PRICE"));
        }

        @Test
        @DisplayName("a discount under the floor goes through once approved — BR-10")
        void underTheFloorWithApprovalIsAllowed() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Floor discount ok " + run, "pcs", "60.00", "20");

            saveCeilings(session, Map.of("owner", 100, "manager", 25, "cashier", 10, "storekeeper", 0));

            Map<String, Object> item = line(productId, "pcs", "1", "1", "60.00", 2_000L, null);
            item.put("floorApprovedBy", ownerId.toString());

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(item, cash(4000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.total").value(4000));
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
    @DisplayName("discounts")
    class Discounts {

        /**
         * The ceilings are one global settings row, so anything moved here is
         * put back. The other test classes share it.
         */
        @AfterEach
        void restoreCeilings() throws Exception {
            saveCeilings(signIn(), Map.of("owner", 100, "manager", 25, "cashier", 10, "storekeeper", 0));
        }

        @Test
        @DisplayName("past the role's ceiling it is refused — FR-POS-10, FR-SET-06")
        void aboveTheCeilingIsRefused() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Discounted " + run, "pcs", "100.00", "20");

            // The owner may now give 5%. This line asks for 50.
            saveCeilings(session, Map.of("owner", 5, "manager", 25, "cashier", 10, "storekeeper", 0));

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "1", "100.00", 5_000L, null),
                                    cash(5000L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("DISCOUNT_ABOVE_CEILING"));
        }

        @Test
        @DisplayName("within it, it goes through untouched — FR-POS-10")
        void withinTheCeilingIsAllowed() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Modest " + run, "pcs", "100.00", "20");

            saveCeilings(session, Map.of("owner", 50, "manager", 25, "cashier", 10, "storekeeper", 0));

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "1", "100.00", 5_000L, null),
                                    cash(5000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.discountTotal").value(5000));
        }

        @Test
        @DisplayName("an approver whose own ceiling covers it lets it through — FR-POS-10")
        void anApproverWithHeadroomAllowsIt() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Approved discount " + run, "pcs", "100.00", "20");

            String managerName = "manager-" + run.toLowerCase();
            User manager = new User(managerName, "Test Manager", passwords.encode(PASSWORD));
            manager.assignRole(Role.MANAGER);
            manager.assignOutlet(outletId);
            UUID managerId = users.save(manager).getId();

            // The seller may give 5%; the manager may give 20. The line asks 20.
            saveCeilings(session, Map.of("owner", 5, "manager", 20, "cashier", 10, "storekeeper", 0));

            Map<String, Object> item = line(productId, "pcs", "1", "1", "100.00", 2_000L, null);
            item.put("discountApprovedBy", managerId.toString());

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(item, cash(8000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.discountTotal").value(2000));
        }

        @Test
        @DisplayName("an approver without the headroom does not — FR-POS-10")
        void anApproverWithoutHeadroomDoesNot() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Overreach " + run, "pcs", "100.00", "20");

            String managerName = "manager2-" + run.toLowerCase();
            User manager = new User(managerName, "Test Manager Two", passwords.encode(PASSWORD));
            manager.assignRole(Role.MANAGER);
            manager.assignOutlet(outletId);
            UUID managerId = users.save(manager).getId();

            saveCeilings(session, Map.of("owner", 5, "manager", 20, "cashier", 10, "storekeeper", 0));

            Map<String, Object> item = line(productId, "pcs", "1", "1", "100.00", 6_000L, null);
            item.put("discountApprovedBy", managerId.toString());

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(item, cash(4000L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("DISCOUNT_ABOVE_CEILING"));
        }
    }

    @Nested
    @DisplayName("cart discounts")
    class CartDiscounts {

        @AfterEach
        void restoreCeilings() throws Exception {
            saveCeilings(signIn(), Map.of("owner", 100, "manager", 25, "cashier", 10, "storekeeper", 0));
        }

        @Test
        @DisplayName("a percentage off the cart reaches the total — FR-POS-10")
        void percentageOffTheCart() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Cart pct " + run, "pcs", "100.00", "20");

            // The whole point: the till showed GH₵90 due and the customer paid
            // GH₵90. Before this, the server priced the sale at GH₵100, found
            // the payment 10 short, and refused a sale the cashier had already
            // taken the money for.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(saleWithCart(
                                    List.of(line(productId, "pcs", "1", "1", "100.00", null, null)),
                                    Map.of("cartDiscountPercent", "10"),
                                    cash(9000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.subtotal").value(10000))
                    .andExpect(jsonPath("$.discountTotal").value(1000))
                    .andExpect(jsonPath("$.cartDiscount").value(1000))
                    .andExpect(jsonPath("$.total").value(9000));
        }

        @Test
        @DisplayName("an amount off the cart does the same — FR-POS-10")
        void amountOffTheCart() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Cart amt " + run, "pcs", "100.00", "20");

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(saleWithCart(
                                    List.of(line(productId, "pcs", "1", "1", "100.00", null, null)),
                                    Map.of("cartDiscount", 500L),
                                    cash(9500L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.cartDiscount").value(500))
                    .andExpect(jsonPath("$.total").value(9500));
        }

        @Test
        @DisplayName("it is spread over the lines so the pesewas still add up — BR-11")
        void apportionedWithoutLosingAPesewa() throws Exception {
            Session session = signIn();
            String first = stockedProduct(session, "Split A " + run, "pcs", "10.00", "20");
            String second = stockedProduct(session, "Split B " + run, "pcs", "10.00", "20");
            String third = stockedProduct(session, "Split C " + run, "pcs", "10.00", "20");

            // GH₵30 less 10% is GH₵27: three lines of GH₵10 sharing 300
            // pesewas. 300/3 divides evenly, but the line discounts must still
            // sum to exactly the concession rather than to 299 or 301.
            String body = json.writeValueAsString(saleWithCart(
                    List.of(line(first, "pcs", "1", "1", "10.00", null, null),
                            line(second, "pcs", "1", "1", "10.00", null, null),
                            line(third, "pcs", "1", "1", "10.00", null, null)),
                    Map.of("cartDiscountPercent", "10"),
                    cash(2700L)));

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.total").value(2700))
                    .andExpect(jsonPath("$.discountTotal").value(300))
                    .andExpect(jsonPath("$.items[0].discount").value(100))
                    .andExpect(jsonPath("$.items[1].discount").value(100))
                    .andExpect(jsonPath("$.items[2].discount").value(100));
        }

        @Test
        @DisplayName("an indivisible concession still sums to exactly what was given — BR-11")
        void remainderGoesSomewhereRatherThanNowhere() throws Exception {
            Session session = signIn();
            String first = stockedProduct(session, "Odd A " + run, "pcs", "10.00", "20");
            String second = stockedProduct(session, "Odd B " + run, "pcs", "10.00", "20");
            String third = stockedProduct(session, "Odd C " + run, "pcs", "10.00", "20");

            // 100 pesewas across three equal lines: 33, 33, 34 — never 99.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(saleWithCart(
                                    List.of(line(first, "pcs", "1", "1", "10.00", null, null),
                                            line(second, "pcs", "1", "1", "10.00", null, null),
                                            line(third, "pcs", "1", "1", "10.00", null, null)),
                                    Map.of("cartDiscount", 100L),
                                    cash(2900L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.discountTotal").value(100))
                    .andExpect(jsonPath("$.total").value(2900));
        }

        @Test
        @DisplayName("past the seller's ceiling it is refused like any other discount — FR-POS-10")
        void aboveTheCeilingIsRefused() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Cart ceiling " + run, "pcs", "100.00", "20");

            saveCeilings(session, Map.of("owner", 5, "manager", 25, "cashier", 10, "storekeeper", 0));

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(saleWithCart(
                                    List.of(line(productId, "pcs", "1", "1", "100.00", null, null)),
                                    Map.of("cartDiscountPercent", "40"),
                                    cash(6000L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("DISCOUNT_ABOVE_CEILING"));
        }

        @Test
        @DisplayName("more off than the cart holds is refused, not clamped — FR-POS-10")
        void moreThanTheCartIsRefused() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Cart over " + run, "pcs", "100.00", "20");

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(saleWithCart(
                                    List.of(line(productId, "pcs", "1", "1", "100.00", null, null)),
                                    Map.of("cartDiscount", 20_000L),
                                    cash(100L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("CART_DISCOUNT_EXCEEDS_CART"));
        }

        @Test
        @DisplayName("stated as both a percentage and an amount it is refused — FR-POS-10")
        void statedTwiceIsRefused() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Cart twice " + run, "pcs", "100.00", "20");

            Map<String, Object> both = new LinkedHashMap<>();
            both.put("cartDiscountPercent", "10");
            both.put("cartDiscount", 500L);

            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(saleWithCart(
                                    List.of(line(productId, "pcs", "1", "1", "100.00", null, null)),
                                    both, cash(9000L)))))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("CART_DISCOUNT_STATED_TWICE"));
        }

        @Test
        @DisplayName("a percentage is taken after line discounts, as the till quotes it — FR-POS-10")
        void percentageFollowsTheLineDiscount() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Cart after line " + run, "pcs", "100.00", "20");

            saveCeilings(session, Map.of("owner", 50, "manager", 25, "cashier", 10, "storekeeper", 0));

            // GH₵100 less GH₵20 on the line is GH₵80; 10% off that is GH₵8,
            // not GH₵10. The customer is quoted 10% off what they were about to
            // pay, which is the number on the screen in front of them.
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(saleWithCart(
                                    List.of(line(productId, "pcs", "1", "1", "100.00", 2_000L, null)),
                                    Map.of("cartDiscountPercent", "10"),
                                    cash(7200L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.cartDiscount").value(800))
                    .andExpect(jsonPath("$.discountTotal").value(2800))
                    .andExpect(jsonPath("$.total").value(7200));
        }
    }

    @Nested
    @DisplayName("cost never reaches a reader who may not see it — FR-RPT-05")
    class CostRedaction {

        @Test
        @DisplayName("an owner reads the frozen cost on the line")
        void ownerSeesCost() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Costed " + run, "pcs", "100.00", "20");
            mvc.perform(session.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "100.00"), cash(10000L)))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.items[0].frozenCostPrice").exists());
        }

        @Test
        @DisplayName("a cashier reading the same sale back does not")
        void cashierSeesNoCost() throws Exception {
            Session owner = signIn();
            String productId = stockedProduct(owner, "Hidden cost " + run, "pcs", "100.00", "20");

            MvcResult created = mvc.perform(owner.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "100.00"), cash(10000L)))))
                    .andExpect(status().isCreated()).andReturn();
            String saleId = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

            String clerkName = "seller-" + run.toLowerCase();
            User clerk = new User(clerkName, "Test Seller", passwords.encode(PASSWORD));
            clerk.assignRole(Role.CASHIER);
            clerk.assignOutlet(outletId);
            users.save(clerk);
            loginAttempts.recordSuccess(clerkName);

            // Release gate 7. The cost was on every line of every sale returned
            // to anybody holding pos.sell, which is every cashier — and the
            // dashboard then computed a profit figure out of it.
            mvc.perform(signInAs(clerkName).authorise(get("/api/sales/" + saleId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].frozenCostPrice").doesNotExist())
                    // Everything the cashier does need is still there.
                    .andExpect(jsonPath("$.items[0].unitPrice").exists())
                    .andExpect(jsonPath("$.receiptNumber").exists());
        }

        @Test
        @DisplayName("nor on the sales they list back")
        void cashierSeesNoCostInHistory() throws Exception {
            Session owner = signIn();
            String productId = stockedProduct(owner, "Hidden history " + run, "pcs", "100.00", "20");
            mvc.perform(owner.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "100.00"), cash(10000L)))))
                    .andExpect(status().isCreated());

            String clerkName = "lister-" + run.toLowerCase();
            User clerk = new User(clerkName, "Test Lister", passwords.encode(PASSWORD));
            clerk.assignRole(Role.CASHIER);
            clerk.assignOutlet(outletId);
            users.save(clerk);
            loginAttempts.recordSuccess(clerkName);

            mvc.perform(signInAs(clerkName).authorise(get("/api/sales")
                            .param("outletId", outletId.toString())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].items[0].frozenCostPrice").doesNotExist());
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
    @DisplayName("without an open shift")
    class NoShift {

        @Test
        @DisplayName("a sale is refused by the server, not just the till — FR-POS-02, BR-13")
        void refusesToSell() throws Exception {
            Session session = signIn();
            String productId = stockedProduct(session, "Unshifted " + run, "pcs", "10.00", "20");

            // A second cashier at this outlet has no shift of their own.
            String otherName = "cashier-" + run.toLowerCase();
            User other = new User(otherName, "Other Cashier", passwords.encode(PASSWORD));
            other.assignRole(Role.CASHIER);
            other.assignOutlet(outletId);
            users.save(other);
            loginAttempts.recordSuccess(otherName);

            Session theirs = signInAs(otherName);
            mvc.perform(theirs.authorise(post("/api/sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(sale(
                                    line(productId, "pcs", "1", "10.00"), cash(1000L)))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("NO_OPEN_SHIFT"));
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
                        new BigDecimal(price), 0L, null, null)),
                null, null, null,
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

    /** FR-POS-10: move the ceilings, leaving every other setting alone. */
    private void saveCeilings(Session session, Map<String, Object> byRole) throws Exception {
        MvcResult current = mvc.perform(session.authorise(get("/api/settings")))
                .andExpect(status().isOk()).andReturn();
        Map<String, Object> view = json.readValue(current.getResponse().getContentAsString(), Map.class);

        @SuppressWarnings("unchecked")
        Map<String, Object> thresholds = new LinkedHashMap<>((Map<String, Object>) view.get("thresholds"));
        thresholds.put("discountCeilingByRole", byRole);

        Map<String, Object> body = new LinkedHashMap<>(view);
        body.remove("updatedAt");
        body.put("thresholds", thresholds);
        // Nobody has named the business yet in a fresh database, and the form
        // requires one — this test is about ceilings, not about the profile.
        if (body.get("companyName") == null) body.put("companyName", "Sales Test Co");

        mvc.perform(session.authorise(put("/api/settings"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isOk());
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

    /** FR-POS-10: a sale carrying a cart-level concession. */
    @SafeVarargs
    private Map<String, Object> saleWithCart(List<Map<String, Object>> items,
                                             Map<String, Object> cartFields,
                                             Map<String, Object>... payments) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", UUID.randomUUID().toString());
        body.put("outletId", outletId.toString());
        body.put("terminalId", terminalId.toString());
        body.put("items", items);
        body.putAll(cartFields);
        body.put("payments", List.of(payments));
        return body;
    }

    /** A product with stock already received, so a sale has something to take. */
    private String stockedProduct(Session session, String name, String baseUnit,
                                  String retailPrice, String quantity) throws Exception {
        return stockedProduct(session, name, baseUnit, retailPrice, quantity, List.of());
    }

    /**
     * FR-UOM-02: {@code sellingUnits} are the units this product may transact in.
     *
     * <p>A line naming a unit the catalogue does not carry is refused, so a test
     * that sells by the drum has to create the drum. This fixture used to leave
     * the list empty and post whatever factor it liked, which is the behaviour
     * FR-UOM-03 exists to prevent.
     */
    private String stockedProduct(Session session, String name, String baseUnit, String retailPrice,
                                  String quantity, List<Map<String, Object>> sellingUnits) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", baseUnit);
        body.put("retailPrice", retailPrice);
        body.put("tradePrice", retailPrice);
        body.put("floorPrice", "50.00".equals(retailPrice) ? retailPrice : lowerFloor(retailPrice));
        if (!sellingUnits.isEmpty()) body.put("sellingUnits", sellingUnits);

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

    private Map<String, Object> sellingUnit(String name, String conversionFactor, String price) {
        Map<String, Object> unit = new LinkedHashMap<>();
        unit.put("name", name);
        unit.put("conversionFactor", conversionFactor);
        unit.put("price", price);
        unit.put("tradePrice", price);
        return unit;
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
        return signInAs(ownerName);
    }

    private Session signInAs(String identifier) throws Exception {
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
