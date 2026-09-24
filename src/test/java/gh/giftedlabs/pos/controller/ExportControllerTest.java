package gh.giftedlabs.pos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.service.LoginAttemptService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * FR-SET-08 · FR-AUDIT-02: the client's data, on request, and recorded.
 *
 * <p>The contract term is "data export of all business data". The per-screen
 * CSV buttons wrote out whatever the browser had loaded, which is a different
 * promise; this is the one that was missing entirely.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Data export HTTP contract")
class ExportControllerTest {

    private static final String PASSWORD = "Str0ng!Passw0rd";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;
    @Autowired LoginAttemptService loginAttempts;

    private String run;
    private String ownerName;
    private String cashierName;

    @BeforeEach
    void setUp() {
        run = UUID.randomUUID().toString().substring(0, 6).toUpperCase();

        ownerName = "exp-owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Export Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        users.save(owner);
        loginAttempts.recordSuccess(ownerName);

        cashierName = "exp-cashier-" + run.toLowerCase();
        User cashier = new User(cashierName, "Export Cashier", passwords.encode(PASSWORD));
        cashier.assignRole(Role.CASHIER);
        users.save(cashier);
        loginAttempts.recordSuccess(cashierName);
    }

    @Test
    @DisplayName("the JSON archive carries every business table — FR-SET-08")
    void jsonCarriesEveryTable() throws Exception {
        MvcResult result = exported(signIn(ownerName), "JSON");
        assertTrue(result.getResponse().getHeader("Content-Disposition").contains(".json"),
                result.getResponse().getHeader("Content-Disposition"));

        var body = json.readTree(result.getResponse().getContentAsString());
        var tables = body.get("tables");

        assertNotNull(body.get("exportedAt"), "an archive should say when it was taken");
        // Read from information_schema rather than a hand-kept list, so a table
        // added later is in the archive without anyone remembering to add it.
        for (String expected : List.of("sale", "sale_item", "payment", "product", "customer",
                "app_user", "outlet", "expense", "audit_log", "stock_level")) {
            assertTrue(tables.has(expected), "the archive is missing " + expected + ": " + tables.toString().substring(0, Math.min(400, tables.toString().length())));
        }
    }

    @Test
    @DisplayName("live password-reset tokens are not in it")
    void resetTokensAreExcluded() throws Exception {
        MvcResult result = exported(signIn(ownerName), "JSON");
        var tables = json.readTree(result.getResponse().getContentAsString()).get("tables");
        // Bearer credentials with a short life. A copy in an export file
        // outlives the reset it was issued for.
        assertFalse(tables.has("password_reset_token"),
                "reset tokens should never leave in an export");
        assertFalse(tables.has("flyway_schema_history"),
                "the schema history describes the software, not the business");
    }

    @Test
    @DisplayName("the accounting archive is a zip of readable CSV — FR-SET-08")
    void csvArchiveIsAZipOfCsv() throws Exception {
        MvcResult result = exported(signIn(ownerName), "CSV");
        assertTrue(result.getResponse().getHeader("Content-Disposition").contains(".zip"),
                result.getResponse().getHeader("Content-Disposition"));

        List<String> entries = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            var entry = zip.getNextEntry();
            while (entry != null) {
                entries.add(entry.getName());
                entry = zip.getNextEntry();
            }
        }

        assertTrue(entries.contains("sale.csv"), entries.toString());
        assertTrue(entries.contains("payment.csv"), entries.toString());
        assertTrue(entries.contains("expense.csv"), entries.toString());
    }

    @Test
    @DisplayName("a cashier cannot export the business — FR-SET-08")
    void cashierIsRefused() throws Exception {
        // Every price, every cost, every customer's phone number and every
        // staff record in one file.
        mvc.perform(signIn(cashierName).authorise(get("/api/export")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("an unknown format is refused rather than guessed at")
    void unknownFormatIsRefused() throws Exception {
        mvc.perform(signIn(ownerName).authorise(get("/api/export").param("format", "pdf")))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the export is recorded against whoever asked for it — FR-AUDIT-02")
    void exportIsAudited() throws Exception {
        Session session = signIn(ownerName);
        exported(session, "JSON");

        MvcResult log = mvc.perform(session.authorise(get("/api/audit")
                        .param("action", "DATA_EXPORTED")))
                .andExpect(status().isOk()).andReturn();

        String body = log.getResponse().getContentAsString();
        assertTrue(body.contains("DATA_EXPORTED"),
                "the export should be in the audit log: " + body);
    }

    /**
     * The export streams, so MockMvc hands back an async result and the body is
     * only written on the dispatch. Asserting on the first result reads an
     * empty response and says the archive is empty — which is what it did.
     */
    private MvcResult exported(Session session, String format) throws Exception {
        MvcResult started = mvc.perform(session.authorise(get("/api/export").param("format", format)))
                .andExpect(request().asyncStarted())
                .andReturn();
        return mvc.perform(asyncDispatch(started)).andExpect(status().isOk()).andReturn();
    }

    // --- helpers ------------------------------------------------------------

    private Session signIn(String identifier) throws Exception {
        MockHttpSession http = new MockHttpSession();
        MvcResult csrf = mvc.perform(get("/api/auth/csrf").session(http))
                .andExpect(status().isOk()).andReturn();
        String token = json.readTree(csrf.getResponse().getContentAsString()).get("token").asText();

        MvcResult signedIn = mvc.perform(post("/api/auth/sign-in").session(http)
                        .header("X-XSRF-TOKEN", token).cookie(new Cookie("XSRF-TOKEN", token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("identifier", identifier, "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn();

        return new Session((MockHttpSession) signedIn.getRequest().getSession(false), token);
    }

    private record Session(MockHttpSession http, String csrfToken) {
        MockHttpServletRequestBuilder authorise(MockHttpServletRequestBuilder builder) {
            return builder.session(http)
                    .header("X-XSRF-TOKEN", csrfToken)
                    .cookie(new Cookie("XSRF-TOKEN", csrfToken));
        }
    }
}
