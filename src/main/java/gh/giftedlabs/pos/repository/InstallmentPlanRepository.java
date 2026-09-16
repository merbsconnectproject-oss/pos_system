package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.InstallmentPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InstallmentPlanRepository extends JpaRepository<InstallmentPlan, UUID> {

    Optional<InstallmentPlan> findByPlanNumber(String planNumber);

    /**
     * The collections screen.
     *
     * <p>{@code left join fetch} on the schedule, because the balance is computed
     * from it — a lazy list here would be one query per plan, and the outstanding
     * total is the first thing the screen shows. Distinct, or the join multiplies
     * each plan by its installments.
     */
    @Query("""
           select distinct p from InstallmentPlan p
            left join fetch p.schedule
            where (:outletId is null or p.outletId = :outletId)
              and (:customerId is null or p.customerId = :customerId)
            order by p.createdAt desc
           """)
    List<InstallmentPlan> list(@Param("outletId") UUID outletId,
                               @Param("customerId") UUID customerId);

    /**
     * One plan, with its schedule.
     *
     * <p>Only the schedule is fetch-joined. Two collection joins in one query is
     * a {@code MultipleBagFetchException}, and even where Hibernate allowed it,
     * joining both would multiply each installment by each line so every sum over
     * the result would be wrong. The lines load on access, inside the same
     * read-only transaction.
     */
    @Query("""
           select distinct p from InstallmentPlan p
            left join fetch p.schedule
            where p.id = :id
           """)
    Optional<InstallmentPlan> findWithDetail(@Param("id") UUID id);

    /** Plan numbers come from a sequence, not from max()+1 over this table. */
    @Query(value = "select nextval('installment_plan_number_seq')", nativeQuery = true)
    long nextPlanNumber();
}
