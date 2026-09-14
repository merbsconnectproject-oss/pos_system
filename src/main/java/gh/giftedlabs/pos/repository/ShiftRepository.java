package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Shift;
import gh.giftedlabs.pos.rules.PaymentMethod;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Shifts — FR-CASH, BR-13.
 *
 * <p>Statuses are bound as parameters rather than written as JPQL literals: a
 * nested enum spelled {@code Shift$Status.OPEN} is not something Hibernate
 * resolves, and it fails at runtime rather than compile time.
 */
public interface ShiftRepository extends JpaRepository<Shift, UUID> {

    /** BR-13: a user has at most one open shift. */
    Optional<Shift> findByCashierIdAndStatus(UUID cashierId, Shift.Status status);

    /** BR-13: so does a till. */
    Optional<Shift> findByTerminalIdAndStatus(UUID terminalId, Shift.Status status);

    default Optional<Shift> findOpenForCashier(UUID cashierId) {
        return findByCashierIdAndStatus(cashierId, Shift.Status.OPEN);
    }

    default Optional<Shift> findOpenForTerminal(UUID terminalId) {
        return findByTerminalIdAndStatus(terminalId, Shift.Status.OPEN);
    }

    @Query("""
           select s from Shift s
            where (:outletId is null or s.outletId = :outletId)
              and (:cashierId is null or s.cashierId = :cashierId)
            order by s.openedAt desc
           """)
    List<Shift> recent(@Param("outletId") UUID outletId,
                       @Param("cashierId") UUID cashierId,
                       Pageable pageable);

    /**
     * BR-14: cash taken on sales rung up during this shift.
     *
     * <p>Summed from the payments rather than kept as a running total on the
     * shift. A stored total is a second record of what the payments already
     * say, and after one void only one of them can be right.
     */
    @Query("""
           select coalesce(sum(p.amount), 0) from Sale sale join sale.payments p
            where sale.shiftId = :shiftId
              and p.method = :method
              and sale.status = :status
           """)
    long takingsBy(@Param("shiftId") UUID shiftId,
                   @Param("method") PaymentMethod method,
                   @Param("status") gh.giftedlabs.pos.entity.Sale.Status status);

    default long cashTakenDuring(UUID shiftId) {
        return takingsBy(shiftId, PaymentMethod.cash, gh.giftedlabs.pos.entity.Sale.Status.COMPLETED);
    }

    /** FR-CASH-07: what came in by every other method, for reconciliation. */
    @Query("""
           select p.method, coalesce(sum(p.amount), 0) from Sale sale join sale.payments p
            where sale.shiftId = :shiftId and sale.status = :status
            group by p.method
           """)
    List<Object[]> takingsByMethod(@Param("shiftId") UUID shiftId,
                                   @Param("status") gh.giftedlabs.pos.entity.Sale.Status status);

    default List<Object[]> takingsByMethod(UUID shiftId) {
        return takingsByMethod(shiftId, gh.giftedlabs.pos.entity.Sale.Status.COMPLETED);
    }

    /** FR-CASH-08: how much was rung up, and how many receipts. */
    /**
     * A multi-column projection comes back as a list of rows even when there is
     * only ever one — declaring it as a bare {@code Object[]} yields
     * {@code Object[][]} and casts blow up at read time.
     */
    @Query("""
           select count(s), coalesce(sum(s.total), 0) from Sale s
            where s.shiftId = :shiftId and s.status = :status
           """)
    List<Object[]> salesSummary(@Param("shiftId") UUID shiftId,
                                @Param("status") gh.giftedlabs.pos.entity.Sale.Status status);

    default Object[] salesSummary(UUID shiftId) {
        List<Object[]> rows = salesSummary(shiftId, gh.giftedlabs.pos.entity.Sale.Status.COMPLETED);
        return rows.isEmpty() ? new Object[] {0L, 0L} : rows.getFirst();
    }
}
