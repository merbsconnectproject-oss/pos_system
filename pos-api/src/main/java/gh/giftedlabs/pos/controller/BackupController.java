package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.BackupView;
import gh.giftedlabs.pos.entity.BackupRun;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.BackupService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * FR-SET-07 · NFR-6: backup status and history.
 *
 * <p>Behind {@code settings.general}, like the rest of the settings screen.
 * Knowing when the last backup ran tells you how much of the shop's history is
 * currently at risk, which is not something to leave on an open endpoint.
 */
@RestController
@RequestMapping("/api/backups")
public class BackupController {

    private final BackupService backups;

    public BackupController(BackupService backups) {
        this.backups = backups;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public BackupView.Status status(@RequestParam(defaultValue = "20") int limit) {
        return backups.status(limit);
    }

    /**
     * Take one now.
     *
     * <p>The reason this exists is the moment before something risky — a
     * stocktake, a price change across the catalogue, an upgrade — when
     * waiting up to fifteen minutes for the next scheduled one is the wrong
     * answer.
     */
    @PostMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public BackupView runNow(@AuthenticationPrincipal PosPrincipal actor) {
        return backups.run(BackupRun.Kind.MANUAL, actor.userId());
    }
}
