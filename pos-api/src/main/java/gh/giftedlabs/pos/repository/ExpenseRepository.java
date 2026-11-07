package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Expense;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Operating expenses. */
public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    /**
     * The screen's list: a period, optionally one outlet, live rows only.
     *
     * <p>An outlet filter that matches {@code outlet_id is null} as well, because
     * a licence covering both branches is a cost either shop's P&L has to carry
     * a view of — omitting it would make the two outlet P&Ls sum to less than
     * the business.
     */
    @Query("""
           select e from Expense e
            where e.voided = false
              and (:from is null or e.spentOn >= :from)
              and (:to   is null or e.spentOn <= :to)
              and (:outletId is null or e.outletId = :outletId or e.outletId is null)
            order by e.spentOn desc, e.createdAt desc
           """)
    List<Expense> list(@Param("from") LocalDate from,
                       @Param("to") LocalDate to,
                       @Param("outletId") UUID outletId,
                       Pageable page);
}
