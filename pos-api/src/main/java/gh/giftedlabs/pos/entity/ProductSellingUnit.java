package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A unit a product may be sold in — FR-UOM-02, FR-UOM-04.
 *
 * <p>The price is the unit's own, not a multiple of the base price: a drum of
 * cable is normally cheaper per metre than a cut length, and FR-UOM-04 exists
 * so that discount can be expressed without a rule.
 */
@Entity
@Table(name = "product_selling_unit")
public class ProductSellingUnit {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @NotBlank
    @Column(name = "name", nullable = false)
    private String name;

    /** How many base units one of these is — FR-UOM-02. Drum 100m = 100. */
    @Positive
    @Column(name = "conversion_factor", nullable = false)
    private BigDecimal conversionFactor;

    @Column(name = "price", nullable = false)
    private BigDecimal price;

    @Column(name = "trade_price")
    private BigDecimal tradePrice;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected ProductSellingUnit() { }

    public ProductSellingUnit(String name, BigDecimal conversionFactor, BigDecimal price, BigDecimal tradePrice, int sortOrder) {
        this.name = name;
        this.conversionFactor = conversionFactor;
        this.price = price;
        this.tradePrice = tradePrice;
        this.sortOrder = sortOrder;
    }

    void attachTo(Product product) { this.product = product; }

    public UUID getId() { return id; }
    public Product getProduct() { return product; }
    public String getName() { return name; }
    public BigDecimal getConversionFactor() { return conversionFactor; }
    public BigDecimal getPrice() { return price; }
    public BigDecimal getTradePrice() { return tradePrice; }
    public int getSortOrder() { return sortOrder; }
}
