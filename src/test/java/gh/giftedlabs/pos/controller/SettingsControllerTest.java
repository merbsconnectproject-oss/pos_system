package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.service.LoginAttemptService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Settings over HTTP — FR-SET.
 *
 * <p>What is worth proving is not that a form round-trips. It is that the
 * numbers on it are the ones the rules actually read: a threshold that saves
 * and displays but changes nothing is worse than no setting at all, because it
 * tells the shop a rule is in force that is not.
 *
 * <p>Every test here restores the defaults afterwards. There is one settings
 * row for the whole database and the other test classes share it.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Settings HTTP contract")
class SettingsControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired TerminalRepository terminals;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String run;
    private UUID outletId;
    private String ownerName;
    private String cashierName;
    private String keeperName;
    private String managerName;
    private UUID managerId;
    private UUID terminalId;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("P" + run.substring(0, 5), "Settings Branch " + run)).getId();
        terminalId = terminals.save(new Terminal(outletId, "01", "Counter 1", 1L, 1000L)).getId();

        ownerName = person("owner", Role.OWNER);
        cashierName = person("cashier", Role.CASHIER);
        keeperName = person("keeper", Role.STOREKEEPER);
        managerName = person("manager", Role.MANAGER);
        managerId = users.findByUsernameOrEmail(managerName).orElseThrow().getId();
    }

    @AfterEach
    void restoreDefaults() throws Exception {
        mvc.perform(signIn(ownerName).authorise(put("/api/settings"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(defaults())))
                .andExpect(status().isOk());
    }

    @Nested
    @DisplayName("who may read and who may write")
    class Access {

        @Test
        @DisplayName("any signed-in user may read them — a POS with no currency symbol is unusable")
        void anyoneMayRead() throws Exception {
            mvc.perform(signIn(cashierName).authorise(get("/api/settings")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.accentColor").isNotEmpty())
                    .andExpect(jsonPath("$.currencySymbol").isNotEmpty())
                    .andExpect(jsonPath("$.thresholds.idleLockMinutes").isNumber());
        }

        @Test
        @DisplayName("a cashier cannot change them — FR-SET, L-09")
        void cashierCannotWrite() throws Exception {
            mvc.perform(signIn(cashierName).authorise(put("/api/settings"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(defaults())))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }

        @Test
        @DisplayName("FR-SET-03 · a manager may change appearance without general settings access")
        void managerMayChangeAppearanceOnly() throws Exception {
            mvc.perform(signIn(managerName).authorise(put("/api/settings/appearance"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "accentColor", "#0F766E",
                                    "fontFamily", "SYSTEM",
                                    "fontScalePercent", 120))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.accentColor").value("#0F766E"))
                    .andExpect(jsonPath("$.fontFamily").value("SYSTEM"))
                    .andExpect(jsonPath("$.fontScalePercent").value(120));
        }

        @Test
        @DisplayName("nothing on the record is a credential — FR-USER-01")
        void noSharedPinOnTheWire() throws Exception {
            MvcResult result = mvc.perform(signIn(ownerName).authorise(get("/api/settings")))
                    .andExpect(status().isOk()).andReturn();

            String body = result.getResponse().getContentAsString();
            Assertions.assertFalse(body.toLowerCase().contains("pin"),
                    "A shared manager PIN would make every approval anonymous: " + body);
        }
    }

    @Nested
    @DisplayName("what a settings row will accept")
    class Validation {

        @Test
        @DisplayName("an owner saves the profile, the accent and the thresholds — FR-SET-01, 03, 06")
        void ownerSaves() throws Exception {
            Map<String, Object> body = defaults();
            body.put("companyName", "Radiance Lighting " + run);
            body.put("accentColor", "#0F766E");
            body.put("fontFamily", "VERDANA");
            body.put("fontScalePercent", 115);
            body.put("cloudSyncIntervalMinutes", 120);
            body.put("thresholds", thresholds(25, 9_900L, 3_300L));

            mvc.perform(signIn(ownerName).authorise(put("/api/settings"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.companyName").value("Radiance Lighting " + run))
                    .andExpect(jsonPath("$.accentColor").value("#0F766E"))
                    .andExpect(jsonPath("$.fontFamily").value("VERDANA"))
                    .andExpect(jsonPath("$.fontScalePercent").value(115))
                    .andExpect(jsonPath("$.cloudSyncIntervalMinutes").value(120))
                    .andExpect(jsonPath("$.thresholds.cashVariancePesewas").value(3300));

            mvc.perform(signIn(cashierName).authorise(get("/api/settings")))
                    .andExpect(jsonPath("$.thresholds.idleLockMinutes").value(25));
        }

        @Test
        @DisplayName("a colour that is not a colour is refused — FR-SET-03")
        void accentMustBeHex() throws Exception {
            Map<String, Object> body = defaults();
            body.put("accentColor", "burnt orange");

            mvc.perform(signIn(ownerName).authorise(put("/api/settings"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("FR-SET-03 · typography only accepts the safe font allowlist")
        void fontMustBeSafe() throws Exception {
            Map<String, Object> body = defaults();
            body.put("fontFamily", "url(https://example.invalid/font.woff2)");

            mvc.perform(signIn(ownerName).authorise(put("/api/settings"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("FR-SET-03 · typography scale stays within an accessible layout-safe range")
        void fontScaleIsBounded() throws Exception {
            Map<String, Object> body = defaults();
            body.put("fontScalePercent", 131);

            mvc.perform(signIn(ownerName).authorise(put("/api/settings"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("a tax rate over 100% is refused")
        void taxRateIsAPercentage() throws Exception {
            Map<String, Object> body = defaults();
            body.put("taxRatePercent", "101");

            mvc.perform(signIn(ownerName).authorise(put("/api/settings"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("an idle lock of zero minutes is refused — it would lock mid-keystroke")
        void idleLockHasAFloor() throws Exception {
            Map<String, Object> body = defaults();
            body.put("thresholds", thresholds(0, 50_000L, 2_000L));

            mvc.perform(signIn(ownerName).authorise(put("/api/settings"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("a ceiling for a role that does not exist is refused — FR-POS-10")
        void unknownRoleIsRefused() throws Exception {
            Map<String, Object> limits = new LinkedHashMap<>(Map.of("owner", 100, "supervisor", 40));
            Map<String, Object> body = defaults();
            Map<String, Object> thresholds = thresholds(10, 50_000L, 2_000L);
            thresholds.put("discountCeilingByRole", limits);
            body.put("thresholds", thresholds);

            mvc.perform(signIn(ownerName).authorise(put("/api/settings"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("the thresholds are the ones the rules read")
    class Wired {

        @Test
        @DisplayName("lowering the cash variance threshold makes a small shortfall need a note — FR-CASH-06")
        void varianceThresholdIsTheSettingOne() throws Exception {
            Session owner = signIn(ownerName);

            // GH₵ 1.00 short. At the default GH₵ 20.00 that closes silently.
            saveThresholds(owner, thresholds(10, 50_000L, 10_000L));
            String forgiving = open(owner, terminalId, 5_000L);
            closeWithoutNote(owner, forgiving, 4_900L).andExpect(status().isOk());

            saveThresholds(owner, thresholds(10, 50_000L, 0L));
            String strict = open(owner, terminalId, 5_000L);
            closeWithoutNote(owner, strict, 4_900L)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("VARIANCE_NEEDS_NOTE"));
        }

        @Test
        @DisplayName("an adjustment past the threshold needs an approver who may give one — FR-INV-06")
        void adjustmentApprovalIsTheSettingOne() throws Exception {
            Session owner = signIn(ownerName);
            String productId = createProduct(owner, "Breaker " + run);
            receive(owner, productId, "100", "10.00");

            // 10 units at GH₵ 10.00 cost is GH₵ 100.00 written off.
            saveThresholds(owner, thresholds(10, 5_000L, 2_000L));

            Session keeper = signIn(keeperName);
            mvc.perform(keeper.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    movement(productId, "DAMAGE", "10", "Water damage", null))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("APPROVAL_REQUIRED"));

            // The same write-off, approved by a manager, goes through.
            mvc.perform(keeper.authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    movement(productId, "DAMAGE", "10", "Water damage", managerId))))
                    .andExpect(status().isCreated());
        }

        @Test
        @DisplayName("a named approver who holds nothing approves nothing — FR-INV-06")
        void approverIsVerified() throws Exception {
            Session owner = signIn(ownerName);
            String productId = createProduct(owner, "Conduit " + run);
            receive(owner, productId, "100", "10.00");
            saveThresholds(owner, thresholds(10, 5_000L, 2_000L));

            UUID cashierId = users.findByUsernameOrEmail(cashierName).orElseThrow().getId();

            mvc.perform(signIn(keeperName).authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    movement(productId, "DAMAGE", "10", "Water damage", cashierId))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("APPROVAL_REQUIRED"));
        }

        @Test
        @DisplayName("a small adjustment still needs nobody — the threshold is not a ban")
        void smallAdjustmentsPassFreely() throws Exception {
            Session owner = signIn(ownerName);
            String productId = createProduct(owner, "Socket " + run);
            receive(owner, productId, "100", "10.00");
            saveThresholds(owner, thresholds(10, 50_000L, 2_000L));

            mvc.perform(signIn(keeperName).authorise(post("/api/stock/movements"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(
                                    movement(productId, "DAMAGE", "2", "Dropped", null))))
                    .andExpect(status().isCreated());
        }
    }

    // --- helpers -----------------------------------------------------------

    private String person(String prefix, Role role) {
        String username = prefix + "-" + run.toLowerCase();
        User user = new User(username, "Test " + prefix, passwords.encode(PASSWORD));
        user.assignRole(role);
        user.assignOutlet(outletId);
        users.save(user);
        loginAttempts.recordSuccess(username);
        return username;
    }

    private Map<String, Object> defaults() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("companyName", "Settings Test Co");
        body.put("taxEnabled", false);
        body.put("taxRatePercent", "0");
        body.put("currencyCode", "GHS");
        body.put("currencySymbol", "GH₵");
        body.put("cashRounding", "EXACT");
        body.put("receiptPrinterWidth", "80mm");
        body.put("autoPrintReceipt", true);
        body.put("showCashierOnReceipt", true);
        body.put("accentColor", "#F97316");
        body.put("fontFamily", "JAKARTA");
        body.put("fontScalePercent", 100);
        body.put("cloudSyncIntervalMinutes", 15);
        body.put("thresholds", thresholds(10, 50_000L, 2_000L));
        body.put("enforceFloorPriceApproval", true);
        body.put("enforceVoidApproval", true);
        body.put("enforceBlindShiftCount", true);
        return body;
    }

    private Map<String, Object> thresholds(int idleMinutes, long adjustment, long variance) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("idleLockMinutes", idleMinutes);
        values.put("adjustmentApprovalPesewas", adjustment);
        values.put("cashVariancePesewas", variance);
        values.put("discountCeilingByRole",
                Map.of("owner", 100, "manager", 25, "cashier", 10, "storekeeper", 0));
        return values;
    }

    private void saveThresholds(Session session, Map<String, Object> thresholds) throws Exception {
        Map<String, Object> body = defaults();
        body.put("thresholds", thresholds);
        mvc.perform(session.authorise(put("/api/settings"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    private Map<String, Object> movement(String productId, String type, String quantity,
                                         String reason, UUID approvedBy) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId);
        body.put("outletId", outletId.toString());
        body.put("type", type);
        body.put("quantity", quantity);
        body.put("reason", reason);
        if (approvedBy != null) body.put("approvedBy", approvedBy.toString());
        return body;
    }

    private String createProduct(Session session, String name) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Hardware & Tools");
        body.put("brand", "Generic");
        body.put("baseUnit", "pc");
        body.put("retailPrice", "20.00");
        body.put("tradePrice", "18.00");
        body.put("floorPrice", "15.00");

        MvcResult result = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private void receive(Session session, String productId, String quantity, String unitCost) throws Exception {
        Map<String, Object> body = movement(productId, "RECEIPT", quantity, null, null);
        body.put("unitCost", unitCost);
        mvc.perform(session.authorise(post("/api/stock/movements"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }

    private String open(Session session, UUID terminalId, long floatPesewas) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/shifts"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "terminalId", terminalId.toString(), "openingFloat", floatPesewas))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private org.springframework.test.web.servlet.ResultActions closeWithoutNote(
            Session session, String shiftId, long counted) throws Exception {
        return mvc.perform(session.authorise(post("/api/shifts/" + shiftId + "/close"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("countedCash", counted))));
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
