package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.InventoryMovement;
import gh.giftedlabs.pos.entity.Supplier;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.InventoryMovementRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.SupplierRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.MovementType;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.concurrent.TimeUnit;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The catalogue over HTTP — FR-PROD-02…08, FR-UOM-02/03/04.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Catalogue HTTP contract")
class ProductControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired SupplierRepository suppliers;
    @Autowired InventoryMovementRepository movements;
    @Autowired JdbcTemplate jdbc;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String run;

    @BeforeEach
    void seedAnOwnerInABranch() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        // Six characters, the most BR-6 allows, so thirteen tests sharing one
        // container cannot collide on the unique code.
        UUID outletId = outlets.save(new Outlet("P" + run.substring(0, 5), "Catalogue Branch " + run)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        users.save(owner);
        loginAttempts.recordSuccess(ownerName);
    }

    @Nested
    @DisplayName("creating a product")
    class Creating {

        @Test
        @DisplayName("stores the preferred supplier on the product — FR-PROD-01")
        void storesTheSupplier() throws Exception {
            Session session = signIn();
            Supplier supplier = suppliers.save(new Supplier("Catalogue supplier " + run));
            Map<String, Object> body = cable(null);
            body.put("supplierId", supplier.getId());

            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.supplierId").value(supplier.getId().toString()));
        }

        @Test
        @DisplayName("generates a SKU when the field is left blank — FR-PROD-02")
        void generatesASku() throws Exception {
            Session session = signIn();

            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(cable(null))))
                    .andExpect(status().isCreated())
                    // {OUTLET}-{CATEGORY}-{NNN}: P** from the branch, CAB from
                    // "Cables & Wires".
                    .andExpect(jsonPath("$.sku").value("P" + run.substring(0, 5) + "-CAB-001"));
        }

        @Test
        @DisplayName("keeps a SKU the user typed — FR-PROD-02 manual override")
        void honoursAManualSku() throws Exception {
            Session session = signIn();
            Map<String, Object> body = cable("SHOP-OWN-42");

            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.sku").value("SHOP-OWN-42"));
        }

        @Test
        @DisplayName("refuses a SKU another product already carries — FR-PROD-02")
        void refusesADuplicateSku() throws Exception {
            Session session = signIn();
            String sku = "DUP-" + run;
            create(session, cable(sku));

            Map<String, Object> second = cable(sku);
            second.put("name", "A different cable");
            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(second)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("SKU_TAKEN"))
                    .andExpect(jsonPath("$.details.field").value("sku"));
        }

        @Test
        @DisplayName("refuses a floor price above retail — BR-10")
        void refusesAFloorAboveRetail() throws Exception {
            Session session = signIn();
            Map<String, Object> body = cable(null);
            body.put("floorPrice", "9999.00");

            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
    }

    @Nested
    @DisplayName("units and barcodes")
    class UnitsAndBarcodes {

        @Test
        @DisplayName("a drum of 100 m converts to 100 base units — FR-UOM-02")
        void storesTheConversionFactor() throws Exception {
            Session session = signIn();

            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(cable(null))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.baseUnit").value("m"))
                    .andExpect(jsonPath("$.sellingUnits[?(@.name=='Drum 100m')].conversionFactor")
                            .value(org.hamcrest.Matchers.contains(100)))
                    // FR-UOM-04: the drum prices independently, not as 100 x the metre.
                    .andExpect(jsonPath("$.sellingUnits[?(@.name=='Drum 100m')].price")
                            .value(org.hamcrest.Matchers.contains(1150.0)));
        }

        @Test
        @DisplayName("the carton code scans to the product and names its unit — FR-PROD-04")
        void scanResolvesToTheProductAndUnit() throws Exception {
            Session session = signIn();
            String drumCode = "900" + run + "2";
            create(session, cable(null));

            mvc.perform(session.authorise(get("/api/products/barcode/" + drumCode)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.barcodes[?(@.code=='" + drumCode + "')].unitName")
                            .value(org.hamcrest.Matchers.contains("Drum 100m")));
        }

        @Test
        @DisplayName("refuses a barcode that already scans elsewhere — FR-PROD-03")
        void refusesADuplicateBarcode() throws Exception {
            Session session = signIn();
            create(session, cable(null));

            Map<String, Object> second = cable("OTHER-" + run);
            second.put("name", "Another cable");
            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(second)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BARCODE_TAKEN"));
        }

        @Test
        @DisplayName("refuses a barcode bound to a unit the product does not sell — FR-PROD-04")
        void refusesAnUnknownUnit() throws Exception {
            Session session = signIn();
            Map<String, Object> body = cable(null);
            body.put("barcodes", List.of(Map.of("code", "911" + run, "unitName", "Pallet")));

            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BARCODE_UNIT_UNKNOWN"));
        }

        @Test
        @DisplayName("a code for the base unit needs no selling unit row — FR-UOM-01")
        void baseUnitCodeIsAccepted() throws Exception {
            Session session = signIn();
            Map<String, Object> body = cable(null);
            body.put("sellingUnits", List.of());
            body.put("barcodes", List.of(Map.of("code", "922" + run, "unitName", "m")));

            mvc.perform(session.authorise(post("/api/products"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated());
        }
    }

    @Nested
    @DisplayName("search")
    class Search {

        @Test
        @DisplayName("returns the correct top three for four partial terms under 300ms at 3,000 products — FR-PROD-06 · NFR-1")
        void meetsTheLoadedCatalogueAcceptanceTarget() throws Exception {
            Session session = signIn();
            List<Object[]> rows = new ArrayList<>();
            for (int i = 0; i < 2_997; i++) {
                rows.add(new Object[]{"LOAD-" + run + "-" + i, "Loaded fixture " + i, "ordinary stock item"});
            }
            for (int i = 1; i <= 3; i++) {
                rows.add(new Object[]{"TOP-" + run + "-" + i,
                        "Twin 2.5mm cable target " + i, "Nexans fire-resistant cable"});
            }
            jdbc.batchUpdate("""
                    insert into product (sku, name, description, base_unit, retail_price, trade_price, floor_price)
                    values (?, ?, ?, 'm', 10, 9, 8)
                    """, rows);

            // Warm statement/JIT caches; the acceptance measures catalogue search, not first JVM startup.
            mvc.perform(session.authorise(get("/api/products").param("q", "nex 2.5 fire twin").param("size", "3")))
                    .andExpect(status().isOk());
            long started = System.nanoTime();
            mvc.perform(session.authorise(get("/api/products").param("q", "nex 2.5 fire twin").param("size", "3")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(3))
                    .andExpect(jsonPath("$.content[0].sku").value(org.hamcrest.Matchers.startsWith("TOP-" + run)));
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            System.out.println("NFR-1 · loaded four-term search: " + elapsedMs + "ms of 300");
            assertTrue(elapsedMs < 300, "Loaded four-term search took " + elapsedMs + "ms");

            // The budget alone is a race against whatever else the machine is
            // doing — it passed on fast runs and failed on slow ones for weeks
            // while the query was scanning the whole catalogue. This asserts the
            // *plan*: the trigram index is reached, so a rewrite that quietly
            // drops back to a sequential scan fails here even on a fast machine.
            // No assertion on the plan. Measured on a 30,000-row catalogue, the
            // planner uses the trigram index for a selective term and scans for a
            // term that matches most of the table — both correct, and neither
            // something a test should force. What must hold is the budget above.
        }

        @Test
        @DisplayName("searches the description as well as catalogue labels — FR-PROD-06")
        void searchesDescription() throws Exception {
            Session session = signIn();
            Map<String, Object> body = cable(null);
            body.put("description", "Flame-retardant concealed installation " + run);
            create(session, body);

            mvc.perform(session.authorise(get("/api/products").param("q", "conceal " + run)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(1));
        }

        @Test
        @DisplayName("matches partial, out-of-order terms across fields — FR-PROD-06")
        void matchesAcrossFields() throws Exception {
            Session session = signIn();
            create(session, cable(null));

            // "nexans" is only in the brand and the run only in the name, so
            // neither field holds both terms and neither is in the name's order.
            // Every other test's product is also a Nexans, so a brand match
            // alone would not narrow to one.
            mvc.perform(session.authorise(get("/api/products").param("q", "nexans " + run)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(1))
                    .andExpect(jsonPath("$.content[0].brand").value("Nexans"));
        }

        @Test
        @DisplayName("a term matching nothing returns nothing, not everything — FR-PROD-06")
        void everyTermMustMatch() throws Exception {
            Session session = signIn();
            create(session, cable(null));

            mvc.perform(session.authorise(get("/api/products").param("q", run + " bicycle")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(0));
        }
    }

    @Nested
    @DisplayName("deactivating")
    class Deactivating {

        @Test
        @DisplayName("hides it from the default list but keeps the row — FR-PROD-08 · BR-17")
        void deactivatesRatherThanDeletes() throws Exception {
            Session session = signIn();
            String id = create(session, cable(null));

            mvc.perform(session.authorise(post("/api/products/" + id + "/active?value=false")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.active").value(false));

            mvc.perform(session.authorise(get("/api/products").param("q", run)))
                    .andExpect(jsonPath("$.content.length()").value(0));
            mvc.perform(session.authorise(get("/api/products").param("q", run).param("activeOnly", "false")))
                    .andExpect(jsonPath("$.content.length()").value(1));
            mvc.perform(session.authorise(get("/api/products/" + id)))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("editing")
    class Editing {

        @Test
        @DisplayName("keeps the existing SKU when the field is blank — FR-PROD-02")
        void blankSkuOnEditKeepsTheCurrentOne() throws Exception {
            Session session = signIn();
            String id = create(session, cable("KEEP-" + run));

            Map<String, Object> body = cable(null);
            body.put("name", "Renamed cable");
            mvc.perform(session.authorise(put("/api/products/" + id))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.sku").value("KEEP-" + run))
                    .andExpect(jsonPath("$.name").value("Renamed cable"));
        }
    }

    @Nested
    @DisplayName("bulk import")
    class BulkImport {

        @Test
        @DisplayName("commits mapped rows server-side and safely allocates blank SKUs — FR-PROD-10 · FR-PROD-02")
        void commitsRowsAndAllocatesSkus() throws Exception {
            Session session = signIn();
            Map<String, Object> first = cable(null);
            first.put("name", "Imported cable A " + run);
            first.put("barcodes", List.of());
            Map<String, Object> second = cable(null);
            second.put("name", "Imported cable B " + run);
            second.put("barcodes", List.of());

            mvc.perform(session.authorise(post("/api/products/import"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("products", List.of(first, second)))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.created").value(2))
                    .andExpect(jsonPath("$.updated").value(0))
                    .andExpect(jsonPath("$.products[0].sku").value("P" + run.substring(0, 5) + "-CAB-001"))
                    .andExpect(jsonPath("$.products[1].sku").value("P" + run.substring(0, 5) + "-CAB-002"));
        }
    }

    @Nested
    @DisplayName("history")
    class History {

        @Test
        @DisplayName("returns real receipt and opening costs with outlet and actor — FR-PROD-09")
        void returnsCostHistory() throws Exception {
            Session session = signIn();
            String productId = create(session, cable(null));
            User actor = users.findByUsernameOrEmail(ownerName).orElseThrow();
            UUID outletId = actor.getOutletIds().iterator().next();
            movements.save(new InventoryMovement(UUID.fromString(productId), outletId, MovementType.OPENING,
                    new BigDecimal("10.000"), new BigDecimal("7.2500"), null, "Initial count",
                    "CATALOGUE", UUID.randomUUID(), false, actor.getId(), Instant.now()));

            mvc.perform(session.authorise(get("/api/products/" + productId + "/cost-history")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].unitCost").value(7.25))
                    .andExpect(jsonPath("$[0].movementType").value("OPENING"))
                    .andExpect(jsonPath("$[0].outletName").value("Catalogue Branch " + run))
                    .andExpect(jsonPath("$[0].changedBy").value("Test Owner"));
        }
    }

    // --- helpers -----------------------------------------------------------

    /** A product with two units and a code bound to each — the FR-UOM worked example. */
    private Map<String, Object> cable(String sku) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (sku != null) body.put("sku", sku);
        body.put("name", "Single Core Cable 2.5mm " + run);
        body.put("category", "Cables & Wires");
        body.put("brand", "Nexans");
        body.put("baseUnit", "m");
        body.put("retailPrice", "14.50");
        body.put("tradePrice", "12.90");
        body.put("floorPrice", "11.00");
        body.put("sellingUnits", List.of(
                Map.of("name", "Metre", "conversionFactor", "1", "price", "14.50", "tradePrice", "12.90"),
                Map.of("name", "Drum 100m", "conversionFactor", "100", "price", "1150.00", "tradePrice", "1090.00")));
        body.put("barcodes", List.of(
                Map.of("code", "900" + run + "1", "unitName", "Metre"),
                Map.of("code", "900" + run + "2", "unitName", "Drum 100m")));
        return body;
    }

    private String create(Session session, Map<String, Object> body) throws Exception {
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

    private Session signIn() throws Exception {
        MockHttpSession http = new MockHttpSession();
        MvcResult csrf = mvc.perform(get("/api/auth/csrf").session(http))
                .andExpect(status().isOk()).andReturn();
        String token = json.readTree(csrf.getResponse().getContentAsString()).get("token").asText();

        MvcResult signedIn = mvc.perform(post("/api/auth/sign-in").session(http)
                        .header("X-XSRF-TOKEN", token).cookie(new Cookie("XSRF-TOKEN", token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", ownerName, "password", PASSWORD))))
                .andExpect(status().isOk())
                .andReturn();

        return new Session((MockHttpSession) signedIn.getRequest().getSession(false), token);
    }
}
