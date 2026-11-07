package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One line of a sale — FR-POS-09, BR-5, BR-10.
 *
 * <p>Immutable once written. The unit the cashier chose and the base-unit
 * quantity are both kept: the receipt has to say "1 Drum 100m" while the ledger
 * moves 100 m, and deriving either from the other later loses what was sold.
 */
@Entity
@Table(name = "sale_item")
public class SaleItem {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sale_id", nullable = false)
    private Sale sale;

    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "selected_unit", nullable = false, updatable = false)
    private String selectedUnit;

    @Column(name = "conversion_factor", nullable = false, updatable = false)
    private BigDecimal conversionFactor;

    @Column(name = "quantity", nullable = false, updatable = false)
    private BigDecimal quantity;

    @Column(name = "quantity_base", nullable = false, updatable = false)
    private BigDecimal quantityBase;

    @Column(name = "unit_price", nullable = false, updatable = false)
    private BigDecimal unitPrice;

    /** BR-11: pesewas. */
    @Column(name = "discount", nullable = false, updatable = false)
    private long discount;

    @Column(name = "line_total", nullable = false, updatable = false)
    private long lineTotal;

    /** BR-5: frozen at the moment of sale. */
    @Column(name = "frozen_cost_price", nullable = false, updatable = false)
    private BigDecimal frozenCostPrice = BigDecimal.ZERO;

    /** BR-10: who authorised going below the floor on this line. */
    @Column(name = "floor_approved_by", updatable = false)
    private UUID floorApprovedBy;

    /**
     * FR-POS-10: how much of {@link #discount} came from a concession given
     * against the whole cart rather than against this line.
     *
     * <p>The remainder was given on this line alone. Both are needed to report
     * honestly: a cashier marking one item down and a manager taking a figure
     * off the bill are different decisions, and the discount log should not
     * have to guess which it is looking at.
     */
    @Column(name = "cart_discount_share", nullable = false, updatable = false)
    private long cartDiscountShare;

    /**
     * FR-POS-10 · FR-AUDIT-02: who authorised a discount past the seller's own
     * ceiling. Null when the discount was within it and needed nobody.
     */
    @Column(name = "discount_approved_by", updatable = false)
    private UUID discountApprovedBy;

    protected SaleItem() { }

    public SaleItem(UUID productId, String selectedUnit, BigDecimal conversionFactor, BigDecimal quantity,
                    BigDecimal quantityBase, BigDecimal unitPrice, long discount, long lineTotal,
                    BigDecimal frozenCostPrice, UUID floorApprovedBy, UUID discountApprovedBy,
                    long cartDiscountShare) {
        this.productId = productId;
        this.selectedUnit = selectedUnit;
        this.conversionFactor = conversionFactor;
        this.quantity = quantity;
        this.quantityBase = quantityBase;
        this.unitPrice = unitPrice;
        this.discount = discount;
        this.lineTotal = lineTotal;
        this.frozenCostPrice = frozenCostPrice;
        this.floorApprovedBy = floorApprovedBy;
        this.discountApprovedBy = discountApprovedBy;
        this.cartDiscountShare = cartDiscountShare;
    }

    void attachTo(Sale sale) { this.sale = sale; }

    public UUID getId() { return id; }
    public Sale getSale() { return sale; }
    public UUID getProductId() { return productId; }
    public String getSelectedUnit() { return selectedUnit; }
    public BigDecimal getConversionFactor() { return conversionFactor; }
    public BigDecimal getQuantity() { return quantity; }
    public BigDecimal getQuantityBase() { return quantityBase; }
    public BigDecimal getUnitPrice() { return unitPrice; }
    public long getDiscount() { return discount; }
    public long getLineTotal() { return lineTotal; }
    public BigDecimal getFrozenCostPrice() { return frozenCostPrice; }
    public UUID getFloorApprovedBy() { return floorApprovedBy; }
    public UUID getDiscountApprovedBy() { return discountApprovedBy; }
    public long getCartDiscountShare() { return cartDiscountShare; }
}
