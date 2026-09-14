package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One product on a delivery — FR-SUP-03, FR-UOM-05.
 *
 * <p>The purchase unit and its conversion factor are both stored. The factor is
 * copied rather than read from the product at display time, so a receipt still
 * reads as it was written after someone edits the product's units — the
 * document says what was actually delivered that day.
 */
@Entity
@Table(name = "goods_receipt_line")
public class GoodsReceiptLine {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receipt_id", nullable = false)
    private GoodsReceipt receipt;

    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "purchase_unit", nullable = false, updatable = false)
    private String purchaseUnit;

    @Column(name = "conversion_factor", nullable = false, updatable = false)
    private BigDecimal conversionFactor;

    /** In purchase units — 3 drums, not 300 metres. */
    @Column(name = "quantity", nullable = false, updatable = false)
    private BigDecimal quantity;

    /** What one purchase unit cost. */
    @Column(name = "unit_cost", nullable = false, updatable = false)
    private BigDecimal unitCost;

    protected GoodsReceiptLine() { }

    public GoodsReceiptLine(UUID productId, String purchaseUnit, BigDecimal conversionFactor,
                            BigDecimal quantity, BigDecimal unitCost) {
        this.productId = productId;
        this.purchaseUnit = purchaseUnit;
        this.conversionFactor = conversionFactor;
        this.quantity = quantity;
        this.unitCost = unitCost;
    }

    void attachTo(GoodsReceipt receipt) { this.receipt = receipt; }

    public UUID getId() { return id; }
    public GoodsReceipt getReceipt() { return receipt; }
    public UUID getProductId() { return productId; }
    public String getPurchaseUnit() { return purchaseUnit; }
    public BigDecimal getConversionFactor() { return conversionFactor; }
    public BigDecimal getQuantity() { return quantity; }
    public BigDecimal getUnitCost() { return unitCost; }

    /** FR-UOM-05: 3 drums of 100 m is 300 m of stock. */
    public BigDecimal quantityInBaseUnits() {
        return quantity.multiply(conversionFactor);
    }
}
