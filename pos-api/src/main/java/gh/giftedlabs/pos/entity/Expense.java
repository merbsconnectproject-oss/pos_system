package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.ExpenseCategory;
import gh.giftedlabs.pos.rules.ExpensePaymentMethod;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One operating expense — the accounting module's ledger line.
 *
 * <p>Not a {@link CashMovement}. That is the drawer, and it has to reconcile
 * against a blind count; rent paid by bank transfer never touches a till. The
 * two are kept apart for the same reason BR-2 keeps cash out of the stock
 * ledger — one table, one meaning.
 */
@Entity
@Table(name = "expense")
public class Expense {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    /**
     * When the money was spent, not when it was typed in.
     *
     * <p>A September P&L has to include rent somebody entered in October, so the
     * period query reads this and never {@code created_at}.
     */
    @Column(name = "spent_on", nullable = false)
    private LocalDate spentOn;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false)
    private ExpenseCategory category;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "description")
    private String description;

    /** BR-11: pesewas. */
    @Column(name = "amount_pesewas", nullable = false)
    private long amountPesewas;

    /** Null means the business as a whole rather than either shop. */
    @Column(name = "outlet_id")
    private UUID outletId;

    @Column(name = "payee", nullable = false)
    private String payee;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false)
    private ExpensePaymentMethod paymentMethod;

    @Column(name = "reference_number")
    private String referenceNumber;

    @Column(name = "tax_deductible", nullable = false)
    private boolean taxDeductible;

    /** PAID or PENDING. Pending is owed, not yet gone — the P&L counts it apart. */
    @Column(name = "status", nullable = false)
    private String status = "PAID";

    @Column(name = "recorded_by", nullable = false, updatable = false)
    private UUID recordedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "is_voided", nullable = false)
    private boolean voided;

    @Column(name = "voided_by")
    private UUID voidedBy;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @Column(name = "void_reason")
    private String voidReason;

    protected Expense() { }

    public Expense(LocalDate spentOn, ExpenseCategory category, String title, long amountPesewas,
                   UUID outletId, String payee, ExpensePaymentMethod paymentMethod, UUID recordedBy,
                   Instant at) {
        this.spentOn = spentOn;
        this.category = category;
        this.title = title;
        this.amountPesewas = amountPesewas;
        this.outletId = outletId;
        this.payee = payee;
        this.paymentMethod = paymentMethod;
        this.recordedBy = recordedBy;
        this.createdAt = at;
        this.updatedAt = at;
    }

    public UUID getId() { return id; }
    public LocalDate getSpentOn() { return spentOn; }
    public ExpenseCategory getCategory() { return category; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public long getAmountPesewas() { return amountPesewas; }
    public UUID getOutletId() { return outletId; }
    public String getPayee() { return payee; }
    public ExpensePaymentMethod getPaymentMethod() { return paymentMethod; }
    public String getReferenceNumber() { return referenceNumber; }
    public boolean isTaxDeductible() { return taxDeductible; }
    public String getStatus() { return status; }
    public UUID getRecordedBy() { return recordedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public boolean isVoided() { return voided; }
    public UUID getVoidedBy() { return voidedBy; }
    public Instant getVoidedAt() { return voidedAt; }
    public String getVoidReason() { return voidReason; }

    public void setSpentOn(LocalDate value) { this.spentOn = value; }
    public void setCategory(ExpenseCategory value) { this.category = value; }
    public void setTitle(String value) { this.title = value; }
    public void setDescription(String value) { this.description = value; }
    public void setAmountPesewas(long value) { this.amountPesewas = value; }
    public void setOutletId(UUID value) { this.outletId = value; }
    public void setPayee(String value) { this.payee = value; }
    public void setPaymentMethod(ExpensePaymentMethod value) { this.paymentMethod = value; }
    public void setReferenceNumber(String value) { this.referenceNumber = value; }
    public void setTaxDeductible(boolean value) { this.taxDeductible = value; }
    public void setStatus(String value) { this.status = value; }
    public void touch(Instant at) { this.updatedAt = at; }

    /**
     * A delete that keeps the row — BR-17 in spirit.
     *
     * <p>An expense that appeared on a P&L somebody filed has to keep existing,
     * or last month's statement stops reproducing. The reason is required so the
     * audit log records why a figure changed.
     */
    public void voidExpense(UUID actorId, String reason, Instant at) {
        this.voided = true;
        this.voidedBy = actorId;
        this.voidReason = reason;
        this.voidedAt = at;
        this.updatedAt = at;
    }
}
