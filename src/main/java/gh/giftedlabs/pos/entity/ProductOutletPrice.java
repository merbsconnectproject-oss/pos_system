package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * FR-PRICE-03: what this branch charges, where it differs.
 *
 * <p>Each level is nullable and overridden on its own. Null means "use the
 * product's price", never "free" — which is why a row that overrides nothing
 * is refused by the schema rather than stored as a row saying nothing.
 */
@Entity
@Table(name = "product_outlet_price")
@IdClass(ProductOutletPrice.Key.class)
public class ProductOutletPrice {

    /** The pair is the identity: one override per product per branch. */
    public record Key(UUID productId, UUID outletId) implements Serializable {
        public Key() { this(null, null); }

        @Override public boolean equals(Object other) {
            return other instanceof Key key
                    && Objects.equals(productId, key.productId)
                    && Objects.equals(outletId, key.outletId);
        }

        @Override public int hashCode() { return Objects.hash(productId, outletId); }
    }

    @Id
    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Id
    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "retail_price")
    private BigDecimal retailPrice;

    @Column(name = "trade_price")
    private BigDecimal tradePrice;

    @Column(name = "floor_price")
    private BigDecimal floorPrice;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by")
    private UUID updatedBy;

    protected ProductOutletPrice() { }

    public ProductOutletPrice(UUID productId, UUID outletId) {
        this.productId = productId;
        this.outletId = outletId;
    }

    public UUID getProductId() { return productId; }
    public UUID getOutletId() { return outletId; }
    public BigDecimal getRetailPrice() { return retailPrice; }
    public BigDecimal getTradePrice() { return tradePrice; }
    public BigDecimal getFloorPrice() { return floorPrice; }
    public Instant getUpdatedAt() { return updatedAt; }
    public UUID getUpdatedBy() { return updatedBy; }

    public void set(BigDecimal retail, BigDecimal trade, BigDecimal floor, UUID actorId, Instant at) {
        this.retailPrice = retail;
        this.tradePrice = trade;
        this.floorPrice = floor;
        this.updatedBy = actorId;
        this.updatedAt = at;
    }

    /** True when every level has been cleared — the row should go, not linger. */
    public boolean isEmpty() {
        return retailPrice == null && tradePrice == null && floorPrice == null;
    }
}
