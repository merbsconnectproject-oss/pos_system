package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.HeldSaleRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Permission;
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

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Held sales — FR-POS-14.
 *
 * <p>A held sale is a cart parked mid-transaction: a customer goes to fetch their
 * card, the next one is served, the first comes back. It is the one thing in the
 * till that is *meant* to be transient, which is exactly why it has to survive a
 * refresh — a counter PC that forgets a parked cart hands the shop a dispute.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Held sales HTTP contract")
class HeldSaleControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired HeldSaleRepository heldSales;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String run;
    private UUID outletId;
    private UUID otherOutletId;
    private String cashierName;
    private String storekeeperName;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("H" + run.substring(0, 5), "Held Branch " + run)).getId();
        otherOutletId = outlets.save(new Outlet("O" + run.substring(0, 5), "Other Branch " + run)).getId();

        cashierName = account("cashier-" + run.toLowerCase(), Role.CASHIER, outletId);
        // A storekeeper holds no pos.sell — the till is not their screen.
        storekeeperName = account("store-" + run.toLowerCase(), Role.STOREKEEPER, outletId);
    }

    private String account(String username, Role role, UUID outlet) {
        User user = new User(username, "Test " + role.key(), passwords.encode(PASSWORD));
        user.assignRole(role);
        user.assignOutlet(outlet);
        users.save(user);
        loginAttempts.recordSuccess(username);
        return username;
    }

    private Map<String, Object> cart(String label, long totalPesewas) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "2.5mm Cable");
        line.put("sku", "CBL-" + run);
        line.put("selectedUnit", "m");
        line.put("conversionFactor", "1");
        line.put("quantity", "12");
        line.put("unitPrice", "18.50");
        line.put("discount", "0");
        line.put("lineTotal", "222.00");
        line.put("frozenCostPrice", "10.00");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outletId", outletId.toString());
        body.put("label", label);
        body.put("customerName", "Yaw Mensah");
        body.put("total", totalPesewas);
        body.put("lines", List.of(line));
        return body;
    }

    @Nested
    @DisplayName("parking a cart")
    class Holding {

        @Test
        @DisplayName("a held cart survives the request that made it — FR-POS-14")
        void survivesTheRequest() throws Exception {
            Session session = signIn(cashierName);

            MvcResult held = mvc.perform(session.authorise(post("/api/held-sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(cart("Yaw — gone for card", 22_200))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.label").value("Yaw — gone for card"))
                    .andExpect(jsonPath("$.total").value(22_200))
                    .andReturn();

            String id = json.readTree(held.getResponse().getContentAsString()).get("id").asText();

            // A separate request, which is what a refresh is.
            mvc.perform(session.authorise(get("/api/held-sales").param("outletId", outletId.toString())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].id").value(id));

            assertTrue(heldSales.findById(UUID.fromString(id)).isPresent(),
                    "the cart should be in the database, not only in a response");
        }

        @Test
        @DisplayName("the whole cart comes back, not just its total")
        void carriesTheLines() throws Exception {
            Session session = signIn(cashierName);
            mvc.perform(session.authorise(post("/api/held-sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(cart("Resume me", 22_200))))
                    .andExpect(status().isCreated());

            MvcResult listed = mvc.perform(session.authorise(
                            get("/api/held-sales").param("outletId", outletId.toString())))
                    .andExpect(status().isOk()).andReturn();

            // Resuming a parked cart means putting the same items back on the
            // screen; a total alone would make the cashier ring it up again.
            String body = listed.getResponse().getContentAsString();
            assertTrue(body.contains("2.5mm Cable"), body);
            assertTrue(body.contains("18.50"), body);
        }

        @Test
        @DisplayName("an unlabelled cart still gets a name to find it by")
        void defaultsTheLabel() throws Exception {
            Session session = signIn(cashierName);
            Map<String, Object> unlabelled = cart(null, 5_000);
            unlabelled.remove("label");

            mvc.perform(session.authorise(post("/api/held-sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(unlabelled)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.label").value("Held sale"));
        }

        @Test
        @DisplayName("an empty cart is not a held sale")
        void refusesEmpty() throws Exception {
            Session session = signIn(cashierName);
            Map<String, Object> empty = cart("Nothing", 0);
            empty.put("lines", List.of());

            mvc.perform(session.authorise(post("/api/held-sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(empty)))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("resuming and clearing")
    class Clearing {

        @Test
        @DisplayName("a resumed cart is removed, so it cannot be rung up twice")
        void deleteRemovesIt() throws Exception {
            Session session = signIn(cashierName);
            MvcResult held = mvc.perform(session.authorise(post("/api/held-sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(cart("Resume", 9_900))))
                    .andExpect(status().isCreated()).andReturn();
            String id = json.readTree(held.getResponse().getContentAsString()).get("id").asText();

            mvc.perform(session.authorise(delete("/api/held-sales/" + id)))
                    .andExpect(status().isNoContent());

            mvc.perform(session.authorise(get("/api/held-sales").param("outletId", outletId.toString())))
                    .andExpect(jsonPath("$.length()").value(0));
        }

        @Test
        @DisplayName("clearing one that is already gone says so rather than pretending")
        void deleteMissing() throws Exception {
            mvc.perform(signIn(cashierName).authorise(
                            delete("/api/held-sales/" + UUID.randomUUID())))
                    .andExpect(status().isNotFound());
        }
    }

    @Nested
    @DisplayName("who may hold one")
    class Access {

        @Test
        @DisplayName("holding a cart is part of selling, so it needs pos.sell")
        void needsPosSell() throws Exception {
            Session session = signIn(storekeeperName);

            mvc.perform(session.authorise(get("/api/held-sales").param("outletId", outletId.toString())))
                    .andExpect(status().isForbidden());
            mvc.perform(session.authorise(post("/api/held-sales"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(cart("No", 100))))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a cart parked at another branch is not this till's to see")
        void scopedToTheOutlet() throws Exception {
            Session session = signIn(cashierName);

            // FR-OUT-05: a cashier is pinned to the branch they are assigned to,
            // and a parked cart belongs to the counter it was parked at.
            mvc.perform(session.authorise(get("/api/held-sales")
                            .param("outletId", otherOutletId.toString())))
                    .andExpect(status().isForbidden());
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

    private record Session(MockHttpSession http, String csrfToken) {
        MockHttpServletRequestBuilder authorise(MockHttpServletRequestBuilder builder) {
            return builder.session(http).header("X-XSRF-TOKEN", csrfToken)
                    .cookie(new Cookie("XSRF-TOKEN", csrfToken));
        }
    }
}
