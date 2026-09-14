package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.ProductOutletPrice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductOutletPriceRepository
        extends JpaRepository<ProductOutletPrice, ProductOutletPrice.Key> {

    Optional<ProductOutletPrice> findByProductIdAndOutletId(UUID productId, UUID outletId);

    /** Every override for one product, for the edit screen. */
    List<ProductOutletPrice> findByProductId(UUID productId);

    /** Every override at one branch, so pricing a catalogue is one query. */
    List<ProductOutletPrice> findByOutletId(UUID outletId);
}
