package gh.giftedlabs.pos.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Map;

/**
 * Credential hashing — NFR-8.
 *
 * <p>Two beans, not one. NFR-8 requires that PINs are hashed
 * <strong>separately</strong> from passwords, and separate beans make that
 * structural: a caller asking for {@link #pinEncoder} cannot accidentally be
 * handed the password encoder, and the two produce hashes that are never
 * comparable.
 *
 * <p>Both are {@link DelegatingPasswordEncoder}s, which is the Strategy pattern
 * in Spring Security's own vocabulary. Hashes are stored with an algorithm
 * prefix — {@code {argon2}...} — so the algorithm can change later and existing
 * credentials keep verifying. Without that, swapping algorithms means resetting
 * every password in both shops.
 *
 * <p>Argon2id parameters follow the current OWASP recommendation. Argon2 is
 * memory-hard where bcrypt's working set is a fixed 4KB, which matters more
 * under local-first than it would have in the cloud: the database now sits on a
 * shop-floor PC, so the realistic attack is offline against a stolen machine.
 */
@Configuration
public class PasswordEncoderConfig {

    /** OWASP: m=19456 KiB, t=2, p=1. */
    private static final int SALT_LENGTH = 16;
    private static final int HASH_LENGTH = 32;
    private static final int PARALLELISM = 1;
    private static final int MEMORY_KIB = 19_456;
    private static final int ITERATIONS = 2;

    private static final String ARGON2 = "argon2";

    /**
     * Passwords — FR-AUTH-01.
     *
     * <p>Encodes with Argon2id; still verifies {@code {bcrypt}} hashes, so the
     * PRD's alternative stays open and any migration is transparent.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return delegating();
    }

    /**
     * PINs — FR-AUTH-02, FR-AUTH-04, BR-10.
     *
     * <p>A separate instance, so a PIN hash and a password hash for the same
     * user share no salt and cannot be substituted for one another.
     *
     * <p>⚠️ A 4–6 digit PIN is low entropy by construction. This encoder slows
     * an attacker down; it does not make PINs safe. The controls that matter
     * are throttling ({@code LoginAttemptService}, NFR-10) and physical
     * security of the counter PC.
     */
    @Bean("pinEncoder")
    public PasswordEncoder pinEncoder() {
        return delegating();
    }

    private PasswordEncoder delegating() {
        Argon2PasswordEncoder argon2 =
                new Argon2PasswordEncoder(SALT_LENGTH, HASH_LENGTH, PARALLELISM, MEMORY_KIB, ITERATIONS);

        Map<String, PasswordEncoder> encoders = Map.of(
                ARGON2, argon2,
                "bcrypt", new BCryptPasswordEncoder(12));

        // No default encoder is set for unprefixed hashes, deliberately.
        // DelegatingPasswordEncoder then throws on one, which is what we want:
        // an unprefixed hash is not a legacy format this system supports, it is
        // a seeding or migration bug, and it should fail loudly rather than be
        // quietly matched as plain text.
        return new DelegatingPasswordEncoder(ARGON2, encoders);
    }
}
