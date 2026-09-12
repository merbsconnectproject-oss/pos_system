package gh.giftedlabs.pos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything this system reads from its environment, in one typed place.
 *
 * <p>Bound once and injected, rather than {@code @Value} scattered through
 * services. Typos fail at startup instead of at the moment a cashier needs the
 * feature, and every deployment knob is discoverable by reading this file.
 *
 * @param deployment   which of the two roles this JVM is playing
 * @param auth         FR-AUTH-05, FR-AUTH-06 — all configurable, per K-08
 * @param consolidator the owner's view: pushing it (counter) or serving it
 * @param web          CORS, only relevant when a separate frontend origin exists
 */
@ConfigurationProperties(prefix = "pos")
public record PosProperties(
        @DefaultValue Deployment deployment,
        @DefaultValue Auth auth,
        @DefaultValue Consolidator consolidator,
        @DefaultValue Web web) {

    public enum Mode {
        /** A shop's counter PC. The system of record. */
        COUNTER,
        /** The owner's combined view. Receives snapshots; never authoritative. */
        CONSOLIDATOR
    }

    public record Deployment(
            @DefaultValue("COUNTER") Mode mode,
            @DefaultValue("") String outletCode,
            @DefaultValue("01") String terminalCode) {

        public boolean isCounter() {
            return mode == Mode.COUNTER;
        }

        public boolean isConsolidator() {
            return mode == Mode.CONSOLIDATOR;
        }
    }

    /** FR-AUTH-05, FR-AUTH-06, NFR-10. K-08 makes these settings, not constants. */
    public record Auth(
            @DefaultValue("5") int maxAttempts,
            @DefaultValue("PT15M") Duration lockoutDuration,
            @DefaultValue("PT15M") Duration attemptWindow,
            @DefaultValue("PT15M") Duration idleTimeout) {
    }

    public record Consolidator(
            @DefaultValue("false") boolean enabled,
            @DefaultValue("") String baseUrl,
            @DefaultValue("") String apiKey,
            @DefaultValue("PT15M") Duration pushInterval,
            @DefaultValue("PT10S") Duration requestTimeout,
            @DefaultValue Ingest ingest) {

        /** A counter only pushes once it has somewhere to push to and a key to sign with. */
        public boolean canPush() {
            return enabled && !baseUrl.isBlank() && !apiKey.isBlank();
        }
    }

    public record Ingest(
            @DefaultValue("") String apiKeys,
            @DefaultValue("PT45M") Duration staleAfter) {

        /**
         * Parses {@code INC:key1,RAD:key2} into outlet code → key.
         *
         * <p>One key per outlet, not one shared key, so a compromised shop can
         * be cut off without re-keying the other.
         */
        public Map<String, String> keysByOutlet() {
            Map<String, String> keys = new LinkedHashMap<>();
            if (apiKeys.isBlank()) {
                return Map.of();
            }
            for (String entry : apiKeys.split(",")) {
                String[] parts = entry.trim().split(":", 2);
                if (parts.length == 2 && !parts[0].isBlank() && !parts[1].isBlank()) {
                    keys.put(parts[0].trim().toUpperCase(), parts[1].trim());
                }
            }
            return Map.copyOf(keys);
        }
    }

    public record Web(@DefaultValue("") String corsAllowedOrigins) {

        public List<String> allowedOrigins() {
            if (corsAllowedOrigins.isBlank()) {
                return List.of();
            }
            return List.of(corsAllowedOrigins.split(",")).stream()
                    .map(String::trim)
                    .filter(origin -> !origin.isBlank())
                    .toList();
        }
    }
}
