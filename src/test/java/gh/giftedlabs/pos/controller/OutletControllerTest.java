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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Branches over HTTP — FR-OUT-02, FR-OUT-05, FR-OUT-06, BR-6, BR-17.
 *
 * <p>Carries the DELIVERY-PLAN week-1 exit criterion: <em>a cashier signs in
 * against the API and is refused a manager-only endpoint by the server, not the
 * UI</em>. Until this feature there was no ordinary permission-guarded endpoint
 * to be refused from, so the criterion could not be demonstrated at all.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Outlets HTTP contract")
class OutletControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String cashierName;
    private UUID homeOutletId;
    private UUID otherOutletId;

    @BeforeEach
    void seedTwoBranchesAndTwoStaff() {
        String run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        // Six characters, the most BR-6 allows. Three collided once enough
        // test classes shared one container and the codes ran out of room.
        homeOutletId = outlets.save(branch("H" + run.substring(0, 5), "Home Branch " + run)).getId();
        otherOutletId = outlets.save(branch("O" + run.substring(0, 5), "Other Branch " + run)).getId();

        ownerName = "owner-" + run.toLowerCase();
        cashierName = "cashier-" + run.toLowerCase();

        // The owner holds settings.general and outlet.view_all; the cashier holds
        // neither, and is assigned to one branch only.
        users.save(staff(ownerName, Role.OWNER, homeOutletId, otherOutletId));
        users.save(staff(cashierName, Role.CASHIER, homeOutletId));

        loginAttempts.recordSuccess(ownerName);
        loginAttempts.recordSuccess(cashierName);
    }

    private Outlet branch(String code, String name) {
        Outlet outlet = new Outlet(code, name);
        outlet.setTown("Accra");
        return outlet;
    }

    private User staff(String username, Role role, UUID... assigned) {
        User user = new User(username, "Test " + username, passwords.encode(PASSWORD));
        user.assignRole(role);
        for (UUID outletId : assigned) user.assignOutlet(outletId);
        return user;
    }

    @Nested
    @DisplayName("a new branch can trade")
    class ReadyToTrade {

        @Test
        @DisplayName("is created with a till, so its first sale can be numbered — BR-6")
        void comesWithATill() throws Exception {
            Session session = signIn(ownerName);
            String code = "T" + UUID.randomUUID().toString().substring(0, 3).toUpperCase();

            MvcResult created = mvc.perform(session.authorise(post("/api/outlets"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of(
                                    "code", code,
                                    "name", "New Branch " + code,
                                    "town", "Koforidua"))))
                    .andExpect(status().isCreated()).andReturn();
            String outletId = json.readTree(created.getResponse().getContentAsString()).get("id").asText();

            // Without this the branch opens unable to sell: the first attempt
            // fails with NO_TERMINAL and nothing on the screen explains why.
            mvc.perform(session.authorise(get("/api/terminals").param("outletId", outletId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].code").value("01"));
        }
    }

    @Nested
    @DisplayName("a cashier")
    class Cashier {

        @Test
        @DisplayName("is refused branch creation by the server, not the UI — week-1 exit, FR-OUT-06")
        void cannotCreateABranch() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(post("/api/outlets"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(request("NEW", "Sneaky Branch"))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }

        @Test
        @DisplayName("is refused branch editing too — FR-OUT-06")
        void cannotEditABranch() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(put("/api/outlets/" + homeOutletId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(request("HOME", "Renamed By Cashier"))))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }

        @Test
        @DisplayName("sees only the branch they are assigned to — FR-OUT-05 acceptance")
        void seesOnlyTheirOwnBranch() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(get("/api/outlets")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id=='" + homeOutletId + "')]").exists())
                    .andExpect(jsonPath("$[?(@.id=='" + otherOutletId + "')]").doesNotExist());
        }

        @Test
        @DisplayName("cannot read another branch by guessing its id — FR-OUT-05")
        void cannotReadAnotherBranchDirectly() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(get("/api/outlets/" + otherOutletId)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("OUTLET_NOT_PERMITTED"));
        }
    }

    @Nested
    @DisplayName("an owner")
    class Owner {

        @Test
        @DisplayName("sees every branch — FR-OUT-05 with outlet.view_all")
        void seesEveryBranch() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(get("/api/outlets")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id=='" + homeOutletId + "')]").exists())
                    .andExpect(jsonPath("$[?(@.id=='" + otherOutletId + "')]").exists());
        }

        @Test
        @DisplayName("creates a branch and gets it back in the frontend's shape — FR-OUT-02")
        void createsABranch() throws Exception {
            Session session = signIn(ownerName);
            String code = "N" + UUID.randomUUID().toString().substring(0, 2).toUpperCase();

            Map<String, Object> body = request(code, "Third Branch");
            body.put("managerName", "Ama Serwaa");
            body.put("phone", "+233 24 888 1234");

            mvc.perform(session.authorise(post("/api/outlets"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(body)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.code").value(code))
                    .andExpect(jsonPath("$.name").value("Third Branch"))
                    .andExpect(jsonPath("$.town").value("Kumasi"))
                    .andExpect(jsonPath("$.managerName").value("Ama Serwaa"))
                    .andExpect(jsonPath("$.active").value(true));
        }

        @Test
        @DisplayName("closes a branch rather than deleting it — BR-17")
        void closesABranch() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(post("/api/outlets/" + otherOutletId + "/active?value=false")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.active").value(false));

            // Gone from the default list, still there and still readable.
            mvc.perform(session.authorise(get("/api/outlets")))
                    .andExpect(jsonPath("$[?(@.id=='" + otherOutletId + "')]").doesNotExist());
            mvc.perform(session.authorise(get("/api/outlets?includeInactive=true")))
                    .andExpect(jsonPath("$[?(@.id=='" + otherOutletId + "')]").exists());
        }
    }

    @Nested
    @DisplayName("the receipt code")
    class ReceiptCode {

        @Test
        @DisplayName("refuses a hyphen, which would print the terminal twice — BR-6")
        void refusesAHyphen() throws Exception {
            Session session = signIn(ownerName);

            mvc.perform(session.authorise(post("/api/outlets"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(request("RAD-01", "Hyphenated Branch"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details.code")
                            .value("Use 2-6 letters or digits and no hyphen, as in INC"));
        }

        @Test
        @DisplayName("refuses a code another branch already prints — BR-6")
        void refusesADuplicate() throws Exception {
            Session session = signIn(ownerName);
            String taken = outlets.findById(homeOutletId).orElseThrow().getCode();

            mvc.perform(session.authorise(post("/api/outlets"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(request(taken, "Clashing Branch"))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("OUTLET_CODE_TAKEN"));
        }

        @Test
        @DisplayName("lets a branch keep its own code when edited — BR-6")
        void allowsKeepingOwnCodeOnEdit() throws Exception {
            Session session = signIn(ownerName);
            String own = outlets.findById(homeOutletId).orElseThrow().getCode();

            mvc.perform(session.authorise(put("/api/outlets/" + homeOutletId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(request(own, "Home Branch Renamed"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Home Branch Renamed"))
                    .andExpect(jsonPath("$.code").value(own));
        }
    }

    // --- helpers -----------------------------------------------------------

    private Map<String, Object> request(String code, String name) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("name", name);
        body.put("town", "Kumasi");
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
