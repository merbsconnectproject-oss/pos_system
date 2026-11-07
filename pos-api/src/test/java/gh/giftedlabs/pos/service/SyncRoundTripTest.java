package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.service.impl.OffsiteStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The bucket behaviours both channels stand on — live.
 *
 * <p>Off the normal suite: it needs the network and real credentials. Run it
 * when the keys change:
 *
 * <pre>{@code
 * set -a && . ./.env && set +a && ./mvnw test -Dtest=SyncRoundTripTest -DfailIfNoTests=false
 * }</pre>
 */
@Tag("live")
@EnabledIfEnvironmentVariable(named = "POS_BACKUP_OFFSITE_BUCKET", matches = ".+")
@DisplayName("Sync channels against the real bucket")
class SyncRoundTripTest {

    private static PosProperties.Offsite config() {
        return new PosProperties.Offsite(
                System.getenv("POS_BACKUP_OFFSITE_ENDPOINT"),
                System.getenv("POS_BACKUP_OFFSITE_BUCKET"),
                System.getenv("POS_BACKUP_OFFSITE_ACCESS_KEY_ID"),
                System.getenv("POS_BACKUP_OFFSITE_SECRET_ACCESS_KEY"),
                orDefault(System.getenv("POS_BACKUP_OFFSITE_REGION"), "auto"),
                orDefault(System.getenv("POS_BACKUP_OFFSITE_PREFIX"), ""));
    }

    @Test
    @DisplayName("batches list in the order they were written, whatever order they arrive in")
    void batchesListChronologically() {
        OffsiteStore store = new OffsiteStore();
        PosProperties.Offsite config = config();
        String run = "selftest/" + System.nanoTime() + "/";

        // Written deliberately out of order. The zero padding is what makes
        // lexical order chronological — without it batch 10 sorts before batch 2
        // and the owner applies a plan's payment before the plan exists.
        for (int sequence : new int[] {10, 2, 1}) {
            store.putBytes(("{\"sequence\":" + sequence + "}").getBytes(StandardCharsets.UTF_8),
                    run + "%06d-batch.json".formatted(sequence), "application/json", config);
        }

        List<String> keys = store.list(run, config);
        assertEquals(3, keys.size(), keys.toString());
        assertTrue(keys.get(0).contains("000001"), keys.toString());
        assertTrue(keys.get(1).contains("000002"), keys.toString());
        assertTrue(keys.get(2).contains("000010"),
                "batch 10 must sort last, not between 1 and 2: " + keys);
    }

    @Test
    @DisplayName("a config key round-trips byte for byte")
    void configRoundTrips() {
        OffsiteStore store = new OffsiteStore();
        PosProperties.Offsite config = config();
        String key = "selftest/config-" + System.nanoTime() + ".json";

        byte[] body = "{\"outlet\":\"INC\",\"products\":[]}".getBytes(StandardCharsets.UTF_8);
        store.putBytes(body, key, "application/json", config);

        byte[] readBack = store.get(key, config).orElseThrow();
        assertArrayEquals(body, readBack, "a shop must apply exactly what the owner published");
    }

    private static String orDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
