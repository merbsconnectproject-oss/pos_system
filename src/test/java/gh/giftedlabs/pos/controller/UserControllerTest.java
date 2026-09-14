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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Staff, roles and permissions over HTTP — FR-USER, BR-16.
 *
 * <p>The rule worth proving hardest is BR-16: an owner who can quietly grant
 * themselves something has made the whole permission model advisory.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Users and permissions HTTP contract")
class UserControllerTest {

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
    private UUID ownerId;
    private UUID cashierId;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("M" + run.substring(0, 5), "Staff Branch " + run)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Test Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        ownerId = users.save(owner).getId();

        cashierName = "cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Test Cashier", passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        cashier.assignOutlet(outletId);
        cashierId = users.save(cashier).getId();

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(cashierName);
    }

    @Nested
    @DisplayName("nobody edits their own rights")
    class BR16 {

        @Test
        @DisplayName("an owner cannot grant themselves a permission — BR-16, FR-USER-05")
        void cannotGrantThemselves() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(
                            put("/api/users/" + ownerId + "/permissions/stock.oversell")
                                    .param("granted", "true")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }

        @Test
        @DisplayName("nor change their own roles — BR-16")
        void cannotChangeTheirOwnRoles() throws Exception {
            Session session = signIn(ownerName);

            Map<String, Object> body = account(ownerName, "Test Owner");
            body.put("roles", List.of("cashier"));

            mvc.perform(session.authorise(put("/api/users/" + ownerId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("but may still edit their own name and phone — BR-16 is about privileges")
        void mayEditTheirOwnProfile() throws Exception {
            Session session = signIn(ownerName);

            Map<String, Object> body = account(ownerName, "Test Owner Renamed");
            body.put("phone", "+233 24 111 2222");

            mvc.perform(session.authorise(put("/api/users/" + ownerId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.fullName").value("Test Owner Renamed"));
        }

        @Test
        @DisplayName("nor deactivate their own account")
        void cannotDeactivateThemselves() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(post("/api/users/" + ownerId + "/active?value=false")))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("individual permissions")
    class Overrides {

        @Test
        @DisplayName("grant one on top of a role, and the audit says who — FR-USER-03, FR-USER-08")
        void grantsOnTopOfARole() throws Exception {
            Session session = signIn(ownerName);

            // A cashier does not hold stock.oversell by role.
            mvc.perform(session.authorise(get("/api/users/" + cashierId)))
                    .andExpect(jsonPath("$.effectivePermissions[?(@ == 'stock.oversell')]").doesNotExist());

            mvc.perform(session.authorise(
                            put("/api/users/" + cashierId + "/permissions/stock.oversell")
                                    .param("granted", "true")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.effectivePermissions[?(@ == 'stock.oversell')]").exists())
                    .andExpect(jsonPath("$.overrides['stock.oversell']").value(true));

            mvc.perform(session.authorise(get("/api/audit").param("action", "USER_PERMISSION_CHANGED")))
                    .andExpect(jsonPath("$[?(@.details =~ /.*stock.oversell.*/)]").exists());
        }

        @Test
        @DisplayName("withhold one a role would have given — FR-USER-03")
        void withholdsFromARole() throws Exception {
            Session session = signIn(ownerName);

            // pos.sell comes with the cashier role.
            mvc.perform(session.authorise(get("/api/users/" + cashierId)))
                    .andExpect(jsonPath("$.effectivePermissions[?(@ == 'pos.sell')]").exists());

            mvc.perform(session.authorise(
                            put("/api/users/" + cashierId + "/permissions/pos.sell")
                                    .param("granted", "false")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.effectivePermissions[?(@ == 'pos.sell')]").doesNotExist());
        }

        @Test
        @DisplayName("clearing an override is not the same as withholding — FR-USER-03")
        void clearingReturnsToTheRole() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(
                            put("/api/users/" + cashierId + "/permissions/pos.sell").param("granted", "false")))
                    .andExpect(jsonPath("$.effectivePermissions[?(@ == 'pos.sell')]").doesNotExist());

            // No `granted` at all: back to whatever the role says.
            mvc.perform(session.authorise(put("/api/users/" + cashierId + "/permissions/pos.sell")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.effectivePermissions[?(@ == 'pos.sell')]").exists())
                    .andExpect(jsonPath("$.overrides['pos.sell']").doesNotExist());
        }

        @Test
        @DisplayName("an unknown code is refused rather than silently stored")
        void refusesAnUnknownCode() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(
                            put("/api/users/" + cashierId + "/permissions/not.a.permission")
                                    .param("granted", "true")))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("a granted permission takes effect on the next request — NFR-9")
        void takesEffectOnTheEndpoint() throws Exception {
            Session owner = signIn(ownerName);

            // A cashier cannot manage suppliers.
            Session theirs = signIn(cashierName);
            mvc.perform(theirs.authorise(post("/api/suppliers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("name", "Blocked " + run))))
                    .andExpect(status().isForbidden());

            mvc.perform(owner.authorise(
                            put("/api/users/" + cashierId + "/permissions/supplier.manage")
                                    .param("granted", "true")))
                    .andExpect(status().isOk());

            // The session carries the authorities it was given at sign-in, so
            // the new right applies from the next sign-in — which is what
            // FR-AUTH-08's immediate-revocation model implies for grants too.
            Session after = signIn(cashierName);
            mvc.perform(after.authorise(post("/api/suppliers"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("name", "Allowed " + run))))
                    .andExpect(status().isCreated());
        }
    }

    @Nested
    @DisplayName("accounts")
    class Accounts {

        @Test
        @DisplayName("are individual, and a duplicate username is refused — FR-USER-01")
        void refusesADuplicateUsername() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(post("/api/users"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(account(cashierName, "Impostor"))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("LIST_NAME_TAKEN"));
        }

        @Test
        @DisplayName("need a password when created — FR-USER-01")
        void needAPasswordOnCreate() throws Exception {
            Session session = signIn(ownerName);

            Map<String, Object> body = account("fresh-" + run.toLowerCase(), "Fresh Start");
            body.remove("password");

            mvc.perform(session.authorise(post("/api/users"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("keep their PIN when edited without one — FR-AUTH-02")
        void editingDoesNotClearThePin() throws Exception {
            Session session = signIn(ownerName);

            Map<String, Object> body = account("pinned-" + run.toLowerCase(), "Has A Pin");
            body.put("pin", "4321");
            String id = create(session, body);

            mvc.perform(session.authorise(get("/api/users/" + id)))
                    .andExpect(jsonPath("$.pinSet").value(true));

            // Saving a phone number must not silently clear it.
            Map<String, Object> edit = account("pinned-" + run.toLowerCase(), "Has A Pin");
            edit.put("phone", "+233 20 000 0000");
            mvc.perform(session.authorise(put("/api/users/" + id))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(edit)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.pinSet").value(true));
        }

        @Test
        @DisplayName("never expose a password or PIN hash — NFR-8")
        void neverExposeHashes() throws Exception {
            Session session = signIn(ownerName);

            MvcResult result = mvc.perform(session.authorise(get("/api/users/" + cashierId)))
                    .andExpect(status().isOk()).andReturn();
            String body = result.getResponse().getContentAsString();

            org.junit.jupiter.api.Assertions.assertFalse(body.contains("Hash"),
                    "a hash on the wire is an offline cracking target: " + body);
            org.junit.jupiter.api.Assertions.assertFalse(body.contains("$argon2"), body);
        }

        @Test
        @DisplayName("are deactivated, never deleted — FR-USER-07, BR-17")
        void deactivatedNotDeleted() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(post("/api/users/" + cashierId + "/active?value=false")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.active").value(false));

            mvc.perform(session.authorise(get("/api/users")))
                    .andExpect(jsonPath("$[?(@.id=='" + cashierId + "')]").doesNotExist());
            mvc.perform(session.authorise(get("/api/users").param("includeInactive", "true")))
                    .andExpect(jsonPath("$[?(@.id=='" + cashierId + "')]").exists());
        }

        @Test
        @DisplayName("a cashier cannot manage staff at all — NFR-9, FR-USER-06")
        void cashierCannotManageStaff() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(get("/api/users")))
                    .andExpect(status().isForbidden());
            mvc.perform(session.authorise(post("/api/users"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(account("sneaky-" + run.toLowerCase(), "Sneaky"))))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("the catalogue")
    class Catalogue {

        @Test
        @DisplayName("carries all 33 codes and flags the two reserved for later stages")
        void carriesEveryCode() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(get("/api/users/catalogue")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.permissions.length()").value(33))
                    .andExpect(jsonPath("$.permissions[?(@.code == 'stock.transfer')].futureStage")
                            .value(org.hamcrest.Matchers.contains(true)))
                    .andExpect(jsonPath("$.permissions[?(@.code == 'customer.credit')].futureStage")
                            .value(org.hamcrest.Matchers.contains(true)))
                    .andExpect(jsonPath("$.permissions[?(@.code == 'pos.sell')].futureStage")
                            .value(org.hamcrest.Matchers.contains(false)));
        }

        @Test
        @DisplayName("lists the four seeded roles and what each starts with — FR-USER-02")
        void listsTheRoles() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(get("/api/users/catalogue")))
                    .andExpect(jsonPath("$.roles.length()").value(4))
                    .andExpect(jsonPath("$.roles[?(@.key == 'cashier')].baseline")
                            .value(org.hamcrest.Matchers.hasSize(1)));
        }
    }

    // --- helpers -----------------------------------------------------------

    private Map<String, Object> account(String username, String fullName) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("username", username);
        body.put("fullName", fullName);
        body.put("password", PASSWORD);
        body.put("roles", List.of(username.equals(ownerName) ? "owner" : "cashier"));
        body.put("outletIds", List.of(outletId.toString()));
        return body;
    }

    private String create(Session session, Map<String, Object> body) throws Exception {
        MvcResult result = mvc.perform(session.authorise(post("/api/users"))
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
