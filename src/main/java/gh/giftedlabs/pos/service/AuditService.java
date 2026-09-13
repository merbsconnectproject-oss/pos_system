package gh.giftedlabs.pos.service;

import java.util.Map;
import java.util.UUID;

public interface AuditService {
    void record(UUID actorId, String action, String entityType, UUID entityId,
                Map<String, ?> before, Map<String, ?> after, UUID outletId,
                UUID terminalId, String clientIp);
}
