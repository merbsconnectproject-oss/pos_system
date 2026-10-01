package gh.giftedlabs.pos.service.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The sync key is shared across the business; the backup key is private to one
 * machine. Conflating them made enrolling a second computer impossible.
 */
@DisplayName("Cloud Sync encryption key")
class OffsiteStoreKeyTest {

    private static final String SYNC = Base64.getEncoder().encodeToString("sync-key-exactly-32-bytes-long!!".getBytes());
    private static final String BACKUP = Base64.getEncoder().encodeToString("backup-key-exactly-32-byteslong!".getBytes());

    @Nested
    @DisplayName("resolution")
    class Resolution {

        @Test
        @DisplayName("the sync key is used when set")
        void syncKeyWins() {
            MockEnvironment environment = new MockEnvironment()
                    .withProperty("POS_SYNC_ENCRYPTION_KEY", SYNC)
                    .withProperty("POS_BACKUP_ENCRYPTION_KEY", BACKUP);

            assertEquals(SYNC, keyOf(new OffsiteStore(environment)));
        }

        @Test
        @DisplayName("an installation predating the split falls back to the backup key")
        void backupKeyIsTheFallback() {
            // Without this, upgrading would orphan every object the install had
            // already written under the one key it used to have.
            MockEnvironment environment = new MockEnvironment()
                    .withProperty("POS_BACKUP_ENCRYPTION_KEY", BACKUP);

            assertEquals(BACKUP, keyOf(new OffsiteStore(environment)));
        }

        @Test
        @DisplayName("a blank sync key does not shadow the fallback")
        void blankSyncKeyIsNotAChoice() {
            MockEnvironment environment = new MockEnvironment()
                    .withProperty("POS_SYNC_ENCRYPTION_KEY", "   ")
                    .withProperty("POS_BACKUP_ENCRYPTION_KEY", BACKUP);

            assertEquals(BACKUP, keyOf(new OffsiteStore(environment)));
        }
    }

    @Nested
    @DisplayName("payloads")
    class Payloads {

        @Test
        @DisplayName("a payload written with one key round-trips under that key")
        void roundTrips() {
            byte[] plain = "{\"outlet\":\"ACC\"}".getBytes();

            assertArrayEquals(plain, OffsitePayloadCrypto.decrypt(
                    OffsitePayloadCrypto.encrypt(plain, SYNC), SYNC));
        }

        @Test
        @DisplayName("the counter is told which key is wrong when it cannot decrypt")
        void mismatchNamesTheSyncKey() {
            // The install-time failure this whole split exists to prevent: the
            // message has to name the key the operator can actually fix.
            byte[] sealed = OffsitePayloadCrypto.encrypt("{}".getBytes(), SYNC);

            IllegalStateException failure = assertThrows(IllegalStateException.class,
                    () -> OffsitePayloadCrypto.decrypt(sealed, BACKUP));

            assertTrue(failure.getMessage().contains("POS_SYNC_ENCRYPTION_KEY"), failure.getMessage());
            assertTrue(failure.getMessage().contains("enrollment file"), failure.getMessage());
        }
    }

    /** Reads the resolved key back through the only thing that observes it. */
    private static String keyOf(OffsiteStore store) {
        try {
            var field = OffsiteStore.class.getDeclaredField("encryptionKey");
            field.setAccessible(true);
            return (String) field.get(store);
        } catch (ReflectiveOperationException unreachable) {
            throw new AssertionError(unreachable);
        }
    }
}
