package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.SaleReturn;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface SaleReturnRepository extends JpaRepository<SaleReturn, UUID> {

    Optional<SaleReturn> findByReturnNumber(String returnNumber);

    @Query("""
           select distinct r from SaleReturn r
            left join fetch r.items
            where (:outletId is null or r.outletId = :outletId)
            order by r.createdAt desc
           """)
    List<SaleReturn> list(@Param("outletId") UUID outletId, Pageable page);

    @Query("""
           select distinct r from SaleReturn r
            left join fetch r.items
            where r.id = :id
           """)
    Optional<SaleReturn> findWithItems(@Param("id") UUID id);

    List<SaleReturn> findAllByOriginalSaleIdOrderByCreatedAtDesc(UUID saleId);

    /**
     * How much of each line of a sale has already come back.
     *
     * <p>The cap on any further return. Asked as one query rather than per line,
     * because a five-line receipt would otherwise be five round trips before the
     * shop can even be told what it may take back.
     */
    @Query("""
           select i.saleItemId, coalesce(sum(i.quantityBase), 0)
             from SaleReturnItem i
            where i.saleReturn.originalSaleId = :saleId
            group by i.saleItemId
           """)
    List<Object[]> returnedQuantitiesRaw(@Param("saleId") UUID saleId);

    /** {@link #returnedQuantitiesRaw} as the map the caller actually wants. */
    default Map<UUID, BigDecimal> returnedQuantities(UUID saleId) {
        return returnedQuantitiesRaw(saleId).stream()
                .collect(java.util.stream.Collectors.toMap(
                        row -> (UUID) row[0],
                        row -> (BigDecimal) row[1]));
    }

    /** Per-outlet document numbering. Locked, because two tills may return at once. */
    @Query(value = """
           insert into return_sequence (outlet_id, next_value) values (:outletId, 2)
           on conflict (outlet_id)
             do update set next_value = return_sequence.next_value + 1
           returning next_value - 1
           """, nativeQuery = true)
    long nextReturnNumber(@Param("outletId") UUID outletId);
}
