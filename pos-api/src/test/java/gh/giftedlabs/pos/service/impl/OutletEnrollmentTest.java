package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.dto.OutletConfig;
import gh.giftedlabs.pos.dto.OutletEnrollment;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.SyncService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.NavigableMap;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The file that lets an outlet computer join an existing business.
 *
 * <p>In this package because the sync key is deliberately package-private on
 * {@link OffsiteStore} — only the enrollment issuer may read it, and a stub that
 * can override it has to live where the real one does.
 */
@Import({TestcontainersConfiguration.class, OutletEnrollmentTest.InMemoryBucket.class})
@SpringBootTest
@TestPropertySource(properties = {
        "pos.backup.offsite.bucket=test-bucket",
        "pos.backup.offsite.access-key-id=AKIATEST",
        "pos.backup.offsite.secret-access-key=secret-shhh",
        "pos.backup.offsite.region=auto",
        "pos.backup.offsite.prefix=radiance-live",
        "pos.backup.enabled=false",
})
@DisplayName("Outlet enrollment file")
class OutletEnrollmentTest {

    static final String SYNC_KEY = "c2hhcmVkLXN5bmMta2V5LTMyLWJ5dGVzLWxvbmchIQ==";

    /** A bucket in a map, holding the one shared sync key the business uses. */
    static class Bucket extends OffsiteStore {
        final NavigableMap<String, byte[]> objects = new TreeMap<>();

        @Override
        String syncEncryptionKey() {
            return SYNC_KEY;
        }

        @Override
        public String putBytes(byte[] body, String name, String contentType, PosProperties.Offsite config) {
            objects.put(name, body);
            return "s3://test-bucket/" + name;
        }

        @Override
        public Optional<byte[]> get(String name, PosProperties.Offsite config) {
            return Optional.ofNullable(objects.get(name));
        }

        @Override
        public List<String> list(String prefix, PosProperties.Offsite config) {
            return objects.keySet().stream().filter(key -> key.startsWith(prefix)).sorted().toList();
        }

        @Override
        public String put(Path file, String name, PosProperties.Offsite config) {
            objects.put(name, new byte[0]);
            return "s3://test-bucket/" + name;
        }
    }

    @TestConfiguration
    @Profile("!live")
    static class InMemoryBucket {
        @Bean @Primary Bucket bucket() { return new Bucket(); }
    }

    @Autowired SyncService sync;
    @Autowired Bucket bucket;
    @Autowired OutletRepository outlets;
    @Autowired UserRepository users;

    private PosPrincipal owner;
    private UUID outletId;
    private String code;

    @BeforeEach
    void seed() {
        String run = UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        code = "E" + run;
        outletId = outlets.save(new Outlet(code, "Accra Main Store " + run)).getId();

        User account = new User("owner-" + run.toLowerCase(), "Enrolling Owner", "hash");
        account.assignRole(Role.OWNER);
        account.assignOutlet(outletId);
        owner = new PosPrincipal(users.save(account).getId(), account.getUsername(), outletId, Instant.now());
        bucket.objects.clear();
    }

    @Test
    @DisplayName("carries the outlet's real id, the bucket and the shared sync key")
    void carriesEverythingTheCounterNeeds() {
        sync.publishConfiguration(outletId, owner, "127.0.0.1");

        OutletEnrollment file = sync.issueEnrollment(outletId, owner, "127.0.0.1");

        // The id is the whole point: the counter adopts this rather than
        // inventing an outlet of its own that nothing can later merge.
        assertEquals(outletId, file.outlet().id());
        assertEquals(code, file.outlet().code());

        assertEquals("test-bucket", file.cloudSync().bucket());
        assertEquals("AKIATEST", file.cloudSync().accessKeyId());
        assertEquals("secret-shhh", file.cloudSync().secretAccessKey());
        assertEquals("radiance-live", file.cloudSync().prefix());
        assertEquals(SYNC_KEY, file.cloudSync().encryptionKey());

        // Six things must match for a pull to work; the version lets an older
        // installer say so instead of failing to parse.
        assertEquals(OutletConfig.VERSION, file.configVersion());
        assertEquals(OutletEnrollment.VERSION, file.version());
        assertEquals("radiance-live", file.business().workspace());
    }

    @Test
    @DisplayName("refuses before the outlet has been published")
    void refusesWhenNothingHasBeenPublished() {
        // Caught here, on the owner's computer, rather than at a counter where
        // the operator has no way to publish.
        ResponseStatusException refusal = assertThrows(ResponseStatusException.class,
                () -> sync.issueEnrollment(outletId, owner, "127.0.0.1"));

        assertTrue(refusal.getReason().contains("Publish"), refusal.getReason());
        assertTrue(refusal.getReason().contains(code), refusal.getReason());
    }

    @Test
    @DisplayName("is audited without the secrets in the entry")
    void auditedWithoutSecrets() {
        sync.publishConfiguration(outletId, owner, "127.0.0.1");
        sync.issueEnrollment(outletId, owner, "127.0.0.1");

        String entries = auditFor("ENROLLMENT_ISSUED");
        assertTrue(entries.contains(code), entries);
        assertFalse(entries.contains("secret-shhh"), "the access secret must not reach the audit log");
        assertFalse(entries.contains(SYNC_KEY), "the sync key must not reach the audit log");
    }

    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    private String auditFor(String action) {
        return String.valueOf(jdbc.queryForList(
                "select after_json from audit_log where action = ? order by created_at desc", action));
    }
}
