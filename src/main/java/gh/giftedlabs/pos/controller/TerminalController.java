package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tills and their receipt blocks — BR-6, FR-SET-05.
 *
 * <p>A block is handed out once and never overlaps another, which is what makes
 * two tills unable to issue the same receipt number. New blocks start above
 * every block already allocated at that outlet rather than at a remembered
 * counter, so a restored backup cannot hand out numbers twice.
 */
@RestController
@RequestMapping("/api/terminals")
public class TerminalController {

    private static final long BLOCK_SIZE = 10_000L;

    private final TerminalRepository terminals;
    private final AuditService audit;

    public TerminalController(TerminalRepository terminals, AuditService audit) {
        this.terminals = terminals;
        this.audit = audit;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.POS_SELL + "')")
    public List<TerminalView> list(@RequestParam UUID outletId) {
        return terminals.findAllByOutletIdAndActiveTrueOrderByCodeAsc(outletId).stream()
                .map(TerminalView::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_TERMINAL + "')")
    @Transactional
    public TerminalView create(@Valid @RequestBody NewTerminal body,
                               @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        long start = terminals.highestAllocatedAt(body.outletId()) + 1;
        Terminal terminal = terminals.save(
                new Terminal(body.outletId(), body.code().toUpperCase(), body.name(), start, BLOCK_SIZE));

        audit.record(actor.userId(), "TERMINAL_CREATED", "terminal", terminal.getId(), null,
                Map.of("code", terminal.getCode(), "blockStart", start, "blockEnd", terminal.getBlockEnd()),
                body.outletId(), terminal.getId(), clientIp(request));
        return TerminalView.of(terminal);
    }

    /** BR-6: a fresh block when the old one runs out. */
    @PostMapping("/{id}/block")
    @ResponseStatus(HttpStatus.OK)
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_TERMINAL + "')")
    @Transactional
    public TerminalView issueBlock(@PathVariable UUID id,
                                   @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        Terminal terminal = terminals.lockById(id)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No such terminal"));

        long start = terminals.highestAllocatedAt(terminal.getOutletId()) + 1;
        terminal.assignBlock(start, BLOCK_SIZE);

        audit.record(actor.userId(), "TERMINAL_BLOCK_ISSUED", "terminal", id, null,
                Map.of("blockStart", start, "blockEnd", terminal.getBlockEnd()),
                terminal.getOutletId(), id, clientIp(request));
        return TerminalView.of(terminal);
    }

    public record NewTerminal(
            @jakarta.validation.constraints.NotNull UUID outletId,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9]{1,4}",
                    message = "A till code is 1-4 letters or digits — it becomes part of the receipt number")
            String code,
            @NotBlank @Size(max = 80) String name) {
    }

    public record TerminalView(UUID id, UUID outletId, String code, String name,
                               long blockStart, long blockEnd, long current, long remaining) {
        static TerminalView of(Terminal terminal) {
            return new TerminalView(terminal.getId(), terminal.getOutletId(), terminal.getCode(),
                    terminal.getName(), terminal.getBlockStart(), terminal.getBlockEnd(),
                    terminal.getCurrent(), terminal.getBlockEnd() - terminal.getCurrent() + 1);
        }
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
