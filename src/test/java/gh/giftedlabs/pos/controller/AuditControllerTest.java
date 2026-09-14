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
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Reading the audit log — BR-15.
 *
 * <p>Drives real actions and then reads back what they recorded, rather than
 * inserting rows directly. An audit test that seeds its own rows proves the
 * query and nothing about whether the system actually writes an entry when
 * something happens.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Audit log HTTP contract")
class AuditControllerTest {

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
    void seedStaff() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("A" + run.substring(0, 5), "Audit Branch " + run)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Ama Serwaa " + run, passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        users.save(owner);

        cashierName = "cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Kofi Mensah " + run, passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        cashier.assignOutlet(outletId);
        users.save(cashier);

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(cashierName);
    }

    @Test
    @DisplayName("a cashier cannot read it — it records them — BR-15 · NFR-9")
    void cashierCannotRead() throws Exception {
        Session session = signIn(cashierName);

        mvc.perform(session.authorise(get("/api/audit")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    @DisplayName("records the sign-in that happened, with a resolved actor name — BR-15")
    void recordsSignInWithActorName() throws Exception {
        Session session = signIn(ownerName);

        mvc.perform(session.authorise(get("/api/audit").param("action", "AUTH_SIGN_IN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.details =~ /.*" + ownerName + ".*/)]").exists())
                // A UUID is not an answer to "who did this".
                .andExpect(jsonPath("$[?(@.actor == 'Ama Serwaa " + run + "')]").exists());
    }

    @Test
    @DisplayName("renders a product edit as the fields that actually changed — BR-15")
    void rendersAChangeAsBeforeAndAfter() throws Exception {
        Session session = signIn(ownerName);

        Map<String, Object> body = product("Bulb " + run);
        MvcResult created = mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String id = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

        Map<String, Object> renamed = product("Bulb " + run);
        renamed.put("name", "Renamed Bulb " + run);
        renamed.put("retailPrice", "25.00");
        mvc.perform(session.authorise(put("/api/products/" + id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(renamed)))
                .andExpect(status().isOk());

        mvc.perform(session.authorise(get("/api/audit").param("action", "PRODUCT_UPDATED")))
                .andExpect(status().isOk())
                // "name: Bulb X → Renamed Bulb X", derived from the snapshots
                // rather than stored as prose at write time.
                .andExpect(jsonPath("$[?(@.details =~ /.*Renamed Bulb " + run + ".*/)]").exists())
                .andExpect(jsonPath("$[?(@.outletName == 'Audit Branch " + run + "')]").exists());
    }

    @Test
    @DisplayName("filters by action so a search is not a scroll — FR-AUDIT")
    void filtersByAction() throws Exception {
        Session session = signIn(ownerName);

        mvc.perform(session.authorise(get("/api/audit")
                        .param("action", "AUTH_SIGN_IN").param("limit", "500")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.action != 'AUTH_SIGN_IN')]").doesNotExist());
    }

    // --- helpers -----------------------------------------------------------

    private Map<String, Object> product(String name) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", "Lighting & Lamps");
        body.put("brand", "Philips");
        body.put("baseUnit", "pcs");
        body.put("retailPrice", "20.00");
        body.put("tradePrice", "18.00");
        body.put("floorPrice", "15.00");
        return body;
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
