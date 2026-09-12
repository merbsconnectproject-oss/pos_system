package gh.giftedlabs.pos.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * Cross-cutting beans.
 */
@Configuration
public class ApplicationConfig {

    /**
     * A single injected {@link Clock} rather than {@code Instant.now()} scattered
     * through services.
     *
     * <p>This is not ceremony. Lockout windows (FR-AUTH-06), idle timeouts
     * (FR-AUTH-05) and shift boundaries (BR-13) are all time-dependent, and
     * testing them against a wall clock means either sleeping in tests or not
     * testing them. With an injected clock a test advances time directly.
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
