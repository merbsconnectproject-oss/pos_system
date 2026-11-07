package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.BackupView;
import gh.giftedlabs.pos.entity.BackupRun;

import java.util.UUID;

/**
 * Copying the database somewhere it survives this machine — NFR-6, NFR-7.
 *
 * <p>The risk in the delivery plan's own table is "counter PC disk failure
 * loses a shop's history". Everything here exists for that one sentence.
 */
public interface BackupService {

    /**
     * Take one backup now.
     *
     * <p>Never throws. A backup that fails must not take anything else down
     * with it — the scheduler carries on, the till carries on, and the failure
     * is recorded where somebody will see it.
     */
    BackupView run(BackupRun.Kind kind, UUID actorId);

    /** FR-SET-07: the state an owner needs to see on one screen. */
    BackupView.Status status(int historyLimit);
}
