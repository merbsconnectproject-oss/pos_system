package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Outlet;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Outlets — FR-OUT. */
public interface OutletRepository extends JpaRepository<Outlet, UUID> {

    Optional<Outlet> findByCodeIgnoreCase(String code);

    List<Outlet> findAllByActiveTrueOrderByNameAsc();

    boolean existsByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCaseAndIdNot(String code, UUID id);

    List<Outlet> findAllByIdInOrderByNameAsc(java.util.Collection<UUID> ids);

    List<Outlet> findAllByOrderByNameAsc();
}
