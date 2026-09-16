package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.SyncView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.UUID;

/**
 * The two one-way channels — see {@code docs/ARCHITECTURE-topology-and-sync.md}.
 *
 * <p>Configuration flows down from the owner; transactions flow up from each
 * shop. Nothing is ever written from both ends, which is why nothing here
 * resolves a conflict.
 *
 * <p><strong>Nothing here is on the selling path.</strong> Every method is
 * invoked by somebody pressing a button, never by a sale. If the bucket is
 * unreachable the till does not notice.
 */
public interface SyncService {

    /** Owner: write this outlet's configuration to the bucket. */
    SyncView.Configuration publishConfiguration(UUID outletId, PosPrincipal actor, String clientIp);

    /**
     * Shop: fetch and apply the configuration published for this outlet.
     *
     * <p>Re-runnable. A once-only pull would leave the owner editing the tax
     * rate in three places and the copies drifting apart in silence.
     */
    SyncView.Configuration pullConfiguration(PosPrincipal actor, String clientIp);

    /** Shop: send everything written here since the last push. */
    SyncView.Transfer push(PosPrincipal actor, String clientIp);

    /** Owner: take in every batch not yet applied, in the order they were written. */
    SyncView.Transfer ingest(PosPrincipal actor, String clientIp);

    /** What this instance has and has not sent. */
    SyncView.Status status();
}
