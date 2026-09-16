package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.PurchaseOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, UUID> {

    /** With lines, because every screen that lists orders shows their progress. */
    @Query("select distinct o from PurchaseOrder o left join fetch o.lines "
            + "where o.outletId in :outletIds order by o.createdAt desc")
    List<PurchaseOrder> findForOutlets(@Param("outletIds") List<UUID> outletIds);

    @Query("select distinct o from PurchaseOrder o left join fetch o.lines where o.id = :id")
    Optional<PurchaseOrder> findWithLines(@Param("id") UUID id);

    /** Per-outlet document numbering. Locked, because two people may order at once. */
    @Query(value = """
           insert into purchase_order_sequence (outlet_id, next_value) values (:outletId, 2)
           on conflict (outlet_id)
             do update set next_value = purchase_order_sequence.next_value + 1
           returning next_value - 1
           """, nativeQuery = true)
    long nextOrderNumber(@Param("outletId") UUID outletId);
}
