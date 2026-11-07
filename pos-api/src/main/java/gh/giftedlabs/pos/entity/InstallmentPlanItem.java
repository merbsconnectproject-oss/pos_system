package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A line on an installment plan, frozen when the plan was agreed.
 *
 * <p>Carries its own name and price for the same reason {@code sale_item} does
 * (BR-5): renaming a product or repricing it must not rewrite what a customer
 * agreed to pay.
 */
@Entity
@Table(name = "installment_plan_item")
public class InstallmentPlanItem {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_id", nullable = false)
    private InstallmentPlan plan;

    @Column(name = "product_id")
    private UUID productId;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "quantity", nullable = false, precision = 14, scale = 3)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 12, scale = 4)
    private BigDecimal unitPrice;

    @Column(name = "line_total_pesewas", nullable = false)
    private long lineTotalPesewas;

    protected InstallmentPlanItem() { }

    public InstallmentPlanItem(UUID productId, String productName, BigDecimal quantity,
                               BigDecimal unitPrice, long lineTotalPesewas) {
        this.productId = productId;
        this.productName = productName;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.lineTotalPesewas = lineTotalPesewas;
    }

    void attachTo(InstallmentPlan plan) {
        this.plan = plan;
    }

    public UUID getId() { return id; }
    public UUID getProductId() { return productId; }
    public String getProductName() { return productName; }
    public BigDecimal getQuantity() { return quantity; }
    public BigDecimal getUnitPrice() { return unitPrice; }
    public long getLineTotalPesewas() { return lineTotalPesewas; }
}
