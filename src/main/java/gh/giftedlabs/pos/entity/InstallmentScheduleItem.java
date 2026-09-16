package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One due installment.
 *
 * <p>{@code OVERDUE} is deliberately not a stored status. Whether an installment
 * is late is today's date against {@link #dueDate}, and a stored flag would be
 * wrong every morning until something ran to refresh it — exactly the class of
 * bug where a screen shows nothing overdue because the job that marks them
 * failed quietly.
 */
@Entity
@Table(name = "installment_schedule_item")
public class InstallmentScheduleItem {

    public enum Status { PENDING, PARTIAL, PAID }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_id", nullable = false)
    private InstallmentPlan plan;

    @Column(name = "installment_number", nullable = false, updatable = false)
    private int installmentNumber;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "expected_pesewas", nullable = false)
    private long expectedPesewas;

    @Column(name = "paid_pesewas", nullable = false)
    private long paidPesewas;

    @Column(name = "paid_on")
    private LocalDate paidOn;

    @Column(name = "payment_method")
    private String paymentMethod;

    @Column(name = "reference")
    private String reference;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private Status status = Status.PENDING;

    protected InstallmentScheduleItem() { }

    public InstallmentScheduleItem(int installmentNumber, LocalDate dueDate, long expectedPesewas) {
        this.installmentNumber = installmentNumber;
        this.dueDate = dueDate;
        this.expectedPesewas = expectedPesewas;
    }

    void attachTo(InstallmentPlan plan) {
        this.plan = plan;
    }

    public UUID getId() { return id; }
    public int getInstallmentNumber() { return installmentNumber; }
    public LocalDate getDueDate() { return dueDate; }
    public long getExpectedPesewas() { return expectedPesewas; }
    public long getPaidPesewas() { return paidPesewas; }
    public LocalDate getPaidOn() { return paidOn; }
    public String getPaymentMethod() { return paymentMethod; }
    public String getReference() { return reference; }
    public Status getStatus() { return status; }

    /** What is still wanted against this installment. Never negative. */
    public long remainingPesewas() {
        return Math.max(0, expectedPesewas - paidPesewas);
    }

    /** True when it is late — computed, never stored. */
    public boolean isOverdue(LocalDate today) {
        return status != Status.PAID && dueDate.isBefore(today);
    }

    /**
     * Applies money to this installment.
     *
     * <p>Accumulates rather than replaces: half of an installment today and half
     * next week is ordinary, and a row that could only be paid or not would lose
     * the first half.
     */
    public void apply(long amountPesewas, LocalDate on, String method, String reference) {
        this.paidPesewas += amountPesewas;
        this.paidOn = on;
        this.paymentMethod = method;
        this.reference = reference;
        this.status = paidPesewas >= expectedPesewas ? Status.PAID
                : paidPesewas > 0 ? Status.PARTIAL : Status.PENDING;
    }
}
