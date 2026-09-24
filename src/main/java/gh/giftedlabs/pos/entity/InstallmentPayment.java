package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One immutable collection against an installment plan, and its receipt. */
@Entity
@Table(name = "installment_payment")
public class InstallmentPayment {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_id", nullable = false, updatable = false)
    private InstallmentPlan plan;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "receipt_number", nullable = false, updatable = false, unique = true)
    private String receiptNumber;

    @Column(name = "amount_pesewas", nullable = false, updatable = false)
    private long amountPesewas;

    /** Frozen because an old receipt must show the balance at that payment. */
    @Column(name = "balance_after_pesewas", nullable = false, updatable = false)
    private long balanceAfterPesewas;

    @Column(name = "received_on", nullable = false, updatable = false)
    private LocalDate receivedOn;

    @Column(name = "payment_method", nullable = false, updatable = false)
    private String paymentMethod;

    @Column(name = "reference", updatable = false)
    private String reference;

    @Column(name = "received_by", updatable = false)
    private UUID receivedBy;

    @Column(name = "cashier_name", nullable = false, updatable = false)
    private String cashierName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "synced_at")
    private Instant syncedAt;

    protected InstallmentPayment() { }

    public InstallmentPayment(UUID outletId, String receiptNumber, long amountPesewas,
                              long balanceAfterPesewas, LocalDate receivedOn,
                              String paymentMethod, String reference, UUID receivedBy,
                              String cashierName, Instant createdAt) {
        this.outletId = outletId;
        this.receiptNumber = receiptNumber;
        this.amountPesewas = amountPesewas;
        this.balanceAfterPesewas = balanceAfterPesewas;
        this.receivedOn = receivedOn;
        this.paymentMethod = paymentMethod;
        this.reference = reference;
        this.receivedBy = receivedBy;
        this.cashierName = cashierName;
        this.createdAt = createdAt;
    }

    void attachTo(InstallmentPlan plan) { this.plan = plan; }

    public UUID getId() { return id; }
    public UUID getOutletId() { return outletId; }
    public String getReceiptNumber() { return receiptNumber; }
    public long getAmountPesewas() { return amountPesewas; }
    public long getBalanceAfterPesewas() { return balanceAfterPesewas; }
    public LocalDate getReceivedOn() { return receivedOn; }
    public String getPaymentMethod() { return paymentMethod; }
    public String getReference() { return reference; }
    public UUID getReceivedBy() { return receivedBy; }
    public String getCashierName() { return cashierName; }
    public Instant getCreatedAt() { return createdAt; }
}
