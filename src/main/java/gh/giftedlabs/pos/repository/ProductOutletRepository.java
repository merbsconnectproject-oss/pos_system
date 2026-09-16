package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.ProductOutlet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/** Which outlets carry which product — the owner's assignment. */
public interface ProductOutletRepository
        extends JpaRepository<ProductOutlet, ProductOutlet.Key> {

    List<ProductOutlet> findByOutletId(UUID outletId);

    List<ProductOutlet> findByProductId(UUID productId);

    boolean existsByProductIdAndOutletId(UUID productId, UUID outletId);

    @Modifying
    void deleteByProductIdAndOutletId(UUID productId, UUID outletId);

    /** The products one shop carries, for building its configuration. */
    @Query("select a.productId from ProductOutlet a where a.outletId = :outletId")
    List<UUID> productIdsAt(@Param("outletId") UUID outletId);
}
