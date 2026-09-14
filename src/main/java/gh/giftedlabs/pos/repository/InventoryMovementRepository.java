package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.InventoryMovement;
import gh.giftedlabs.pos.rules.MovementType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** The stock ledger — BR-2, FR-INV-04. */
public interface InventoryMovementRepository extends JpaRepository<InventoryMovement, UUID> {

    /**
     * FR-INV-04: filterable by product, outlet, type, user and date.
     *
     * <p>Every filter is optional and null means "any", so one query serves the
     * movements screen, a product's history and the exceptions view.
     */
    @Query("""
           select m from InventoryMovement m
            where (:productId is null or m.productId = :productId)
              and (:outletId  is null or m.outletId  = :outletId)
              and (:type      is null or m.type      = :type)
              and (:actorId   is null or m.actorId   = :actorId)
              and (:from      is null or m.createdAt >= :from)
              and (:to        is null or m.createdAt <= :to)
              and (:exceptionsOnly = false or m.exception = true)
            order by m.createdAt desc
           """)
    Page<InventoryMovement> search(@Param("productId") UUID productId,
                                   @Param("outletId") UUID outletId,
                                   @Param("type") MovementType type,
                                   @Param("actorId") UUID actorId,
                                   @Param("from") Instant from,
                                   @Param("to") Instant to,
                                   @Param("exceptionsOnly") boolean exceptionsOnly,
                                   Pageable pageable);

    /** BR-7: has this source document already moved this product? */
    boolean existsBySourceTypeAndSourceIdAndProductIdAndType(
            String sourceType, UUID sourceId, UUID productId, MovementType type);

    /**
     * FR-PRICE-08: what the last delivery of this product cost at this branch.
     *
     * <p>The replacement cost, as opposed to the weighted average of what is on
     * the shelf. Only receipts carry a unit cost worth reading — an adjustment
     * corrects a count, not a valuation (BR-4).
     */
    @Query("""
           select m.unitCost from InventoryMovement m
            where m.productId = :productId and m.outletId = :outletId
              and m.type = :receipt
              and m.unitCost is not null
            order by m.createdAt desc
           """)
    List<BigDecimal> latestReceiptCost(@Param("productId") UUID productId,
                                       @Param("outletId") UUID outletId,
                                       @Param("receipt") MovementType receipt,
                                       Pageable page);

    /** FR-PROD-09: only movements that actually establish a new cost. */
    @Query("""
           select m from InventoryMovement m
            where m.productId = :productId
              and m.type in (:types)
              and m.unitCost is not null
            order by m.createdAt desc
           """)
    List<InventoryMovement> costHistory(@Param("productId") UUID productId,
                                        @Param("types") List<MovementType> types);
}
