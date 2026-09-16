package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.InstallmentFrequency;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A customer paying over time.
 *
 * <p>The balance is never stored. It is the total, less the down payment, less
 * what the schedule has received — arithmetic over recorded facts, so it cannot
 * drift from the payments the way a cached figure does the first time something
 * fails between writing a payment and updating a total.
 */
@Entity
@Table(name = "installment_plan")
public class InstallmentPlan {

    public enum Status { ACTIVE, COMPLETED, DEFAULTED }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @Column(name = "plan_number", nullable = false, updatable = false)
    private String planNumber;

    @Column(name = "customer_id", nullable = false, updatable = false)
    private UUID customerId;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "sale_id")
    private UUID saleId;

    @Column(name = "total_pesewas", nullable = false)
    private long totalPesewas;

    @Column(name = "down_payment_pesewas", nullable = false)
    private long downPaymentPesewas;

    @Enumerated(EnumType.STRING)
    @Column(name = "frequency", nullable = false)
    private InstallmentFrequency frequency;

    @Column(name = "installment_count", nullable = false)
    private int installmentCount;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.ACTIVE;

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    /**
     * Cascaded, because a schedule has no meaning apart from its plan and an
     * orphaned one would be a debt nobody is owed.
     */
    @OneToMany(mappedBy = "plan", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("installmentNumber asc")
    private List<InstallmentScheduleItem> schedule = new ArrayList<>();

    @OneToMany(mappedBy = "plan", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InstallmentPlanItem> items = new ArrayList<>();

    protected InstallmentPlan() { }

    public InstallmentPlan(String planNumber, UUID customerId, UUID outletId, long totalPesewas,
                           long downPaymentPesewas, InstallmentFrequency frequency,
                           int installmentCount, LocalDate startDate, UUID createdBy, Instant at) {
        this.planNumber = planNumber;
        this.customerId = customerId;
        this.outletId = outletId;
        this.totalPesewas = totalPesewas;
        this.downPaymentPesewas = downPaymentPesewas;
        this.frequency = frequency;
        this.installmentCount = installmentCount;
        this.startDate = startDate;
        this.createdBy = createdBy;
        this.createdAt = at;
        this.updatedAt = at;
    }

    public UUID getId() { return id; }
    public String getPlanNumber() { return planNumber; }
    public UUID getCustomerId() { return customerId; }
    public UUID getOutletId() { return outletId; }
    public UUID getSaleId() { return saleId; }
    public long getTotalPesewas() { return totalPesewas; }
    public long getDownPaymentPesewas() { return downPaymentPesewas; }
    public InstallmentFrequency getFrequency() { return frequency; }
    public int getInstallmentCount() { return installmentCount; }
    public LocalDate getStartDate() { return startDate; }
    public Status getStatus() { return status; }
    public String getNotes() { return notes; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public List<InstallmentScheduleItem> getSchedule() { return schedule; }
    public List<InstallmentPlanItem> getItems() { return items; }

    public void setSaleId(UUID value) { this.saleId = value; }
    public void setNotes(String value) { this.notes = value; }
    public void touch(Instant at) { this.updatedAt = at; }

    public void addScheduleItem(InstallmentScheduleItem item) {
        item.attachTo(this);
        schedule.add(item);
    }

    public void addItem(InstallmentPlanItem item) {
        item.attachTo(this);
        items.add(item);
    }

    /** What the schedule has received. */
    public long paidPesewas() {
        return schedule.stream().mapToLong(InstallmentScheduleItem::getPaidPesewas).sum();
    }

    /** Total, less the down payment, less what has been paid. Never stored. */
    public long outstandingPesewas() {
        return totalPesewas - downPaymentPesewas - paidPesewas();
    }

    /**
     * COMPLETED the moment nothing is left, and not before.
     *
     * <p>Driven by the balance rather than by every installment being marked
     * PAID, because a customer who settles early has paid in full with rows still
     * reading PENDING.
     */
    public void recomputeStatus() {
        if (status == Status.DEFAULTED) return;
        status = outstandingPesewas() <= 0 ? Status.COMPLETED : Status.ACTIVE;
    }

    /** A decision the shop makes, not a date arriving. */
    public void markDefaulted() {
        this.status = Status.DEFAULTED;
    }

    public void reinstate() {
        this.status = Status.ACTIVE;
        recomputeStatus();
    }
}
