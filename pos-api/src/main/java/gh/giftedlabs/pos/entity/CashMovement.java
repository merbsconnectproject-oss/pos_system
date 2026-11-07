package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.CashMovementType;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * Cash in or out of the drawer that is not a sale — FR-CASH-03.
 *
 * <p>Append-only. The drawer's history is evidence, and a correction is another
 * movement rather than an edit — the same rule BR-2 applies to stock.
 */
@Entity
@Table(name = "cash_movement")
public class CashMovement {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shift_id", nullable = false)
    private Shift shift;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "type", nullable = false, updatable = false)
    private CashMovementType type;

    /** Signed pesewas. The drawer is the sum of this column. */
    @Column(name = "amount", nullable = false, updatable = false)
    private long amount;

    /** FR-CASH-03: a payout with no reason cannot be told from a shortfall. */
    @Column(name = "reason", nullable = false, updatable = false)
    private String reason;

    @Column(name = "note", updatable = false)
    private String note;

    @Column(name = "actor_id", updatable = false)
    private UUID actorId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected CashMovement() { }

    public CashMovement(CashMovementType type, long amount, String reason, String note, UUID actorId) {
        this.type = type;
        this.amount = amount;
        this.reason = reason;
        this.note = note;
        this.actorId = actorId;
    }

    void attachTo(Shift shift) { this.shift = shift; }

    public UUID getId() { return id; }
    public Shift getShift() { return shift; }
    public CashMovementType getType() { return type; }
    public long getAmount() { return amount; }
    public String getReason() { return reason; }
    public String getNote() { return note; }
    public UUID getActorId() { return actorId; }
    public Instant getCreatedAt() { return createdAt; }
}
