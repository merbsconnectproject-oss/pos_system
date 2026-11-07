package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.AuditEntryView;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Reading the audit log — BR-15.
 *
 * <p>Separate from {@link AuditService}, which only writes. Keeping them apart
 * means nothing that records an event can accidentally be given the ability to
 * read one back and act on it, and the write path stays free of query concerns.
 */
public interface AuditQueryService {

    List<AuditEntryView> recent(String action, UUID actorId, UUID outletId,
                                Instant from, Instant to, int limit, int offset);
}
