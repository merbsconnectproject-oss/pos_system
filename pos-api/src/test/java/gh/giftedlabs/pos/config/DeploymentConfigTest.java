package gh.giftedlabs.pos.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.time.Duration;
import java.util.Map;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Deployment wiring — the things that fail on a first deploy rather than in
 * development, and are therefore worth pinning before there is a deploy.
 */
@DisplayName("Deployment configuration")
class DeploymentConfigTest {

    @Nested
    @DisplayName("Railway DATABASE_URL translation")
    class DatabaseUrl {

        private final DatabaseUrlConfig processor = new DatabaseUrlConfig();

        private MockEnvironment withDatabaseUrl(String url) {
            MockEnvironment environment = new MockEnvironment();
            if (url != null) {
                environment.setProperty("DATABASE_URL", url);
            }
            processor.postProcessEnvironment(environment, null);
            return environment;
        }

        @Test
        @DisplayName("a libpq URL becomes JDBC with credentials split out")
        void translatesRailwayForm() {
            var env = withDatabaseUrl("postgresql://pos_user:s3cret@containers.railway.app:6543/railway");

            assertEquals("jdbc:postgresql://containers.railway.app:6543/railway",
                    env.getProperty("spring.datasource.url"));
            assertEquals("pos_user", env.getProperty("spring.datasource.username"));
            assertEquals("s3cret", env.getProperty("spring.datasource.password"));
        }

        @Test
        @DisplayName("an explicit JDBC_DATABASE_URL is never second-guessed")
        void explicitJdbcUrlWins() {
            MockEnvironment environment = new MockEnvironment();
            environment.setProperty("JDBC_DATABASE_URL", "jdbc:postgresql://localhost:5432/pos");
            environment.setProperty("DATABASE_URL", "postgresql://other:pw@elsewhere:5432/other");

            processor.postProcessEnvironment(environment, null);

            // Nothing was injected, so the configured default stands.
            assertNull(environment.getProperty("spring.datasource.username"));
        }

        @Test
        @DisplayName("an absent DATABASE_URL leaves local defaults alone")
        void absentUrlIsLeftAlone() {
            var env = withDatabaseUrl(null);
            assertNull(env.getProperty("spring.datasource.url"));
        }

        @Test
        @DisplayName("a malformed URL is not guessed at")
        void malformedUrlIsNotGuessed() {
            // Better to fail at connection time with a message about the URL
            // than to silently point at somewhere unexpected.
            var env = withDatabaseUrl("not a url at all");
            assertNull(env.getProperty("spring.datasource.username"));
        }
    }

    @Nested
    @DisplayName("Per-outlet ingest keys")
    class IngestKeys {

        private PosProperties.Ingest ingest(String raw) {
            return new PosProperties.Ingest(raw, Duration.ofMinutes(45));
        }

        @Test
        @DisplayName("each outlet gets its own key, so one shop can be cut off alone")
        void parsesPerOutletKeys() {
            Map<String, String> keys = ingest("INC:key-one,RAD:key-two").keysByOutlet();

            assertEquals(2, keys.size());
            assertEquals("key-one", keys.get("INC"));
            assertEquals("key-two", keys.get("RAD"));
        }

        @Test
        @DisplayName("whitespace and case are tolerated; malformed entries are dropped")
        void isForgivingOfFormatting() {
            Map<String, String> keys = ingest(" inc : key-one , nonsense , RAD:key-two ").keysByOutlet();

            assertEquals(2, keys.size());
            assertTrue(keys.containsKey("INC"));
            assertTrue(keys.containsKey("RAD"));
        }

        @Test
        @DisplayName("unset means no shop can push — never an open door")
        void emptyMeansClosed() {
            assertTrue(ingest("").keysByOutlet().isEmpty());
        }
    }

    @Nested
    @DisplayName("Counter push gating")
    class PushGating {

        private PosProperties.Consolidator consolidator(boolean enabled, String url, String key) {
            return new PosProperties.Consolidator(
                    enabled, url, key, Duration.ofMinutes(15), Duration.ofSeconds(10),
                    new PosProperties.Ingest("", Duration.ofMinutes(45)));
        }

        @Test
        @DisplayName("a shop installed before the consolidator exists simply does not push")
        void disabledByDefault() {
            assertFalse(consolidator(false, "", "").canPush());
        }

        @Test
        @DisplayName("enabled without a URL or key does not push an unattributed payload")
        void refusesIncompleteConfiguration() {
            assertFalse(consolidator(true, "https://owner.example.com", "").canPush());
            assertFalse(consolidator(true, "", "a-key").canPush());
        }

        @Test
        @DisplayName("fully configured, it pushes")
        void pushesWhenConfigured() {
            assertTrue(consolidator(true, "https://owner.example.com", "a-key").canPush());
        }
    }

    @Nested
    @DisplayName("Counter network boundary")
    class CounterNetworkBoundary {
        @Test
        @DisplayName("the local-first counter binds to loopback by default")
        void bindsOnlyToLoopback() throws Exception {
            String config;
            try (var stream = getClass().getResourceAsStream("/application-counter.yml")) {
                config = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            }
            assertTrue(config.contains("address: ${POS_BIND_ADDRESS:127.0.0.1}"));
        }
    }
}
