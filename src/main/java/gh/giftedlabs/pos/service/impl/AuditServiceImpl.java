package gh.giftedlabs.pos.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.entity.AuditLog;
import gh.giftedlabs.pos.repository.AuditLogRepository;
import gh.giftedlabs.pos.service.AuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Map;
import java.util.UUID;

@Service
public class AuditServiceImpl implements AuditService {
    private final AuditLogRepository entries;
    private final ObjectMapper json;
    private final Clock clock;

    public AuditServiceImpl(AuditLogRepository entries, ObjectMapper json, Clock clock) {
        this.entries = entries; this.json = json; this.clock = clock;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID actorId, String action, String entityType, UUID entityId,
                       Map<String, ?> before, Map<String, ?> after, UUID outletId,
                       UUID terminalId, String clientIp) {
        entries.save(new AuditLog(actorId, action, entityType, entityId,
                encode(before), encode(after), outletId, terminalId, clientIp, clock.instant()));
    }

    private String encode(Map<String, ?> value) {
        if (value == null || value.isEmpty()) return null;
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException ex) { throw new IllegalArgumentException("Audit value is not JSON serializable", ex); }
    }
}
