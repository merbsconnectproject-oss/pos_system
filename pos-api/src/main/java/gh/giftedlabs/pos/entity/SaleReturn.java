package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Goods coming back — a credit note against a sale.
 *
 * <p>Not a void. A void (BR-3) cancels a sale that should never have happened;
 * this is a later event against a sale that was correct, and it may cover only
 * some of the lines. Both write reversing movements and neither deletes
 * anything, but a shop must be able to refund two of five items without
 * cancelling the sale that correctly recorded the other three.
 *
 * <p>Immutable once written, like a sale. A return that could be edited would
 * let the refunded amount drift away from the money that left the drawer.
 */
@Entity
@Table(name = "sale_return")
public class SaleReturn {

    public enum Kind {
        /** Money goes back. */
        REFUND,
        /** Value is settled against replacement goods, sold as their own sale. */
        EXCHANGE
    }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @Column(name = "return_number", nullable = false, updatable = false)
    private String returnNumber;

    @Column(name = "original_sale_id", nullable = false, updatable = false)
    private UUID originalSaleId;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "terminal_id")
    private UUID terminalId;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, updatable = false)
    private Kind kind;

    /** BR-11: pesewas, at the price the customer paid. */
    @Column(name = "refund_total_pesewas", nullable = false)
    private long refundTotalPesewas;

    @Column(name = "exchange_sale_id")
    private UUID exchangeSaleId;

    /** Positive: the customer paid the difference. Negative: the shop did. */
    @Column(name = "settlement_pesewas", nullable = false)
    private long settlementPesewas;

    @Column(name = "refund_method")
    private String refundMethod;

    @Column(name = "customer_id")
    private UUID customerId;

    @Column(name = "notes")
    private String notes;

    @Column(name = "cashier_id", nullable = false, updatable = false)
    private UUID cashierId;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @OneToMany(mappedBy = "saleReturn", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SaleReturnItem> items = new ArrayList<>();

    protected SaleReturn() { }

    public SaleReturn(String returnNumber, UUID originalSaleId, UUID outletId, UUID terminalId,
                      Kind kind, UUID cashierId, Instant at) {
        this.returnNumber = returnNumber;
        this.originalSaleId = originalSaleId;
        this.outletId = outletId;
        this.terminalId = terminalId;
        this.kind = kind;
        this.cashierId = cashierId;
        this.createdAt = at;
    }

    public UUID getId() { return id; }
    public String getReturnNumber() { return returnNumber; }
    public UUID getOriginalSaleId() { return originalSaleId; }
    public UUID getOutletId() { return outletId; }
    public UUID getTerminalId() { return terminalId; }
    public Kind getKind() { return kind; }
    public long getRefundTotalPesewas() { return refundTotalPesewas; }
    public UUID getExchangeSaleId() { return exchangeSaleId; }
    public long getSettlementPesewas() { return settlementPesewas; }
    public String getRefundMethod() { return refundMethod; }
    public UUID getCustomerId() { return customerId; }
    public String getNotes() { return notes; }
    public UUID getCashierId() { return cashierId; }
    public UUID getApprovedBy() { return approvedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public List<SaleReturnItem> getItems() { return items; }

    public void setRefundTotalPesewas(long value) { this.refundTotalPesewas = value; }
    public void setExchangeSaleId(UUID value) { this.exchangeSaleId = value; }
    public void setSettlementPesewas(long value) { this.settlementPesewas = value; }
    public void setRefundMethod(String value) { this.refundMethod = value; }
    public void setCustomerId(UUID value) { this.customerId = value; }
    public void setNotes(String value) { this.notes = value; }
    public void setApprovedBy(UUID value) { this.approvedBy = value; }

    public void addItem(SaleReturnItem item) {
        item.attachTo(this);
        items.add(item);
    }

    /**
     * The money that leaves the drawer, if any.
     *
     * <p>The same for a refund and an exchange: the customer is paid back for what
     * they brought in. An exchange then rings the replacement up as an ordinary
     * sale, which takes its own payment, so the drawer nets to the difference the
     * customer actually hands over — GH₵50 in for the new lamp, GH₵30 back for
     * the old one, GH₵20 net.
     *
     * <p>Paying out only the shortfall would leave the replacement sale recorded
     * as paid in full with nothing returned for the goods that came back, so the
     * customer would have been charged twice.
     */
    public long cashOutPesewas() {
        return "CASH".equals(refundMethod) ? refundTotalPesewas : 0;
    }
}
