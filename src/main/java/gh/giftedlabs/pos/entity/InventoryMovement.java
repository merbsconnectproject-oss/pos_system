package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.MovementType;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One stock change — BR-2, FR-INV-02, FR-INV-03.
 *
 * <p>Append-only at the database boundary. Correcting a mistake means writing
 * the opposite movement, which is what {@code SALE_VOID} and the adjustment
 * pair are for: a ledger that can be edited is not evidence of anything.
 */
@Entity
@Table(name = "inventory_movement")
public class InventoryMovement {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "type", nullable = false, updatable = false)
    private MovementType type;

    /** Signed, in base units. The sum of this column is the level. */
    @Column(name = "quantity_delta", nullable = false, updatable = false)
    private BigDecimal quantityDelta;

    /** BR-5: frozen at the moment of the movement. */
    @Column(name = "unit_cost", updatable = false)
    private BigDecimal unitCost;

    @Column(name = "reason", updatable = false)
    private String reason;

    @Column(name = "note", updatable = false)
    private String note;

    @Column(name = "source_type", updatable = false)
    private String sourceType;

    @Column(name = "source_id", updatable = false)
    private UUID sourceId;

    /** BR-9: an oversell, so FR-INV-10's exceptions view can find it. */
    @Column(name = "is_exception", nullable = false, updatable = false)
    private boolean exception;

    @Column(name = "actor_id", updatable = false)
    private UUID actorId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected InventoryMovement() { }

    public InventoryMovement(UUID productId, UUID outletId, MovementType type, BigDecimal quantityDelta,
                             BigDecimal unitCost, String reason, String note,
                             String sourceType, UUID sourceId, boolean exception,
                             UUID actorId, Instant createdAt) {
        this.productId = productId;
        this.outletId = outletId;
        this.type = type;
        this.quantityDelta = quantityDelta;
        this.unitCost = unitCost;
        this.reason = reason;
        this.note = note;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.exception = exception;
        this.actorId = actorId;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getProductId() { return productId; }
    public UUID getOutletId() { return outletId; }
    public MovementType getType() { return type; }
    public BigDecimal getQuantityDelta() { return quantityDelta; }
    public BigDecimal getUnitCost() { return unitCost; }
    public String getReason() { return reason; }
    public String getNote() { return note; }
    public String getSourceType() { return sourceType; }
    public UUID getSourceId() { return sourceId; }
    public boolean isException() { return exception; }
    public UUID getActorId() { return actorId; }
    public Instant getCreatedAt() { return createdAt; }
}
