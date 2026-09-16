package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.service.impl.OffsiteStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Does the configured bucket actually accept a write? — NFR-6.
 *
 * <p>Off the normal suite on purpose: it needs the network and real credentials,
 * and a test that fails because somebody is on a bad connection teaches people to
 * ignore red builds. Run it deliberately when the keys change:
 *
 * <pre>{@code
 * set -a && . ./.env && set +a && ./mvnw test -Dtest=OffsiteStoreLiveTest -DfailIfNoTests=false
 * }</pre>
 *
 * <p>It proves the one thing that cannot be proved locally: that the endpoint,
 * bucket, key and secret in the environment go together and have write access.
 * Everything else about backups is already covered without a network.
 */
@Tag("live")
@EnabledIfEnvironmentVariable(named = "POS_BACKUP_OFFSITE_BUCKET", matches = ".+")
@DisplayName("R2 credentials — live")
class OffsiteStoreLiveTest {

    @Test
    @DisplayName("the configured bucket accepts an upload")
    void uploadsToTheRealBucket() throws Exception {
        PosProperties.Offsite config = new PosProperties.Offsite(
                System.getenv("POS_BACKUP_OFFSITE_ENDPOINT"),
                System.getenv("POS_BACKUP_OFFSITE_BUCKET"),
                System.getenv("POS_BACKUP_OFFSITE_ACCESS_KEY_ID"),
                System.getenv("POS_BACKUP_OFFSITE_SECRET_ACCESS_KEY"),
                orDefault(System.getenv("POS_BACKUP_OFFSITE_REGION"), "auto"),
                orDefault(System.getenv("POS_BACKUP_OFFSITE_PREFIX"), ""));

        assertTrue(config.isConfigured(), "bucket, key and secret must all be set");

        Path probe = Files.createTempFile("pos-r2-probe-", ".txt");
        Files.writeString(probe, "Written by OffsiteStoreLiveTest at " + Instant.now() + "\n");

        OffsiteStore store = new OffsiteStore();
        try {
            String where = store.put(probe, "connectivity-probe.txt", config);
            assertTrue(where.startsWith("s3://" + config.bucket()), where);
            System.out.println("R2 write succeeded: " + where);

            // The read side, which the sync channels depend on and backups never
            // exercised. Write access without read access is a bucket that can
            // take a shop's data and never give it back.
            byte[] readBack = store.get("connectivity-probe.txt", config)
                    .orElseThrow(() -> new AssertionError("wrote the probe and could not read it back"));
            assertEquals(Files.readString(probe), new String(readBack));
            System.out.println("R2 read succeeded: " + readBack.length + " bytes");

            assertTrue(store.list("", config).contains("connectivity-probe.txt"),
                    "the probe should appear in a listing");
            System.out.println("R2 list succeeded");

            // An absent key is an answer, not an error — the first pull at a shop
            // happens before anything has been published.
            assertTrue(store.get("definitely-not-there-" + System.nanoTime(), config).isEmpty(),
                    "a missing object must come back empty rather than throwing");
        } finally {
            Files.deleteIfExists(probe);
        }
    }

    private static String orDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
