package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Terminal;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Tills and their receipt blocks — BR-6. */
public interface TerminalRepository extends JpaRepository<Terminal, UUID> {

    /**
     * BR-6: the lock that makes a receipt number unique.
     *
     * <p>Two sales on one terminal must not read the same {@code seq_current}.
     * Reading it under a write lock is what serialises them.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Terminal t where t.id = :id")
    Optional<Terminal> lockById(@Param("id") UUID id);

    List<Terminal> findAllByOutletIdAndActiveTrueOrderByCodeAsc(UUID outletId);

    Optional<Terminal> findByOutletIdAndCodeIgnoreCase(UUID outletId, String code);

    @Query("select coalesce(max(t.blockEnd), 0) from Terminal t where t.outletId = :outletId")
    long highestAllocatedAt(@Param("outletId") UUID outletId);
}
