package gh.giftedlabs.pos.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_log")
public class AuditLog {
    @Id @GeneratedValue private UUID id;
    @Column(name = "actor_id") private UUID actorId;
    @Column(nullable = false) private String action;
    @Column(name = "entity_type", nullable = false) private String entityType;
    @Column(name = "entity_id") private UUID entityId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "before_json", columnDefinition = "jsonb") private String beforeJson;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "after_json", columnDefinition = "jsonb") private String afterJson;
    @Column(name = "outlet_id") private UUID outletId;
    @Column(name = "terminal_id") private UUID terminalId;
    @Column(name = "ip_address") private String ipAddress;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt = Instant.now();
    @Column(name = "synced_at") private Instant syncedAt;

    protected AuditLog() {}

    public AuditLog(UUID actorId, String action, String entityType, UUID entityId,
                    String beforeJson, String afterJson, UUID outletId,
                    UUID terminalId, String ipAddress, Instant createdAt) {
        this.actorId = actorId;
        this.action = action;
        this.entityType = entityType;
        this.entityId = entityId;
        this.beforeJson = beforeJson;
        this.afterJson = afterJson;
        this.outletId = outletId;
        this.terminalId = terminalId;
        this.ipAddress = ipAddress;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getActorId() { return actorId; }
    public String getAction() { return action; }
    public UUID getEntityId() { return entityId; }
    public Instant getCreatedAt() { return createdAt; }
}
