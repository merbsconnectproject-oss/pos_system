package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Customer;
import gh.giftedlabs.pos.entity.Sale;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CustomerRepository extends JpaRepository<Customer, UUID> {

    /** FR-CUST-03: found by the normalised key, whatever spelling was typed. */
    Optional<Customer> findByPhoneKey(String phoneKey);

    @Query("select count(c) > 0 from Customer c where c.phoneKey = :phoneKey and (:selfId is null or c.id <> :selfId)")
    boolean phoneTaken(@Param("phoneKey") String phoneKey, @Param("selfId") UUID selfId);

    /**
     * The counter's search: part of a name, or any part of the number.
     *
     * <p>The phone is matched on the key rather than on what was typed, so
     * searching {@code 0244} finds a customer saved as {@code +233 24 4...}.
     * An empty query is the whole list, which is what an unfiltered screen
     * asks for.
     */
    @Query("""
           select c from Customer c
            where (:includeInactive = true or c.active = true)
              and (:query = ''
                   or upper(c.name) like upper(concat('%', :query, '%'))
                   or c.phoneKey like concat('%', :phoneQuery, '%')
                   or upper(coalesce(c.notes, '')) like upper(concat('%', :query, '%')))
            order by c.name
           """)
    List<Customer> search(@Param("query") String query,
                          @Param("phoneQuery") String phoneQuery,
                          @Param("includeInactive") boolean includeInactive,
                          Pageable page);

    /**
     * FR-CUST-06: what each of these customers has spent, across every branch.
     *
     * <p>Computed rather than kept on the record. A running total is a second
     * copy of what the sales already say, and after one void only one of them
     * can be right — which is also why voided sales are left out: a void is
     * money that came back.
     *
     * <p>Every customer on the screen in one query, because a list of two
     * hundred customers must not be two hundred round trips.
     *
     * <p>The status is bound, never written into the JPQL. A nested enum
     * spelled as a literal compiles and then fails at runtime with
     * {@code type "status" does not exist}.
     */
    @Query("""
           select s.customerId, coalesce(sum(s.total), 0), count(s)
             from Sale s
            where s.customerId in :customerIds
              and s.status = :status
            group by s.customerId
           """)
    List<Object[]> purchaseTotals(@Param("customerIds") Collection<UUID> customerIds,
                                  @Param("status") Sale.Status status);

}
