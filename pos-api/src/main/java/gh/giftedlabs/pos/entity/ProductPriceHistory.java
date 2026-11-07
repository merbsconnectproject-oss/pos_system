package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * What a product's prices were, and who changed them — FR-PROD-09.
 *
 * <p>Append-only at the database boundary, for the same reason as the audit
 * log: a history that can be rewritten is not a history.
 */
@Entity
@Table(name = "product_price_history")
public class ProductPriceHistory {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "retail_price", nullable = false, updatable = false)
    private BigDecimal retailPrice;

    @Column(name = "trade_price", nullable = false, updatable = false)
    private BigDecimal tradePrice;

    @Column(name = "floor_price", nullable = false, updatable = false)
    private BigDecimal floorPrice;

    @Column(name = "changed_by", updatable = false)
    private UUID changedBy;

    @Column(name = "changed_at", nullable = false, updatable = false)
    private Instant changedAt = Instant.now();

    protected ProductPriceHistory() { }

    public ProductPriceHistory(UUID productId, BigDecimal retail, BigDecimal trade, BigDecimal floor,
                               UUID changedBy, Instant changedAt) {
        this.productId = productId;
        this.retailPrice = retail;
        this.tradePrice = trade;
        this.floorPrice = floor;
        this.changedBy = changedBy;
        this.changedAt = changedAt;
    }

    public UUID getId() { return id; }
    public UUID getProductId() { return productId; }
    public BigDecimal getRetailPrice() { return retailPrice; }
    public BigDecimal getTradePrice() { return tradePrice; }
    public BigDecimal getFloorPrice() { return floorPrice; }
    public UUID getChangedBy() { return changedBy; }
    public Instant getChangedAt() { return changedAt; }
}
