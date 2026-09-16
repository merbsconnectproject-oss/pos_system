package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/** A parked cart, deliberately separate from a committed sale. */
@Entity
@Table(name = "held_sale")
public class HeldSale {
    @Id @GeneratedValue
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;
    @Column(name = "terminal_id")
    private UUID terminalId;
    @Column(name = "cashier_id", nullable = false, updatable = false)
    private UUID cashierId;
    @Column(nullable = false, length = 160)
    private String label;
    @Column(name = "customer_id")
    private UUID customerId;
    @Column(name = "customer_name", length = 200)
    private String customerName;
    @Column(name = "customer_phone", length = 40)
    private String customerPhone;
    @Column(nullable = false)
    private long total;
    /**
     * The parked cart, as JSON.
     *
     * <p>{@code @JdbcTypeCode(JSON)} is load-bearing, not decoration.
     * {@code columnDefinition} only tells Hibernate what to write if it ever
     * generated the schema — Flyway owns DDL here, so it did nothing, and the
     * driver sent a {@code varchar} into a {@code jsonb} column. Postgres refuses
     * that outright, so holding a sale failed with a 500 every single time and
     * the feature had never once worked.
     *
     * <p>Kept as jsonb rather than text so the column stays queryable: "which
     * parked carts contain this product" is a question somebody will ask.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cart_json", nullable = false, columnDefinition = "jsonb")
    private String cartJson;
    @Column(name = "held_at", nullable = false, updatable = false)
    private Instant heldAt = Instant.now();

    protected HeldSale() { }

    public HeldSale(UUID outletId, UUID terminalId, UUID cashierId, String label,
                    UUID customerId, String customerName, String customerPhone,
                    long total, String cartJson) {
        this.outletId = outletId;
        this.terminalId = terminalId;
        this.cashierId = cashierId;
        this.label = label;
        this.customerId = customerId;
        this.customerName = customerName;
        this.customerPhone = customerPhone;
        this.total = total;
        this.cartJson = cartJson;
    }

    public UUID getId() { return id; }
    public UUID getOutletId() { return outletId; }
    public UUID getTerminalId() { return terminalId; }
    public UUID getCashierId() { return cashierId; }
    public String getLabel() { return label; }
    public UUID getCustomerId() { return customerId; }
    public String getCustomerName() { return customerName; }
    public String getCustomerPhone() { return customerPhone; }
    public long getTotal() { return total; }
    public String getCartJson() { return cartJson; }
    public Instant getHeldAt() { return heldAt; }
}
