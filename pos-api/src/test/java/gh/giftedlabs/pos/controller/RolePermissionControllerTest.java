package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.service.LoginAttemptService;
import gh.giftedlabs.pos.service.RolePermissionService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
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

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Editing what a role may do — FR-USER-02, BR-16.
 *
 * <p>The behaviour this exists for: an owner who is away should be able to let a
 * senior cashier approve something, for every cashier at once, without editing
 * six accounts by hand — and see it take effect without anybody signing out.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Role permissions")
class RolePermissionControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired RolePermissionService roleGrants;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String cashierName;

    @BeforeEach
    void seed() {
        String run = UUID.randomUUID().toString().substring(0, 5).toUpperCase();
        UUID outletId = outlets.save(new Outlet("R" + run.substring(0, 4), "Role Branch " + run)).getId();

        ownerName = account("owner-" + run.toLowerCase(), Role.OWNER, outletId);
        cashierName = account("cashier-" + run.toLowerCase(), Role.CASHIER, outletId);
    }

    @AfterEach
    void restoreDefaults() {
        // The grants are global to the instance, so a test that widened the
        // cashier role would otherwise change what every later test sees.
        roleGrants.resetToDefaults(Role.CASHIER, null, "127.0.0.1");
    }

    private String account(String username, Role role, UUID outletId) {
        User user = new User(username, "Test " + role.key(), passwords.encode(PASSWORD));
        user.assignRole(role);
        user.assignOutlet(outletId);
        users.save(user);
        loginAttempts.recordSuccess(username);
        return username;
    }

    @Test
    @DisplayName("granting a permission to a role reaches everybody who holds it")
    void grantingWidensTheRole() throws Exception {
        Session cashier = signIn(cashierName);

        // A cashier cannot read expenses by default.
        mvc.perform(cashier.authorise(get("/api/expenses")))
                .andExpect(status().isForbidden());

        Session owner = signIn(ownerName);
        List<String> widened = new ArrayList<>(
                roleGrants.grantedTo(Role.CASHIER).stream().map(Permission::code).toList());
        widened.add(Permission.Codes.EXPENSE_VIEW);

        mvc.perform(owner.authorise(put("/api/roles/cashier/permissions"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("permissions", widened))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cashier").value(
                        org.hamcrest.Matchers.hasItem(Permission.Codes.EXPENSE_VIEW)));

        // The same session, no sign-out. This is the whole point: an owner who
        // grants something while staff are working should not have to send
        // everybody back to the sign-in screen.
        mvc.perform(cashier.authorise(get("/api/expenses")))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("taking one away closes it again, for everybody")
    void revokingNarrowsTheRole() throws Exception {
        Session owner = signIn(ownerName);
        Session cashier = signIn(cashierName);

        // A cashier may sell by default.
        List<String> narrowed = roleGrants.grantedTo(Role.CASHIER).stream()
                .map(Permission::code)
                .filter(code -> !code.equals(Permission.Codes.STOCK_VIEW))
                .toList();

        mvc.perform(owner.authorise(put("/api/roles/cashier/permissions"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("permissions", narrowed))))
                .andExpect(status().isOk());

        // Replace, not merge — otherwise a right could be given and never taken
        // back, which is the half of the feature nobody notices until they need it.
        mvc.perform(cashier.authorise(get("/api/stock/movements")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a role can be put back to what the system ships with")
    void resetRestoresDefaults() throws Exception {
        Session owner = signIn(ownerName);

        mvc.perform(owner.authorise(put("/api/roles/cashier/permissions"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("permissions", List.of()))))
                .andExpect(status().isOk());
        assertTrue(roleGrants.grantedTo(Role.CASHIER).isEmpty());

        mvc.perform(owner.authorise(post("/api/roles/cashier/permissions/reset")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cashier").value(
                        org.hamcrest.Matchers.hasItem(Permission.Codes.POS_SELL)));

        assertEquals(Role.CASHIER.baseline(), roleGrants.grantedTo(Role.CASHIER),
                "reset must restore exactly what the system ships with");
    }

    @Test
    @DisplayName("only user.manage may change what a role grants")
    void needsUserManage() throws Exception {
        mvc.perform(signIn(cashierName).authorise(put("/api/roles/cashier/permissions"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("permissions", List.of()))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("an unknown role or permission is refused rather than half-applied")
    void refusesNonsense() throws Exception {
        Session owner = signIn(ownerName);

        mvc.perform(owner.authorise(put("/api/roles/wizard/permissions"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("permissions", List.of()))))
                .andExpect(status().isNotFound());

        mvc.perform(owner.authorise(put("/api/roles/cashier/permissions"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("permissions", List.of("pos.sell", "not.a.permission")))))
                .andExpect(status().isBadRequest());

        // Refused whole: pos.sell must not have been applied on the way past.
        assertTrue(roleGrants.grantedTo(Role.CASHIER).size() > 1,
                "a rejected request must not have partly applied");
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
