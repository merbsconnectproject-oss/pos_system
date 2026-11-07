package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * How much of one product is at one outlet — BR-1, FR-INV-01.
 *
 * <p>A running total of {@link InventoryMovement}, kept because the counter
 * needs "how many are there" in one indexed read while selling, and summing a
 * ledger that grows forever gets slower every day. The ledger remains the
 * truth; NFR-17's nightly job re-proves the two agree.
 *
 * <p>There is deliberately no quantity on {@link Product}. BR-1 is that no
 * global stock figure exists anywhere, because one would immediately disagree
 * with the per-outlet numbers that are actually sold from.
 */
@Entity
@Table(name = "stock_level")
public class StockLevel {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    /** BR-12: base units, three decimals, for cut lengths. */
    @Column(name = "quantity", nullable = false)
    private BigDecimal quantity = BigDecimal.ZERO;

    /** BR-4: weighted average, per outlet. */
    @Column(name = "average_cost", nullable = false)
    private BigDecimal averageCost = BigDecimal.ZERO;

    /** FR-INV-08: per outlet — two branches do not share a threshold. */
    @Column(name = "reorder_level", nullable = false)
    private BigDecimal reorderLevel = BigDecimal.ZERO;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected StockLevel() { }

    public StockLevel(UUID productId, UUID outletId) {
        this.productId = productId;
        this.outletId = outletId;
    }

    public UUID getId() { return id; }
    public UUID getProductId() { return productId; }
    public UUID getOutletId() { return outletId; }
    public BigDecimal getQuantity() { return quantity; }
    public BigDecimal getAverageCost() { return averageCost; }
    public BigDecimal getReorderLevel() { return reorderLevel; }
    public Instant getUpdatedAt() { return updatedAt; }

    /**
     * Applied only by the service that also wrote the movement.
     *
     * <p>Package-visible rather than public so nothing can move a level without
     * the ledger entry that explains it — BR-2 is that the two never diverge.
     */
    public void apply(BigDecimal delta, BigDecimal newAverageCost, Instant at) {
        this.quantity = this.quantity.add(delta);
        if (newAverageCost != null) this.averageCost = newAverageCost;
        this.updatedAt = at;
    }

    public void setReorderLevel(BigDecimal reorderLevel) {
        this.reorderLevel = reorderLevel;
        this.updatedAt = Instant.now();
    }

    /** FR-INV-08. */
    public boolean isLow() {
        return quantity.compareTo(reorderLevel) <= 0;
    }
}
