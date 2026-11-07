package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.service.LoginAttemptService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sign-in throttling held in this process — FR-AUTH-06, NFR-10.
 *
 * <p>Correct for local-first: one JVM serves one counter, so process memory
 * <em>is</em> the shared state. A restart clears the counters, which is an
 * accepted trade — the alternative is a database write on every failed
 * attempt, which hands an attacker a cheap way to generate write load.
 *
 * <p>When a deployment has more than one instance, implement
 * {@link LoginAttemptService} over a shared store and delete nothing else.
 *
 * <p>Thresholds are configuration, not constants — K-08 makes them editable in
 * Settings, and FR-AUTH-05 says the same about the idle period.
 */
@Service
public class InMemoryLoginAttemptService implements LoginAttemptService {

    private record Attempts(int count, Instant firstFailureAt, Instant lockedUntil) {
    }

    private final Map<String, Attempts> attempts = new ConcurrentHashMap<>();
    private final Clock clock;
    private final int maxAttempts;
    private final Duration lockoutDuration;
    private final Duration attemptWindow;

    public InMemoryLoginAttemptService(
            Clock clock,
            @Value("${pos.auth.max-attempts:5}") int maxAttempts,
            @Value("${pos.auth.lockout-duration:PT15M}") Duration lockoutDuration,
            @Value("${pos.auth.attempt-window:PT15M}") Duration attemptWindow) {
        this.clock = clock;
        this.maxAttempts = maxAttempts;
        this.lockoutDuration = lockoutDuration;
        this.attemptWindow = attemptWindow;
    }

    @Override
    public Decision check(String identifier) {
        String key = key(identifier);
        Attempts current = attempts.get(key);

        if (current == null) {
            return Decision.allow(maxAttempts);
        }

        Instant now = clock.instant();

        if (current.lockedUntil() != null && now.isBefore(current.lockedUntil())) {
            return Decision.block(Duration.between(now, current.lockedUntil()));
        }

        // The lockout has expired, or the failures are older than the window.
        if (current.lockedUntil() != null || isStale(current, now)) {
            attempts.remove(key);
            return Decision.allow(maxAttempts);
        }

        return Decision.allow(Math.max(0, maxAttempts - current.count()));
    }

    @Override
    public Decision recordFailure(String identifier) {
        String key = key(identifier);
        Instant now = clock.instant();

        Attempts updated = attempts.compute(key, (ignored, existing) -> {
            if (existing == null || isStale(existing, now)) {
                return new Attempts(1, now, null);
            }
            int count = existing.count() + 1;
            Instant lockedUntil = count >= maxAttempts ? now.plus(lockoutDuration) : null;
            return new Attempts(count, existing.firstFailureAt(), lockedUntil);
        });

        if (updated.lockedUntil() != null) {
            return Decision.block(Duration.between(now, updated.lockedUntil()));
        }
        return Decision.allow(Math.max(0, maxAttempts - updated.count()));
    }

    @Override
    public void recordSuccess(String identifier) {
        attempts.remove(key(identifier));
    }

    @Override
    public void reset(String identifier) {
        attempts.remove(key(identifier));
    }

    /** Case-insensitive: FR-AUTH-01 accepts a username or an email. */
    private String key(String identifier) {
        return identifier == null ? "" : identifier.trim().toLowerCase(Locale.ROOT);
    }

    private boolean isStale(Attempts attempt, Instant now) {
        return attempt.firstFailureAt().plus(attemptWindow).isBefore(now);
    }
}
