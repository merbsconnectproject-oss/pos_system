package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** FR-SUP-01. */
public interface SupplierRepository extends JpaRepository<Supplier, UUID> {

    Optional<Supplier> findByNameIgnoreCase(String name);

    @Query("select count(s) > 0 from Supplier s where upper(s.name) = upper(:name) and (:selfId is null or s.id <> :selfId)")
    boolean nameTaken(@Param("name") String name, @Param("selfId") UUID selfId);

    List<Supplier> findAllByOrderByNameAsc();

    List<Supplier> findAllByActiveTrueOrderByNameAsc();
}
