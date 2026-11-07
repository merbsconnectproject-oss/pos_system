package gh.giftedlabs.pos.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One audit entry, in the shape the frontend's {@code AuditLogEntry} expects —
 * BR-15 · FR-AUDIT.
 *
 * <p>{@code actor} and {@code outletName} are resolved names rather than ids:
 * the view is read by a person looking for what happened, and a UUID is not an
 * answer. {@code details} is rendered from the before/after snapshots, so the
 * log stays a record of state and the sentence is derived, never stored.
 */
public record AuditEntryView(
        UUID id,
        Instant timestamp,
        String actor,
        String action,
        String entity,
        String outletName,
        String details) {
}
