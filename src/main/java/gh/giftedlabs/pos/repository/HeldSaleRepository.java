package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.HeldSale;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface HeldSaleRepository extends JpaRepository<HeldSale, UUID> {
    List<HeldSale> findAllByOutletIdOrderByHeldAtDesc(UUID outletId);
}
