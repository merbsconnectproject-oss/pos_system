package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.PaymentMethod;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * One tender against a sale — FR-PAY-01…04, BR-7.
 *
 * <p>The id comes from the client. FR-PAY-07 requires a resubmitted payment to
 * be rejected, and a primary key does that without a check that two concurrent
 * requests could both pass.
 */
@Entity
@Table(name = "payment")
public class Payment {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sale_id", nullable = false)
    private Sale sale;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "method", nullable = false, updatable = false)
    private PaymentMethod method;

    /** BR-11: pesewas. */
    @Column(name = "amount", nullable = false, updatable = false)
    private long amount;

    @Column(name = "provider", updatable = false)
    private String provider;

    /** FR-PAY-03: the MoMo or card reference the cashier read back. */
    @Column(name = "reference", updatable = false)
    private String reference;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Payment() { }

    public Payment(UUID id, PaymentMethod method, long amount, String provider, String reference) {
        this.id = id;
        this.method = method;
        this.amount = amount;
        this.provider = provider;
        this.reference = reference;
    }

    void attachTo(Sale sale) { this.sale = sale; }

    public UUID getId() { return id; }
    public Sale getSale() { return sale; }
    public PaymentMethod getMethod() { return method; }
    public long getAmount() { return amount; }
    public String getProvider() { return provider; }
    public String getReference() { return reference; }
    public Instant getCreatedAt() { return createdAt; }
}
