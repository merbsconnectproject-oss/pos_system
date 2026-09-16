package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One product on an order — FR-SUP-08, FR-UOM-05.
 *
 * <p>Carries the purchase unit and its factor for the same reason a receipt line
 * does: you order 3 drums, and the order must still read as 3 drums after
 * somebody edits the product's units. Comparing a delivery against an order whose
 * units have shifted underneath it produces a variance that is arithmetic rather
 * than real.
 */
@Entity
@Table(name = "purchase_order_line")
public class PurchaseOrderLine {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "purchase_order_id", nullable = false)
    private PurchaseOrder order;

    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "purchase_unit", nullable = false, updatable = false)
    private String purchaseUnit;

    @Column(name = "conversion_factor", nullable = false, updatable = false)
    private BigDecimal conversionFactor;

    /** In purchase units — 3 drums, not 300 metres. */
    @Column(name = "quantity", nullable = false, updatable = false)
    private BigDecimal quantity;

    /** Agreed cost per purchase unit. What arrives may cost something else. */
    @Column(name = "unit_cost", nullable = false, updatable = false)
    private BigDecimal unitCost;

    protected PurchaseOrderLine() { }

    public PurchaseOrderLine(UUID productId, String purchaseUnit, BigDecimal conversionFactor,
                             BigDecimal quantity, BigDecimal unitCost) {
        this.productId = productId;
        this.purchaseUnit = purchaseUnit;
        this.conversionFactor = conversionFactor;
        this.quantity = quantity;
        this.unitCost = unitCost;
    }

    void attachTo(PurchaseOrder order) { this.order = order; }

    public UUID getId() { return id; }
    public PurchaseOrder getOrder() { return order; }
    public UUID getProductId() { return productId; }
    public String getPurchaseUnit() { return purchaseUnit; }
    public BigDecimal getConversionFactor() { return conversionFactor; }
    public BigDecimal getQuantity() { return quantity; }
    public BigDecimal getUnitCost() { return unitCost; }

    /** FR-UOM-05: 3 drums of 100 m is 300 m ordered. */
    public BigDecimal quantityInBaseUnits() {
        return quantity.multiply(conversionFactor);
    }

    /** What the line commits the shop to, before any delivery. */
    public BigDecimal lineTotal() {
        return quantity.multiply(unitCost);
    }
}
