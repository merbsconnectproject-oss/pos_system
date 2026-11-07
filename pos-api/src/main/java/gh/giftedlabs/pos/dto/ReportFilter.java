package gh.giftedlabs.pos.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * FR-RPT-03: what every report can be narrowed by.
 *
 * <p>One record rather than a parameter list per endpoint, so a filter added
 * here reaches every report at once and none of them quietly ignores it.
 *
 * <p>Null means "no restriction" throughout. It is not a default — a report of
 * everything is a legitimate answer, and an implicit "today" would make the
 * figures change meaning depending on when they were asked for.
 */
public record ReportFilter(
        Instant from,
        Instant to,
        UUID outletId,
        String category,
        UUID userId,
        String paymentMethod) {

    public static ReportFilter of(Instant from, Instant to, UUID outletId) {
        return new ReportFilter(from, to, outletId, null, null, null);
    }
}
