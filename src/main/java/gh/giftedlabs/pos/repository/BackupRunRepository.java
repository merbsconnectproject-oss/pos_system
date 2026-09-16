package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.BackupRun;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BackupRunRepository extends JpaRepository<BackupRun, UUID> {

    List<BackupRun> findAllByOrderByStartedAtDesc(Pageable page);

    /** FR-SET-07: "when did this last work" — the question the screen asks. */
    Optional<BackupRun> findFirstByOutcomeOrderByFinishedAtDesc(BackupRun.Outcome outcome);

    /** NFR-6: and the one that got off this machine, which is a different answer. */
    Optional<BackupRun> findFirstByOutcomeAndStoredOffsiteTrueOrderByFinishedAtDesc(
            BackupRun.Outcome outcome);
}
