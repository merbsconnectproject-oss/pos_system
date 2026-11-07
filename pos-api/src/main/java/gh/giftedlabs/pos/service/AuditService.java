package gh.giftedlabs.pos.service;

import java.util.Map;
import java.util.UUID;

public interface AuditService {

    /**
     * BR-15. Written in its own transaction, so an operation that fails still
     * leaves a record that it was attempted.
     */
    void record(UUID actorId, String action, String entityType, UUID entityId,
                Map<String, ?> before, Map<String, ?> after, UUID outletId,
                UUID terminalId, String clientIp);

    /**
     * The same entry, in the caller's transaction — for operations that write the
     * rows the entry itself points at.
     *
     * <p>{@link #record} runs {@code REQUIRES_NEW} on a separate connection, so it
     * cannot see rows the caller has not committed. When the entry references one
     * of them — {@code actor_id}, {@code outlet_id} and {@code terminal_id} are
     * all foreign keys — the insert does not fail, it <em>blocks</em>, waiting for
     * a transaction that is waiting for it. Nothing times out.
     *
     * <p>The config pull is the case: it rewrites every user at the shop,
     * including the one performing it, so the entry's own actor is uncommitted.
     *
     * <p>The cost is that a rolled-back operation leaves no trace — which for a
     * pull is the honest outcome. Recording {@code CONFIG_PULLED} for a pull that
     * rolled back would claim a shop is configured when it is not.
     */
    void recordInCallerTransaction(UUID actorId, String action, String entityType, UUID entityId,
                                   Map<String, ?> before, Map<String, ?> after, UUID outletId,
                                   UUID terminalId, String clientIp);
}
