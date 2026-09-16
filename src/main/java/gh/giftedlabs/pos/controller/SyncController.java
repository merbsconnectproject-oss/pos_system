package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.SyncView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.SyncService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * The two channels — configuration down, transactions up.
 *
 * <p>All behind {@code settings.general}. Publishing decides what a whole shop
 * sees, pulling replaces its catalogue and its staff, and ingesting writes
 * another shop's trading into this database — none of which is a counter action.
 *
 * <p>Every route here is something a person presses. Nothing on the selling path
 * touches the network, which is the property the whole topology was chosen for.
 */
@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final SyncService sync;

    public SyncController(SyncService sync) {
        this.sync = sync;
    }

    /**
     * What this instance has and has not sent.
     *
     * <p>Read-only, and readable by anyone who may push: somebody about to send
     * the day needs to see whether it is already gone.
     */
    @GetMapping("/status")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SYNC_PUSH + "')")
    public SyncView.Status status() {
        return sync.status();
    }

    /** Owner: publish one outlet's configuration. */
    @PostMapping("/config/{outletId}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public SyncView.Configuration publish(@PathVariable UUID outletId,
                                          @AuthenticationPrincipal PosPrincipal actor,
                                          HttpServletRequest request) {
        return sync.publishConfiguration(outletId, actor, clientIp(request));
    }

    /**
     * Shop: fetch and apply the configuration published for this outlet.
     *
     * <p>Re-runnable by design — this is the "Get configuration" a shop presses
     * at setup and again whenever the owner changes something.
     */
    @PostMapping("/config")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public SyncView.Configuration pull(@AuthenticationPrincipal PosPrincipal actor,
                                       HttpServletRequest request) {
        return sync.pullConfiguration(actor, clientIp(request));
    }

    /**
     * Shop: send everything written here since the last push.
     *
     * <p>{@code sync.push} rather than {@code settings.general}, so closing up
     * does not require the rights to rename the business. The operation is
     * one-way, additive and audited — sending twice is a no-op at the far end —
     * which is what makes it safe to leave with the counter.
     */
    @PostMapping("/push")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SYNC_PUSH + "')")
    public SyncView.Transfer push(@AuthenticationPrincipal PosPrincipal actor,
                                  HttpServletRequest request) {
        return sync.push(actor, clientIp(request));
    }

    /** Owner: bring in every batch not yet applied, oldest first. */
    @PostMapping("/ingest")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public SyncView.Transfer ingest(@AuthenticationPrincipal PosPrincipal actor,
                                    HttpServletRequest request) {
        return sync.ingest(actor, clientIp(request));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
