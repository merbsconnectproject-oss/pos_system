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
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Catalogue setup — FR-PROD-05, FR-UOM-01.
 *
 * <p>The screen that manages the categories, brands and units every product
 * form picks from. Until now those were hard-coded arrays in the frontend and
 * every edit died on refresh.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Catalogue setup HTTP contract")
class CatalogueListControllerTest {

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

    @BeforeEach
    void seedStaff() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        UUID outletId = outlets.save(new Outlet("L" + run.substring(0, 5), "List Branch " + run)).getId();

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
    @DisplayName("the seeded lists")
    class Seeded {

        @Test
        @DisplayName("carry what the frontend used to hard-code — FR-PROD-05, FR-UOM-01")
        void carryTheFormerConstants() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(get("/api/catalogue/categories")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.name == 'Cables & Wires')]").exists())
                    .andExpect(jsonPath("$[?(@.name == 'Lighting & Lamps')]").exists());

            mvc.perform(session.authorise(get("/api/catalogue/units")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.name == 'm')]").exists())
                    .andExpect(jsonPath("$[?(@.name == 'pcs')]").exists());
        }

        @Test
        @DisplayName("are readable by a cashier, whose product form needs them")
        void areReadableByACashier() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(get("/api/catalogue/categories")))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("cannot be changed by a cashier — NFR-9")
        void cannotBeChangedByACashier() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(post("/api/catalogue/brands"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("name", "Sneaky " + run))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }

        @Test
        @DisplayName("a list that does not exist is a 404, not a crash")
        void unknownListIs404() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(get("/api/catalogue/colours")))
                    .andExpect(status().isNotFound());
        }
    }

    @Nested
    @DisplayName("managing a list")
    class Managing {

        @Test
        @DisplayName("adds an entry and persists it — FR-PROD-05")
        void addsAnEntry() throws Exception {
            Session session = signIn(ownerName);
            String name = "Adhesives " + run;

            mvc.perform(session.authorise(post("/api/catalogue/categories"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("name", name))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.name").value(name))
                    .andExpect(jsonPath("$.inUse").value(0));

            mvc.perform(session.authorise(get("/api/catalogue/categories")))
                    .andExpect(jsonPath("$[?(@.name == '" + name + "')]").exists());
        }

        @Test
        @DisplayName("refuses a name that differs only in case — one list, one entry")
        void refusesACaseVariant() throws Exception {
            Session session = signIn(ownerName);
            String name = "Grommets " + run;
            add(session, "brands", name);

            mvc.perform(session.authorise(post("/api/catalogue/brands"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("name", name.toLowerCase()))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("LIST_NAME_TAKEN"));
        }

        @Test
        @DisplayName("renaming a category carries the products with it — the point of the table")
        void renamingACategoryKeepsProducts() throws Exception {
            Session session = signIn(ownerName);
            String original = "Trunking " + run;
            String id = add(session, "categories", original);

            createProduct(session, "Conduit " + run, original, "pcs");

            mvc.perform(session.authorise(put("/api/catalogue/categories/" + id))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("name", "Conduits " + run))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Conduits " + run))
                    .andExpect(jsonPath("$.inUse").value(1));

            // The product followed the rename without being touched, because it
            // points at the row rather than carrying the string.
            mvc.perform(session.authorise(get("/api/products").param("q", "Conduit " + run)))
                    .andExpect(jsonPath("$.content[0].category").value("Conduits " + run));
        }

        @Test
        @DisplayName("renaming a unit rewrites the products that measure in it — FR-UOM-01")
        void renamingAUnitRewritesProducts() throws Exception {
            Session session = signIn(ownerName);
            String original = "drum" + run;
            String id = add(session, "units", original);

            createProduct(session, "Rope " + run, "Cables & Wires", original);

            mvc.perform(session.authorise(put("/api/catalogue/units/" + id))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("name", "reel" + run))))
                    .andExpect(status().isOk());

            // A base unit is stored on the product as a string, so unlike a
            // category it has to be carried across explicitly.
            mvc.perform(session.authorise(get("/api/products").param("q", "Rope " + run)))
                    .andExpect(jsonPath("$.content[0].baseUnit").value("reel" + run));
        }

        @Test
        @DisplayName("retires an unused entry — BR-17, not a delete")
        void retiresAnUnusedEntry() throws Exception {
            Session session = signIn(ownerName);
            String id = add(session, "brands", "Obsolete " + run);

            mvc.perform(session.authorise(post("/api/catalogue/brands/" + id + "/active?value=false")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.active").value(false));

            mvc.perform(session.authorise(get("/api/catalogue/brands")))
                    .andExpect(jsonPath("$[?(@.name == 'Obsolete " + run + "')]").doesNotExist());
            mvc.perform(session.authorise(get("/api/catalogue/brands").param("includeInactive", "true")))
                    .andExpect(jsonPath("$[?(@.name == 'Obsolete " + run + "')]").exists());
        }

        @Test
        @DisplayName("refuses to retire an entry products still use, and says how many")
        void refusesToRetireSomethingInUse() throws Exception {
            Session session = signIn(ownerName);
            String name = "Busbar " + run;
            String id = add(session, "categories", name);
            createProduct(session, "Bar " + run, name, "pcs");

            mvc.perform(session.authorise(post("/api/catalogue/categories/" + id + "/active?value=false")))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("LIST_ENTRY_IN_USE"))
                    .andExpect(jsonPath("$.details.inUse").value(1));
        }
    }

    // --- helpers -----------------------------------------------------------

    private String add(Session session, String list, String name) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/catalogue/" + list))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("name", name))))
                .andExpect(status().isCreated())
                .andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private void createProduct(Session session, String name, String category, String baseUnit) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("category", category);
        body.put("brand", "Generic");
        body.put("baseUnit", baseUnit);
        body.put("retailPrice", "10.00");
        body.put("tradePrice", "9.00");
        body.put("floorPrice", "8.00");

        mvc.perform(session.authorise(post("/api/products"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated());
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
