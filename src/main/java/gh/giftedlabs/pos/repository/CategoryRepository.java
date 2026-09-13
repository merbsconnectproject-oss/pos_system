package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** FR-PROD-05. */
public interface CategoryRepository extends JpaRepository<Category, UUID> {
    Optional<Category> findByNameIgnoreCase(String name);
    List<Category> findAllByOrderByNameAsc();
}
