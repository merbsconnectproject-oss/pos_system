package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A delivery, as a document — FR-SUP-02, FR-SUP-04, FR-SUP-06.
 *
 * <p>The only path that moves weighted average cost, so it is recorded rather
 * than implied: the stock movements it causes carry its id, and it cannot be
 * edited once confirmed. A mistake is corrected by a reversing receipt, which
 * is the same rule BR-3 applies to sales — both documents stay visible.
 */
@Entity
@Table(name = "goods_receipt")
public class GoodsReceipt {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "supplier_id", nullable = false, updatable = false)
    private UUID supplierId;

    /** The supplier's own invoice or delivery note number, as written on paper. */
    @Column(name = "reference", updatable = false)
    private String reference;

    @Column(name = "note", updatable = false)
    private String note;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "confirmed_by")
    private UUID confirmedBy;

    /** Set on a correcting document, naming the receipt it reverses. */
    @Column(name = "reverses_id", updatable = false)
    private UUID reversesId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "created_by", updatable = false)
    private UUID createdBy;

    @OneToMany(mappedBy = "receipt", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<GoodsReceiptLine> lines = new ArrayList<>();

    protected GoodsReceipt() { }

    public GoodsReceipt(UUID outletId, UUID supplierId, String reference, String note, UUID createdBy) {
        this.outletId = outletId;
        this.supplierId = supplierId;
        this.reference = reference;
        this.note = note;
        this.createdBy = createdBy;
    }

    public UUID getId() { return id; }
    public UUID getOutletId() { return outletId; }
    public UUID getSupplierId() { return supplierId; }
    public String getReference() { return reference; }
    public String getNote() { return note; }
    public Instant getConfirmedAt() { return confirmedAt; }
    public UUID getConfirmedBy() { return confirmedBy; }
    public UUID getReversesId() { return reversesId; }
    public void markReverses(UUID original) { this.reversesId = original; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getCreatedBy() { return createdBy; }
    public List<GoodsReceiptLine> getLines() { return List.copyOf(lines); }

    public void addLine(GoodsReceiptLine line) {
        line.attachTo(this);
        lines.add(line);
    }

    /** FR-SUP-04: confirming is what writes the stock movements. Once only. */
    public void confirm(UUID actorId, Instant at) {
        if (confirmedAt != null) throw new IllegalStateException("Already confirmed");
        this.confirmedAt = at;
        this.confirmedBy = actorId;
    }

    public boolean isConfirmed() { return confirmedAt != null; }
}
