package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.PurchaseOrderStatus;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * An order placed with a supplier — FR-SUP-08.
 *
 * <p>A commitment rather than a movement. Raising one changes no stock and no
 * money; the goods become stock only when a receipt against it is confirmed.
 * Which is why nothing here records what has arrived: ordered is stored, and
 * received is summed from the receipts pointing at this order. Two figures that
 * must agree eventually do not.
 *
 * <p>The lifecycle runs one way — draft, sent, then closed or cancelled — and the
 * database enforces that rather than trusting this class to. Lines freeze the
 * moment the supplier holds a copy, because a variance measured against an order
 * somebody edited afterwards is not a variance.
 */
@Entity
@Table(name = "purchase_order")
public class PurchaseOrder {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** {@code {OUTLET}-PO-000001}. Permanent once issued. */
    @Column(name = "number", nullable = false, updatable = false)
    private String number;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "supplier_id", nullable = false, updatable = false)
    private UUID supplierId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private PurchaseOrderStatus status = PurchaseOrderStatus.DRAFT;

    /** A date, not a timestamp: nobody agrees a delivery to the minute. */
    @Column(name = "expected_on")
    private LocalDate expectedOn;

    @Column(name = "note")
    private String note;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "sent_by")
    private UUID sentBy;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "closed_by")
    private UUID closedBy;

    @Column(name = "close_reason")
    private String closeReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "created_by", updatable = false)
    private UUID createdBy;

    /**
     * Nulled on every change so the owner's copy follows the order rather than
     * freezing at whatever it was first sent as.
     */
    @Column(name = "synced_at")
    private Instant syncedAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    private List<PurchaseOrderLine> lines = new ArrayList<>();

    protected PurchaseOrder() { }

    public PurchaseOrder(String number, UUID outletId, UUID supplierId, LocalDate expectedOn,
                         String note, UUID createdBy) {
        this.number = number;
        this.outletId = outletId;
        this.supplierId = supplierId;
        this.expectedOn = expectedOn;
        this.note = note;
        this.createdBy = createdBy;
    }

    public UUID getId() { return id; }
    public String getNumber() { return number; }
    public UUID getOutletId() { return outletId; }
    public UUID getSupplierId() { return supplierId; }
    public PurchaseOrderStatus getStatus() { return status; }
    public LocalDate getExpectedOn() { return expectedOn; }
    public String getNote() { return note; }
    public Instant getSentAt() { return sentAt; }
    public UUID getSentBy() { return sentBy; }
    public Instant getClosedAt() { return closedAt; }
    public UUID getClosedBy() { return closedBy; }
    public String getCloseReason() { return closeReason; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getCreatedBy() { return createdBy; }
    public List<PurchaseOrderLine> getLines() { return List.copyOf(lines); }

    public void addLine(PurchaseOrderLine line) {
        line.attachTo(this);
        lines.add(line);
        touch();
    }

    public void removeLines() {
        lines.clear();
        touch();
    }

    /** While still a draft, the order is an ordinary editable document. */
    public boolean isDraft() { return status == PurchaseOrderStatus.DRAFT; }

    /** Open to deliveries: sent, and not yet closed or cancelled. */
    public boolean isOpen() { return status == PurchaseOrderStatus.SENT; }

    public boolean isFinished() {
        return status == PurchaseOrderStatus.CLOSED || status == PurchaseOrderStatus.CANCELLED;
    }

    public void amend(LocalDate expectedOn, String note) {
        this.expectedOn = expectedOn;
        this.note = note;
        touch();
    }

    /** Issuing it to the supplier, which is what freezes the lines. */
    public void send(UUID actorId, Instant at) {
        this.status = PurchaseOrderStatus.SENT;
        this.sentAt = at;
        this.sentBy = actorId;
        touch();
    }

    /**
     * No more deliveries expected — whether it all arrived or it never will.
     *
     * <p>The reason is what tells those two apart when somebody reads the order a
     * month later, so it is required rather than optional.
     */
    public void close(UUID actorId, Instant at, String reason) {
        this.status = PurchaseOrderStatus.CLOSED;
        this.closedAt = at;
        this.closedBy = actorId;
        this.closeReason = reason;
        touch();
    }

    public void cancel(UUID actorId, Instant at, String reason) {
        this.status = PurchaseOrderStatus.CANCELLED;
        this.closedAt = at;
        this.closedBy = actorId;
        this.closeReason = reason;
        touch();
    }

    public Instant getSyncedAt() { return syncedAt; }

    /** Any change makes this order unsent again, as far as the owner is concerned. */
    private void touch() { this.syncedAt = null; }
}
