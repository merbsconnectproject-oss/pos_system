package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.AuditEntryView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.service.AuditQueryService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The audit log — BR-15 · FR-AUDIT.
 *
 * <p>Read-only by design. There is no write endpoint and no delete: entries are
 * recorded by the services that cause them, and the database refuses update and
 * delete outright. An HTTP route that could alter the log would defeat it.
 */
@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private static final int MAX_PAGE = 500;

    private final AuditQueryService audit;

    public AuditController(AuditQueryService audit) {
        this.audit = audit;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.AUDIT_VIEW + "')")
    public List<AuditEntryView> recent(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) UUID actorId,
            @RequestParam(required = false) UUID outletId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return audit.recent(action, actorId, outletId, from, to,
                Math.clamp(limit, 1, MAX_PAGE), Math.max(0, offset));
    }
}
