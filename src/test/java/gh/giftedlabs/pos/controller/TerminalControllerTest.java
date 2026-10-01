package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.JsonNode;
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

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tills and their receipt-number blocks — BR-6, FR-RCPT-08.
 *
 * <p>BR-6 is the rule with legal weight: receipt numbers are per outlet, gapless
 * and never reused. Each till holds a pre-allocated block so it can keep numbering
 * while the line is down, and the blocks must never overlap — two tills issuing
 * {@code INC-01-000042} is a shop with two different sales on one receipt number.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Terminals HTTP contract")
class TerminalControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String run;
    private UUID outletId;
    private String managerName;
    private String cashierName;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        outletId = outlets.save(new Outlet("T" + run.substring(0, 5), "Till Branch " + run)).getId();

        // settings.terminal belongs to the manager, not the cashier.
        managerName = account("manager-" + run.toLowerCase(), Role.MANAGER);
        cashierName = account("cashier-" + run.toLowerCase(), Role.CASHIER);
    }

    private String account(String username, Role role) {
        User user = new User(username, "Test " + role.key(), passwords.encode(PASSWORD));
        user.assignRole(role);
        user.assignOutlet(outletId);
        users.save(user);
        loginAttempts.recordSuccess(username);
        return username;
    }

    private Map<String, Object> till(String code, String name) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outletId", outletId.toString());
        body.put("code", code);
        body.put("name", name);
        return body;
    }

    @Nested
    @DisplayName("registering a till")
    class Registering {

        @Test
        @DisplayName("a new till gets a block of receipt numbers to itself — BR-6")
        void newTillGetsABlock() throws Exception {
            Session session = signIn(managerName);

            mvc.perform(session.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("02", "Counter 2"))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.code").value("02"))
                    .andExpect(jsonPath("$.blockStart").value(org.hamcrest.Matchers.greaterThan(0)))
                    .andExpect(jsonPath("$.remaining").value(org.hamcrest.Matchers.greaterThan(0)));
        }

        @Test
        @DisplayName("two tills at one branch never share a number — BR-6")
        void blocksDoNotOverlap() throws Exception {
            Session session = signIn(managerName);

            long[] starts = new long[2];
            long[] ends = new long[2];
            String[] codes = {"A1", "A2"};

            for (int i = 0; i < codes.length; i++) {
                MvcResult made = mvc.perform(session.authorise(post("/api/terminals"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json.writeValueAsString(till(codes[i], "Counter " + codes[i]))))
                        .andExpect(status().isCreated()).andReturn();
                JsonNode view = json.readTree(made.getResponse().getContentAsString());
                starts[i] = view.get("blockStart").asLong();
                ends[i] = view.get("blockEnd").asLong();
            }

            // Two tills issuing the same number is a shop with two different
            // sales on one receipt.
            assertTrue(starts[1] > ends[0],
                    "the second block must start after the first ends: %d..%d then %d..%d"
                            .formatted(starts[0], ends[0], starts[1], ends[1]));
        }

        @Test
        @DisplayName("a code already used at this branch is refused by name, not by a 500 — BR-6")
        void duplicateCodeIsAConflict() throws Exception {
            Session session = signIn(managerName);

            mvc.perform(session.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("D1", "Counter D1"))))
                    .andExpect(status().isCreated());

            // `terminal_code_unique_per_outlet` would refuse this regardless.
            // What is asserted is the answer: a conflict that names the code,
            // rather than the constraint arriving as the generic 500 that tells
            // a shopkeeper to fetch a manager for what is a typo they can fix.
            mvc.perform(session.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("D1", "Another counter"))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TERMINAL_CODE_TAKEN"))
                    .andExpect(jsonPath("$.details.code").value("D1"));
        }

        @Test
        @DisplayName("case is not a way around the one code per till rule")
        void duplicateCodeIgnoresCase() throws Exception {
            Session session = signIn(managerName);

            mvc.perform(session.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("e1", "Counter E1"))))
                    .andExpect(status().isCreated());

            // Stored uppercased, so "e1" and "E1" are one till on the receipt.
            mvc.perform(session.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("E1", "Counter E1 again"))))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("the code becomes part of the receipt number, so it is constrained")
        void codeIsValidated() throws Exception {
            Session session = signIn(managerName);

            // "COUNTER-ONE" in INC-COUNTER-ONE-000001 is not a receipt number
            // anybody can read down a phone.
            mvc.perform(session.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("COUNTER-ONE", "Too long"))))
                    .andExpect(status().isBadRequest());

            mvc.perform(session.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("", "Empty"))))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("a lowercase code is stored as it will print")
        void codeIsUppercased() throws Exception {
            mvc.perform(signIn(managerName).authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("b7", "Counter b7"))))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.code").value("B7"));
        }
    }

    @Nested
    @DisplayName("running out of numbers")
    class Blocks {

        @Test
        @DisplayName("a fresh block continues past every number already allocated — BR-6")
        void freshBlockDoesNotReuse() throws Exception {
            Session session = signIn(managerName);

            MvcResult made = mvc.perform(session.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("C1", "Counter C1"))))
                    .andExpect(status().isCreated()).andReturn();
            JsonNode first = json.readTree(made.getResponse().getContentAsString());
            String id = first.get("id").asText();
            long firstEnd = first.get("blockEnd").asLong();

            MvcResult reissued = mvc.perform(session.authorise(post("/api/terminals/" + id + "/block")))
                    .andExpect(status().isOk()).andReturn();
            long secondStart = json.readTree(reissued.getResponse().getContentAsString())
                    .get("blockStart").asLong();

            // "Never reused" is the half of BR-6 that only shows up as a
            // duplicate receipt months later.
            assertTrue(secondStart > firstEnd,
                    "a new block must start past the old one: ends %d, next starts %d"
                            .formatted(firstEnd, secondStart));
        }

        @Test
        @DisplayName("asking for a block for a till that does not exist says so")
        void unknownTill() throws Exception {
            mvc.perform(signIn(managerName).authorise(
                            post("/api/terminals/" + UUID.randomUUID() + "/block")))
                    .andExpect(status().isNotFound());
        }
    }

    @Nested
    @DisplayName("who may configure a till")
    class Access {

        @Test
        @DisplayName("a cashier may see the tills but not create or re-block one")
        void cashierMayReadOnly() throws Exception {
            Session manager = signIn(managerName);
            mvc.perform(manager.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("D1", "Counter D1"))))
                    .andExpect(status().isCreated());

            Session cashier = signIn(cashierName);
            // A till has to be listable by whoever is selling on it.
            mvc.perform(cashier.authorise(get("/api/terminals").param("outletId", outletId.toString())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)));

            mvc.perform(cashier.authorise(post("/api/terminals"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(till("D2", "Counter D2"))))
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
