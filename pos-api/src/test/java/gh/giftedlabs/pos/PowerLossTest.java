package gh.giftedlabs.pos;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * NFR-5 · FR-SYNC-07: the lights go out mid-sale.
 *
 * <p>Power cuts are routine where this runs, and "a committed sale is never lost"
 * has been asserted by reasoning — one transaction, therefore atomic — rather than
 * by evidence. Reasoning is not enough here: the same claim is false the moment
 * somebody sets {@code synchronous_commit = off} to make the till feel quicker,
 * and nothing in the suite would have noticed.
 *
 * <p>So this kills the database the way a power cut does — SIGKILL, no shutdown,
 * no flush — and then starts it again and looks. It uses its own container for the
 * obvious reason that killing the shared one would take the rest of the suite with
 * it.
 *
 * <p>What it cannot prove: that the disk itself honoured the flush. A drive that
 * lies about fsync loses data whatever Postgres does, which is why the site needs
 * a UPS regardless of this test.
 */
@DisplayName("Abrupt power loss — NFR-5")
class PowerLossTest {

    @Test
    @DisplayName("a committed sale survives the database being killed outright")
    void aCommittedSaleSurvivesTheLightsGoingOut() throws Exception {
        String image = System.getProperty("test.postgres.image", "postgres:18");

        try (PostgreSQLContainer postgres = new PostgreSQLContainer(
                DockerImageName.parse(image).asCompatibleSubstituteFor("postgres"))) {

            // Testcontainers starts Postgres with fsync off, which is sensible for
            // a test suite and fatal for this particular test: a database that
            // never flushes would lose the sale and prove nothing except that the
            // flags were off. These are the settings a real counter runs with —
            // checked against the live server, where all three are on.
            postgres.withCommand("postgres",
                    "-c", "fsync=on",
                    "-c", "synchronous_commit=on",
                    "-c", "full_page_writes=on");

            postgres.start();

            Flyway.configure()
                    .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                    .locations("classpath:db/migration")
                    .load()
                    .migrate();

            // The setting the whole requirement rests on. Off, a commit returns
            // before the write-ahead log reaches the disk, and the last few
            // seconds of trading die with the power.
            assertEquals("on", setting(postgres, "synchronous_commit"),
                    "synchronous_commit must stay on: off trades the last seconds of "
                            + "sales for speed the counter will not notice");
            assertEquals("on", setting(postgres, "fsync"));
            assertEquals("on", setting(postgres, "full_page_writes"),
                    "a torn page after a power cut is corruption, not a lost sale");

            UUID saleId = UUID.randomUUID();
            String receipt = "PWR-01-" + UUID.randomUUID().toString().substring(0, 8);
            recordASale(postgres, saleId, receipt);

            // No shutdown. No flush. The plug.
            postgres.getDockerClient().killContainerCmd(postgres.getContainerId())
                    .withSignal("KILL").exec();

            postgres.getDockerClient().startContainerCmd(postgres.getContainerId()).exec();
            jdbcUrl = rediscover(postgres);
            waitUntilAnswering(postgres);

            // Everything, or nothing. A sale whose lines survived without its
            // payment would be worse than a lost sale: the shop would be short and
            // the receipt would say otherwise.
            try (Connection connection = connect(postgres)) {
                assertEquals(1, countOf(connection,
                        "select count(*) from sale where id = '" + saleId + "'"),
                        "the committed sale did not survive the power cut");
                assertEquals(2, countOf(connection,
                        "select count(*) from sale_item where sale_id = '" + saleId + "'"),
                        "the sale survived without all of its lines");
                assertEquals(1, countOf(connection,
                        "select count(*) from payment where sale_id = '" + saleId + "'"),
                        "the sale survived without the payment that settled it");

                // BR-6: the number was issued before the lights went out, and the
                // terminal must not hand it out again.
                assertTrue(countOf(connection,
                        "select seq_current from terminal where code = '01'") > 1,
                        "the terminal's sequence rolled back, so the next sale would "
                                + "reuse a receipt number that is already printed");
            }
        }
    }

    /** One sale, its lines and its payment, in one transaction — as the till does it. */
    private void recordASale(PostgreSQLContainer postgres, UUID saleId, String receipt)
            throws Exception {
        try (Connection connection = connect(postgres)) {
            connection.setAutoCommit(false);

            UUID outletId = UUID.randomUUID();
            UUID userId = UUID.randomUUID();
            UUID terminalId = UUID.randomUUID();
            UUID productId = UUID.randomUUID();

            execute(connection, "insert into outlet (id, code, name) values ('"
                    + outletId + "', 'PWR', 'Power Branch')");
            execute(connection, "insert into app_user (id, username, full_name, password_hash) "
                    + "values ('" + userId + "', 'power-user', 'Power User', 'x')");
            execute(connection, """
                    insert into terminal (id, outlet_id, code, name, seq_block_start, seq_block_end,
                                          seq_current)
                    values ('%s', '%s', '01', 'Counter 1', 1, 10000, 2)
                    """.formatted(terminalId, outletId));
            execute(connection, """
                    insert into product (id, sku, name, base_unit, retail_price, trade_price,
                                         floor_price)
                    values ('%s', 'PWR-1', 'Power fixture', 'pc', 25, 22, 20)
                    """.formatted(productId));

            execute(connection, """
                    insert into sale (id, receipt_number, outlet_id, terminal_id, cashier_id,
                                      subtotal, discount_total, total, change_due, status)
                    values ('%s', '%s', '%s', '%s', '%s', 5000, 0, 5000, 0, 'COMPLETED')
                    """.formatted(saleId, receipt, outletId, terminalId, userId));

            for (int line = 0; line < 2; line++) {
                execute(connection, """
                        insert into sale_item (id, sale_id, product_id, selected_unit,
                                               conversion_factor, quantity, quantity_base,
                                               unit_price, discount, line_total, frozen_cost_price)
                        values ('%s', '%s', '%s', 'pc', 1, 1, 1, 25, 0, 2500, 1500)
                        """.formatted(UUID.randomUUID(), saleId, productId));
            }

            execute(connection, """
                    insert into payment (id, sale_id, method, amount)
                    values ('%s', '%s', 'cash', 5000)
                    """.formatted(UUID.randomUUID(), saleId));

            connection.commit();
        }
    }

    /**
     * Held because it changes.
     *
     * <p>Docker republishes a restarted container on a fresh host port, so the URL
     * the container object remembers points at nothing once the lights come back.
     * This is the one thing about the test that has nothing to do with the
     * requirement, and it cost a run to notice.
     */
    private String jdbcUrl;

    private Connection connect(PostgreSQLContainer postgres) throws Exception {
        return java.sql.DriverManager.getConnection(
                jdbcUrl == null ? postgres.getJdbcUrl() : jdbcUrl,
                postgres.getUsername(), postgres.getPassword());
    }

    /** Where the database is listening now, read back from Docker after a restart. */
    private String rediscover(PostgreSQLContainer postgres) {
        var ports = postgres.getDockerClient()
                .inspectContainerCmd(postgres.getContainerId()).exec()
                .getNetworkSettings().getPorts().getBindings();

        var binding = ports.get(new com.github.dockerjava.api.model.ExposedPort(
                PostgreSQLContainer.POSTGRESQL_PORT));

        return "jdbc:postgresql://%s:%s/%s".formatted(
                postgres.getHost(), binding[0].getHostPortSpec(), postgres.getDatabaseName());
    }

    /** Postgres replays its write-ahead log on start; that is the recovery. */
    private void waitUntilAnswering(PostgreSQLContainer postgres) throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt < 60; attempt++) {
            try (Connection connection = connect(postgres);
                 Statement statement = connection.createStatement()) {
                statement.execute("select 1");
                return;
            } catch (Exception notYet) {
                last = notYet;
                Thread.sleep(500);
            }
        }
        throw new IllegalStateException("the database never came back", last);
    }

    private String setting(PostgreSQLContainer postgres, String name) throws Exception {
        try (Connection connection = connect(postgres);
             PreparedStatement statement = connection.prepareStatement("show " + name);
             ResultSet rows = statement.executeQuery()) {
            rows.next();
            return rows.getString(1);
        }
    }

    private long countOf(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private void execute(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }
}
