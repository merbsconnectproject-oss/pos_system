package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.BackupRun;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * FR-SET-07: what the settings screen shows about backups.
 *
 * <p>{@code healthy} is deliberately not "the last run succeeded". A copy made
 * three weeks ago succeeded too. It means there is a recent one <em>and</em> it
 * got off this machine, because the failure this exists for is the disk.
 */
public record BackupView(
        UUID id,
        String kind,
        Instant startedAt,
        Instant finishedAt,
        String outcome,
        String fileName,
        Long sizeBytes,
        boolean storedLocal,
        boolean storedOffsite,
        String destination,
        String error) {

    public static BackupView of(BackupRun run) {
        return new BackupView(run.getId(), run.getKind().name(), run.getStartedAt(),
                run.getFinishedAt(), run.getOutcome().name(), run.getFileName(),
                run.getSizeBytes(), run.isStoredLocal(), run.isStoredOffsite(),
                run.getDestination(), run.getError());
    }

    /**
     * FR-SET-07 · NFR-6 · NFR-7.
     *
     * @param lastSuccess        the most recent run that worked at all
     * @param lastOffsiteSuccess the most recent that left this machine
     * @param recoveryPointMinutes how much trading a disk failure would cost
     *                             right now — the live answer to NFR-7, not the
     *                             configured target
     * @param offsiteConfigured  false until a bucket and key exist; the screen
     *                           must say "local only" rather than "healthy"
     */
    public record Status(
            boolean enabled,
            boolean offsiteConfigured,
            boolean healthy,
            String summary,
            BackupView lastSuccess,
            BackupView lastOffsiteSuccess,
            Long recoveryPointMinutes,
            int intervalMinutes,
            int retentionDays,
            List<BackupView> history) {
    }
}
