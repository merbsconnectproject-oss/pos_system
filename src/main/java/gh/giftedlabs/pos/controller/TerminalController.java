package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.exception.TerminalCodeTakenException;
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
        String code = body.code().toUpperCase();

        // `terminal_code_unique_per_outlet` would refuse this anyway, but as a
        // constraint violation surfacing as a 500 — the generic "tell a
        // manager" for what is a typo somebody can fix in the field in front of
        // them. Checked here so the answer names the code and the branch.
        //
        // The index stays the authority: two people adding "02" at the same
        // instant both pass this read and one loses at the constraint. That
        // race ends in a 500 rather than corrupt data, which is the right way
        // round, and it is rare enough not to be worth a lock over.
        // Not the active-only list: the unique index does not care whether a
        // till was retired, so neither can this — otherwise deactivating "02"
        // would let somebody add a second "02" that the database then refuses.
        if (terminals.findByOutletIdAndCodeIgnoreCase(body.outletId(), code).isPresent()) {
            throw new TerminalCodeTakenException(code);
        }

        long start = terminals.highestAllocatedAt(body.outletId()) + 1;
        Terminal terminal = terminals.save(
                new Terminal(body.outletId(), code, body.name(), start, BLOCK_SIZE));

        // No terminal_id on this one. The audit log is written in its own
        // transaction (REQUIRES_NEW, so a failure cannot take the record of the
        // attempt down with it), which means it cannot see a terminal this
        // transaction has not committed yet — the foreign key refused every
        // insert and creating a till failed outright, every time.
        //
        // entity_id already names it. The terminal_id column answers "which till
        // was this done at", and a till being created is not yet a till anything
        // was done at.
        audit.record(actor.userId(), "TERMINAL_CREATED", "terminal", terminal.getId(), null,
                Map.of("code", terminal.getCode(), "blockStart", start, "blockEnd", terminal.getBlockEnd()),
                body.outletId(), null, clientIp(request));
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
