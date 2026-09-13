package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.ProductPriceHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** FR-PROD-09. Append-only; the database refuses update and delete. */
public interface ProductPriceHistoryRepository extends JpaRepository<ProductPriceHistory, UUID> {
    List<ProductPriceHistory> findAllByProductIdOrderByChangedAtDesc(UUID productId);
}
