package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A completed sale — FR-POS, BR-3, BR-7, BR-11.
 *
 * <p>The id is the client's. BR-7 requires that a double-click, a retry or a
 * reconnect cannot create a second sale, and the primary key enforces that
 * without any check two concurrent requests could both pass.
 *
 * <p>Immutable once written. The only change the database permits is a void,
 * which sets a reason and writes reversing stock movements — both records stay
 * visible, because a receipt the customer is holding must still exist.
 */
@Entity
@Table(name = "sale")
public class Sale {

    public enum Status { COMPLETED, VOIDED }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** BR-6: {OUTLET}-{TERMINAL}-{SEQ}. */
    @Column(name = "receipt_number", nullable = false, updatable = false, unique = true)
    private String receiptNumber;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "terminal_id", updatable = false)
    private UUID terminalId;

    @Column(name = "cashier_id", nullable = false, updatable = false)
    private UUID cashierId;

    /**
     * FR-POS-02 · BR-14: the shift this was rung up in.
     *
     * <p>Nullable because sales recorded before J existed have none, and
     * rewriting history to pretend otherwise would be worse than a gap.
     */
    @Column(name = "shift_id", updatable = false)
    private UUID shiftId;

    @Column(name = "customer_id", updatable = false)
    private UUID customerId;

    @Column(name = "customer_name", updatable = false)
    private String customerName;

    @Column(name = "customer_phone", updatable = false)
    private String customerPhone;

    /** BR-11: pesewas throughout. */
    @Column(name = "subtotal", nullable = false, updatable = false)
    private long subtotal;

    @Column(name = "discount_total", nullable = false, updatable = false)
    private long discountTotal;

    @Column(name = "total", nullable = false, updatable = false)
    private long total;

    @Column(name = "change_due", nullable = false, updatable = false)
    private long changeDue;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private Status status = Status.COMPLETED;

    @Column(name = "void_reason")
    private String voidReason;

    @Column(name = "voided_by")
    private UUID voidedBy;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<SaleItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<Payment> payments = new ArrayList<>();

    protected Sale() { }

    public Sale(UUID id, String receiptNumber, UUID outletId, UUID terminalId, UUID cashierId,
                long subtotal, long discountTotal, long total, long changeDue, Instant createdAt) {
        this.id = id;
        this.receiptNumber = receiptNumber;
        this.outletId = outletId;
        this.terminalId = terminalId;
        this.cashierId = cashierId;
        this.subtotal = subtotal;
        this.discountTotal = discountTotal;
        this.total = total;
        this.changeDue = changeDue;
        this.createdAt = createdAt;
    }

    public void setCustomer(UUID customerId, String name, String phone) {
        this.customerId = customerId;
        this.customerName = name;
        this.customerPhone = phone;
    }

    public UUID getId() { return id; }
    public String getReceiptNumber() { return receiptNumber; }
    public UUID getOutletId() { return outletId; }
    public UUID getTerminalId() { return terminalId; }
    public UUID getCashierId() { return cashierId; }
    public UUID getShiftId() { return shiftId; }
    public void assignShift(UUID shiftId) { this.shiftId = shiftId; }
    public UUID getCustomerId() { return customerId; }
    public String getCustomerName() { return customerName; }
    public String getCustomerPhone() { return customerPhone; }
    public long getSubtotal() { return subtotal; }
    public long getDiscountTotal() { return discountTotal; }
    public long getTotal() { return total; }
    public long getChangeDue() { return changeDue; }
    public Status getStatus() { return status; }
    public String getVoidReason() { return voidReason; }
    public UUID getVoidedBy() { return voidedBy; }
    public Instant getVoidedAt() { return voidedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public List<SaleItem> getItems() { return List.copyOf(items); }
    public List<Payment> getPayments() { return List.copyOf(payments); }

    public void addItem(SaleItem item) { item.attachTo(this); items.add(item); }

    public void addPayment(Payment payment) { payment.attachTo(this); payments.add(payment); }

    public boolean isVoided() { return status == Status.VOIDED; }

    /**
     * BR-3 · FR-POS-19: the only permitted change, and only once.
     *
     * <p>Voiding does not delete the sale or its lines. The caller writes the
     * reversing stock movements in the same transaction, so the ledger explains
     * the stock coming back.
     */
    public void voidSale(UUID actorId, String reason, Instant at) {
        if (status == Status.VOIDED) {
            throw new IllegalStateException("This sale is already voided");
        }
        this.status = Status.VOIDED;
        this.voidReason = reason;
        this.voidedBy = actorId;
        this.voidedAt = at;
    }
}
