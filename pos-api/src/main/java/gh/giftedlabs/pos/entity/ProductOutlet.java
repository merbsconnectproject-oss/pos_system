package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * This outlet carries this product — the owner's assignment.
 *
 * <p>Separate from {@code stock_level}, which says how much is on the shelf.
 * A shop carries a line before its first delivery arrives, and setting a shop up
 * is precisely the act of saying so; deriving availability from stock meant the
 * owner could not assign anything until goods had already been received.
 *
 * <p>It is also what makes the overlapping lines work. One product, one id,
 * assigned to both shops — so "how much tape did the business sell" has an
 * answer, which it would not if each shop held its own record for the same item.
 */
@Entity
@Table(name = "product_outlet")
@IdClass(ProductOutlet.Key.class)
public class ProductOutlet {

    /** Composite key: a product is carried by an outlet at most once. */
    public record Key(UUID productId, UUID outletId) implements Serializable {
        public Key() { this(null, null); }
    }

    @Id
    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Id
    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt = Instant.now();

    @Column(name = "synced_at")
    private Instant syncedAt;

    protected ProductOutlet() { }

    public ProductOutlet(UUID productId, UUID outletId, Instant at) {
        this.productId = productId;
        this.outletId = outletId;
        this.assignedAt = at;
    }

    public UUID getProductId() { return productId; }
    public UUID getOutletId() { return outletId; }
    public Instant getAssignedAt() { return assignedAt; }
    public Instant getSyncedAt() { return syncedAt; }

    public void markSynced(Instant at) { this.syncedAt = at; }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof ProductOutlet that)) return false;
        return Objects.equals(productId, that.productId) && Objects.equals(outletId, that.outletId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(productId, outletId);
    }
}
