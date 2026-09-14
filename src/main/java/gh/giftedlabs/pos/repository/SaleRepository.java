package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Sale;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Sales — FR-POS. */
public interface SaleRepository extends JpaRepository<Sale, UUID> {

    Optional<Sale> findByReceiptNumber(String receiptNumber);

    /**
     * FR-POS-18: past transactions by receipt, customer or amount.
     *
     * <p>An absent query is the empty string, never null. Binding a null to a
     * parameter that only appears inside {@code upper(...)} leaves Postgres
     * unable to infer its type, and it reports {@code upper(bytea) does not
     * exist} — the same trap the audit query fell into.
     */
    @Query("""
           select s from Sale s
            where (:outletId is null or s.outletId = :outletId)
              and (:query = ''
                   or upper(s.receiptNumber) like upper(concat('%', :query, '%'))
                   or upper(coalesce(s.customerName, '')) like upper(concat('%', :query, '%'))
                   or coalesce(s.customerPhone, '') like concat('%', :query, '%'))
            order by s.createdAt desc
           """)
    List<Sale> search(@Param("outletId") UUID outletId, @Param("query") String query, Pageable pageable);

    List<Sale> findAllByOutletIdOrderByCreatedAtDesc(UUID outletId, Pageable pageable);
}
