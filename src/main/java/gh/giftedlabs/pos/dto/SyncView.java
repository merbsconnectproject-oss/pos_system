package gh.giftedlabs.pos.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** What the sync screens report — channel 1 and channel 2. */
public final class SyncView {

    private SyncView() { }

    /**
     * The outcome of a push or an ingest.
     *
     * @param batches how many files moved
     * @param rows    how many rows they carried, by table — the number an owner
     *                checks when they want to know something actually happened
     */
    public record Transfer(
            boolean configured,
            int batches,
            int rows,
            Map<String, Integer> rowsByTable,
            List<String> keys,
            String message) {
    }

    /**
     * Where this instance stands — FR-SYNC-04, reframed.
     *
     * <p>The banner no longer means "you cannot sell": a shop never needs the
     * network to trade. It means the owner's view is this far behind, which is
     * information, not an alarm.
     *
     * @param pendingRows  rows written here and not yet pushed
     * @param lastPushedAt null until the first push, which is an ordinary state
     *                     on a shop's first day
     */
    public record Status(
            boolean configured,
            String outletCode,
            String mode,
            long pendingRows,
            Map<String, Long> pendingByTable,
            Instant lastPushedAt,
            long lastSequence,
            Instant configPulledAt,
            String summary) {
    }

    /** What the owner published, and what a shop received. */
    public record Configuration(
            String outletCode,
            Instant publishedAt,
            int users,
            int products,
            String message) {
    }
}
