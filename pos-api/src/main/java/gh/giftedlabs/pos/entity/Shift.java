package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A cashier's turn at a till — FR-CASH, BR-13, BR-14.
 *
 * <p>The unit a day's takings are counted in. A closed shift is never reopened:
 * FR-CASH-09 makes a correction another cash movement, so what was counted at
 * the time stays what was counted.
 */
@Entity
@Table(name = "shift")
public class Shift {

    public enum Status { OPEN, CLOSED }

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "terminal_id", nullable = false, updatable = false)
    private UUID terminalId;

    @Column(name = "cashier_id", nullable = false, updatable = false)
    private UUID cashierId;

    /** BR-14: what the drawer started with. */
    @Column(name = "opening_float", nullable = false, updatable = false)
    private long openingFloat;

    @Column(name = "opened_at", nullable = false, updatable = false)
    private Instant openedAt = Instant.now();

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private Status status = Status.OPEN;

    /** FR-CASH-04: what the cashier counted, submitted before seeing the expectation. */
    @Column(name = "counted_cash")
    private Long countedCash;

    @Column(name = "expected_cash")
    private Long expectedCash;

    /** FR-CASH-05: recorded against the cashier, never absorbed. */
    @Column(name = "variance")
    private Long variance;

    @Column(name = "variance_note")
    private String varianceNote;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "closed_by")
    private UUID closedBy;

    /** Closed by the end-of-day scheduler without inventing a physical count. */
    @Column(name = "automatically_closed", nullable = false)
    private boolean automaticallyClosed;

    @OneToMany(mappedBy = "shift", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("createdAt ASC")
    private List<CashMovement> cashMovements = new ArrayList<>();

    protected Shift() { }

    public Shift(UUID outletId, UUID terminalId, UUID cashierId, long openingFloat, Instant openedAt) {
        this.outletId = outletId;
        this.terminalId = terminalId;
        this.cashierId = cashierId;
        this.openingFloat = openingFloat;
        this.openedAt = openedAt;
    }

    public UUID getId() { return id; }
    public UUID getOutletId() { return outletId; }
    public UUID getTerminalId() { return terminalId; }
    public UUID getCashierId() { return cashierId; }
    public long getOpeningFloat() { return openingFloat; }
    public Instant getOpenedAt() { return openedAt; }
    public Status getStatus() { return status; }
    public Long getCountedCash() { return countedCash; }
    public Long getExpectedCash() { return expectedCash; }
    public Long getVariance() { return variance; }
    public String getVarianceNote() { return varianceNote; }
    public Instant getClosedAt() { return closedAt; }
    public UUID getClosedBy() { return closedBy; }
    public boolean isAutomaticallyClosed() { return automaticallyClosed; }
    public List<CashMovement> getCashMovements() { return List.copyOf(cashMovements); }

    public boolean isOpen() { return status == Status.OPEN; }

    public void addCashMovement(CashMovement movement) {
        if (!isOpen()) {
            throw new IllegalStateException("A closed shift takes no further cash movements");
        }
        movement.attachTo(this);
        cashMovements.add(movement);
    }

    /** The net of everything paid in or out by hand during the shift. */
    public long netCashMovements() {
        return cashMovements.stream().mapToLong(CashMovement::getAmount).sum();
    }

    /**
     * FR-CASH-04/05 · BR-14: close on a blind count.
     *
     * <p>The caller supplies what was counted and what the system expected; the
     * variance is the difference and is stored, never applied. Absorbing it —
     * adjusting the expectation to match the count — would make every drawer
     * balance and the figure worthless.
     */
    public void close(long counted, long expected, String note, UUID actorId, Instant at) {
        if (!isOpen()) throw new IllegalStateException("This shift is already closed");

        this.countedCash = counted;
        this.expectedCash = expected;
        this.variance = counted - expected;
        this.varianceNote = note;
        this.status = Status.CLOSED;
        this.closedAt = at;
        this.closedBy = actorId;
    }

    /**
     * End the trading session without claiming that somebody counted cash.
     * Expected cash is retained for reconciliation; count and variance stay
     * null because no physical observation took place.
     */
    public void closeAutomatically(long expected, String note, Instant at) {
        if (!isOpen()) throw new IllegalStateException("This shift is already closed");

        this.expectedCash = expected;
        this.varianceNote = note;
        this.status = Status.CLOSED;
        this.closedAt = at;
        this.closedBy = null;
        this.automaticallyClosed = true;
    }
}
