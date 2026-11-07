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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * NFR-1: the reports still answer against a year of trading.
 *
 * <p>Every other report test runs against a handful of rows, which proves the
 * arithmetic and nothing about the plan. A shop that has been open twelve months
 * is the first time these queries meet a table big enough to choose a different
 * one — and the owner opening the year-to-date summary is exactly when a missing
 * index turns into a minute of waiting.
 *
 * <p>The budget is two seconds. A year-to-date report is something the owner asks
 * for deliberately, not something the counter waits on to sell, so it is a
 * different order of patience from NFR-1's 300 ms catalogue search. What matters
 * is that it is bounded and measured rather than assumed.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Reports against a year of sales — NFR-1")
class ReportPerformanceTest {

    private static final String PASSWORD = "Counter-Pass-123";

    /** Roughly a mid-sized hardware shop: forty receipts a day, every day. */
    private static final int SALES = 14_600;
    private static final int LINES_PER_SALE = 3;
    private static final long BUDGET_MS = 2_000;

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired OutletRepository outlets;
    @Autowired LoginAttemptService loginAttempts;
    @Autowired JdbcTemplate jdbc;
    @Autowired @Qualifier("passwordEncoder") PasswordEncoder passwords;

    private String ownerName;
    private String run;
    private UUID outletId;
    private LocalDate from;
    private LocalDate to;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        outletId = outlets.save(new Outlet("Y" + run.substring(0, 4), "Year Branch " + run)).getId();

        ownerName = "owner-" + run.toLowerCase();
        User owner = new User(ownerName, "Year Owner", passwords.encode(PASSWORD));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        UUID ownerId = users.save(owner).getId();
        loginAttempts.recordSuccess(ownerName);

        UUID terminalId = UUID.randomUUID();
        jdbc.update("""
                insert into terminal (id, outlet_id, code, name, seq_block_start, seq_block_end,
                                      seq_current)
                values (?, ?, '01', 'Counter 1', 1, 1000000, 1)
                """, terminalId, outletId);

        UUID productId = UUID.randomUUID();
        jdbc.update("""
                insert into product (id, sku, name, base_unit, retail_price, trade_price, floor_price)
                values (?, ?, ?, 'pc', 25, 22, 20)
                """, productId, "YR-" + run, "Year fixture " + run);

        to = LocalDate.now();
        from = to.minusDays(365);

        // Written straight to the tables rather than through the selling path:
        // 14,600 sales over HTTP would take longer than the suite allows, and what
        // is being measured is how the reports read, not how the till writes.
        List<Object[]> sales = new ArrayList<>(SALES);
        List<Object[]> items = new ArrayList<>(SALES * LINES_PER_SALE);

        for (int i = 0; i < SALES; i++) {
            UUID saleId = UUID.randomUUID();
            int dayOffset = i % 365;
            long total = 2500L + (i % 40) * 125L;

            sales.add(new Object[]{saleId, "YR-01-" + run + "-" + i, outletId, terminalId, ownerId,
                    total, total, dayOffset});

            for (int line = 0; line < LINES_PER_SALE; line++) {
                items.add(new Object[]{UUID.randomUUID(), saleId, productId,
                        total / LINES_PER_SALE, 1500L});
            }
        }

        jdbc.batchUpdate("""
                insert into sale (id, receipt_number, outlet_id, terminal_id, cashier_id,
                                  subtotal, discount_total, total, change_due, status, created_at)
                values (?, ?, ?, ?, ?, ?, 0, ?, 0, 'COMPLETED', now() - (? || ' days')::interval)
                """, sales);

        jdbc.batchUpdate("""
                insert into sale_item (id, sale_id, product_id, selected_unit, conversion_factor,
                                       quantity, quantity_base, unit_price, discount, line_total,
                                       frozen_cost_price)
                values (?, ?, ?, 'pc', 1, 1, 1, 25, 0, ?, ?)
                """, items);

        // Reports are planned against statistics, and a bulk insert leaves none.
        // Without this the plan under test is not the plan the shop will get.
        jdbc.execute("analyze sale");
        jdbc.execute("analyze sale_item");
    }

    @Test
    @DisplayName("summary, breakdown, series, P&L and the dashboard all answer inside the budget")
    void reportsAnswerAgainstAYearOfTrading() throws Exception {
        Session session = signIn(ownerName);

        // The endpoints take instants, not dates: a report boundary is a moment,
        // because a shop that closes at eight sells until eight.
        String range = "?from=%s&to=%s&outletId=%s".formatted(
                from.atStartOfDay(ZoneOffset.UTC).toInstant(),
                to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant(),
                outletId);

        measure(session, "summary", "/api/reports/summary" + range);
        measure(session, "profit-and-loss", "/api/reports/profit-and-loss" + range);
        measure(session, "breakdown", "/api/reports/breakdown" + range + "&by=category");
        measure(session, "ranking", "/api/reports/ranking" + range + "&direction=BEST&limit=20");
        measure(session, "series", "/api/reports/series" + range + "&bucket=DAY");
        measure(session, "dashboard", "/api/reports/dashboard" + range);
    }

    private void measure(Session session, String name, String url) throws Exception {
        // Once to warm the plan cache, then the one that counts. The owner's
        // second look at a report is the ordinary case; the first is startup.
        mvc.perform(session.authorise(get(url))).andExpect(status().isOk());

        long started = System.nanoTime();
        mvc.perform(session.authorise(get(url))).andExpect(status().isOk());
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);

        System.out.printf("NFR-1 · %-16s %,d sales over a year: %d ms of %d%n",
                name, SALES, elapsedMs, BUDGET_MS);
        assertTrue(elapsedMs < BUDGET_MS,
                "%s took %d ms against a year of sales".formatted(name, elapsedMs));
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
                        .content(json.writeValueAsString(
                                Map.of("identifier", identifier, "password", PASSWORD))))
                .andExpect(status().isOk()).andReturn();

        return new Session((MockHttpSession) signedIn.getRequest().getSession(false), token);
    }
}
