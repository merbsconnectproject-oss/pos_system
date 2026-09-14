package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.UnitOfMeasure;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** FR-UOM-01. */
public interface UnitOfMeasureRepository extends JpaRepository<UnitOfMeasure, UUID> {
    Optional<UnitOfMeasure> findByNameIgnoreCase(String name);
    List<UnitOfMeasure> findAllByOrderByNameAsc();
}
