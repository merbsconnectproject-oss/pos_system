package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.StockLevel;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Stock levels — BR-1, FR-INV-01. */
public interface StockLevelRepository extends JpaRepository<StockLevel, UUID> {

    Optional<StockLevel> findByProductIdAndOutletId(UUID productId, UUID outletId);

    /**
     * BR-8: the row lock that makes two terminals unable to sell the same last
     * unit. The availability check and the decrement have to happen inside one
     * transaction holding this lock, or both can read "1 left" and both sell it.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from StockLevel s where s.productId = :productId and s.outletId = :outletId")
    Optional<StockLevel> lockByProductAndOutlet(@Param("productId") UUID productId,
                                                @Param("outletId") UUID outletId);

    List<StockLevel> findAllByOutletId(UUID outletId);

    List<StockLevel> findAllByProductId(UUID productId);

    /** FR-INV-08. */
    @Query("select s from StockLevel s where s.outletId = :outletId and s.quantity <= s.reorderLevel")
    List<StockLevel> findLowAt(@Param("outletId") UUID outletId);

    /** FR-INV acceptance · BR-2: the level must equal the sum of its movements. */
    @Query("""
           select coalesce(sum(m.quantityDelta), 0) from InventoryMovement m
            where m.productId = :productId and m.outletId = :outletId
           """)
    java.math.BigDecimal sumMovements(@Param("productId") UUID productId, @Param("outletId") UUID outletId);
}
