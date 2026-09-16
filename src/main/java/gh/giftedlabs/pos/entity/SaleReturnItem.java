package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.ReturnDisposition;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One line coming back.
 *
 * <p>Carries the price the customer paid and the cost frozen on the original
 * sale line, both copied rather than looked up. Refunding at today's price loses
 * money on anything sold at a discount; reversing at today's average cost
 * restates the profit of a sale made months ago (BR-5).
 */
@Entity
@Table(name = "sale_return_item")
public class SaleReturnItem {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "return_id", nullable = false)
    private SaleReturn saleReturn;

    /** The line being returned — the cap on quantity, and the source of both prices. */
    @Column(name = "sale_item_id", nullable = false, updatable = false)
    private UUID saleItemId;

    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "quantity_base", nullable = false, precision = 14, scale = 3)
    private BigDecimal quantityBase;

    /** What was actually paid per base unit, discount included. */
    @Column(name = "unit_price", nullable = false, precision = 12, scale = 4)
    private BigDecimal unitPrice;

    @Column(name = "line_refund_pesewas", nullable = false)
    private long lineRefundPesewas;

    /** BR-5: copied from the original sale line, never recomputed. */
    @Column(name = "frozen_cost_price", nullable = false, precision = 12, scale = 4)
    private BigDecimal frozenCostPrice;

    @Column(name = "reason", nullable = false)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(name = "disposition", nullable = false)
    private ReturnDisposition disposition;

    @Column(name = "condition_notes")
    private String conditionNotes;

    protected SaleReturnItem() { }

    public SaleReturnItem(UUID saleItemId, UUID productId, String productName,
                          BigDecimal quantityBase, BigDecimal unitPrice, long lineRefundPesewas,
                          BigDecimal frozenCostPrice, String reason, ReturnDisposition disposition) {
        this.saleItemId = saleItemId;
        this.productId = productId;
        this.productName = productName;
        this.quantityBase = quantityBase;
        this.unitPrice = unitPrice;
        this.lineRefundPesewas = lineRefundPesewas;
        this.frozenCostPrice = frozenCostPrice;
        this.reason = reason;
        this.disposition = disposition;
    }

    void attachTo(SaleReturn saleReturn) {
        this.saleReturn = saleReturn;
    }

    public UUID getId() { return id; }
    public UUID getSaleItemId() { return saleItemId; }
    public UUID getProductId() { return productId; }
    public String getProductName() { return productName; }
    public BigDecimal getQuantityBase() { return quantityBase; }
    public BigDecimal getUnitPrice() { return unitPrice; }
    public long getLineRefundPesewas() { return lineRefundPesewas; }
    public BigDecimal getFrozenCostPrice() { return frozenCostPrice; }
    public String getReason() { return reason; }
    public ReturnDisposition getDisposition() { return disposition; }
    public String getConditionNotes() { return conditionNotes; }

    public void setConditionNotes(String value) { this.conditionNotes = value; }
}
