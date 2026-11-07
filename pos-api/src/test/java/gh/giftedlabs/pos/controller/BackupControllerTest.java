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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * NFR-6 · FR-SET-07: backups over HTTP.
 *
 * <p>The scheduler is off here and each backup is triggered by hand, so the
 * test controls when one happens rather than racing a timer.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "pos.backup.enabled=false",
        "pos.backup.directory=target/test-backups",
})
@DisplayName("Backups HTTP contract")
class BackupControllerTest {

    private static final String PASSWORD = "Counter-Pass-123";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String run;
    private String ownerName;
    private String cashierName;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        UUID outletId = outlets.save(new Outlet("K" + run.substring(0, 5), "Backup Branch " + run)).getId();

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
    @DisplayName("taking one")
    class Taking {

        @Test
        @DisplayName("writes a real dump and records what it did — NFR-6")
        void takesABackup() throws Exception {
            Session session = signIn(ownerName);

            MvcResult result = mvc.perform(session.authorise(post("/api/backups")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.outcome").value("SUCCEEDED"))
                    .andExpect(jsonPath("$.kind").value("MANUAL"))
                    .andExpect(jsonPath("$.storedLocal").value(true))
                    // Nothing is configured off-site in this test, and the
                    // record says so rather than implying the copy is safe.
                    .andExpect(jsonPath("$.storedOffsite").value(false))
                    .andReturn();

            var body = json.readTree(result.getResponse().getContentAsString());
            String fileName = body.get("fileName").asText();
            long size = body.get("sizeBytes").asLong();

            Path file = Path.of("target/test-backups", fileName);
            org.junit.jupiter.api.Assertions.assertTrue(Files.exists(file),
                    "the dump should be on disk at " + file.toAbsolutePath());
            org.junit.jupiter.api.Assertions.assertTrue(size > 0,
                    "a zero-byte dump is not a backup");
            org.junit.jupiter.api.Assertions.assertEquals(size, Files.size(file));
        }

        @Test
        @DisplayName("the status says local-only rather than healthy without off-site — NFR-6")
        void localOnlyIsNotHealthy() throws Exception {
            Session session = signIn(ownerName);
            mvc.perform(session.authorise(post("/api/backups"))).andExpect(status().isOk());

            mvc.perform(session.authorise(get("/api/backups")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.offsiteConfigured").value(false))
                    // A copy beside the database survives a mistake, not the
                    // disk — and the disk is what this exists for.
                    .andExpect(jsonPath("$.healthy").value(false))
                    .andExpect(jsonPath("$.summary").value(
                            org.hamcrest.Matchers.containsString("this machine only")))
                    // The timer is off in this test, and the summary says so as
                    // well as where the copies are. It used to say only the
                    // first, which left an owner reading "switched off" with no
                    // idea that the one copy they had was on the failing disk.
                    .andExpect(jsonPath("$.summary").value(
                            org.hamcrest.Matchers.containsString("Scheduled backups are switched off")))
                    .andExpect(jsonPath("$.enabled").value(false))
                    .andExpect(jsonPath("$.lastSuccess.outcome").value("SUCCEEDED"))
                    .andExpect(jsonPath("$.lastOffsiteSuccess").doesNotExist());
        }

        @Test
        @DisplayName("reports the live recovery point, not the configured one — NFR-7")
        void reportsTheRecoveryPoint() throws Exception {
            Session session = signIn(ownerName);
            mvc.perform(session.authorise(post("/api/backups"))).andExpect(status().isOk());

            mvc.perform(session.authorise(get("/api/backups")))
                    .andExpect(jsonPath("$.recoveryPointMinutes").value(0))
                    .andExpect(jsonPath("$.retentionDays").value(30));
        }

        @Test
        @DisplayName("history is newest first, and every attempt is in it")
        void historyIsKept() throws Exception {
            Session session = signIn(ownerName);
            mvc.perform(session.authorise(post("/api/backups"))).andExpect(status().isOk());
            mvc.perform(session.authorise(post("/api/backups"))).andExpect(status().isOk());

            mvc.perform(session.authorise(get("/api/backups").param("limit", "50")))
                    .andExpect(jsonPath("$.history.length()")
                            .value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)));
        }
    }

    @Nested
    @DisplayName("who may see it")
    class Access {

        @Test
        @DisplayName("a cashier cannot read the backup status or take one")
        void needsSettingsGeneral() throws Exception {
            Session session = signIn(cashierName);

            mvc.perform(session.authorise(get("/api/backups")))
                    .andExpect(status().isForbidden());
            mvc.perform(session.authorise(post("/api/backups")))
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
