package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Brand;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** FR-PROD-05. */
public interface BrandRepository extends JpaRepository<Brand, UUID> {
    Optional<Brand> findByNameIgnoreCase(String name);
    List<Brand> findAllByOrderByNameAsc();
}
