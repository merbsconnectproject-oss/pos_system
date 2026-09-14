package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ShiftView;
import gh.giftedlabs.pos.rules.CashMovementType;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.ShiftService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Shifts and the cash drawer — FR-CASH.
 *
 * <p>Opening needs {@code shift.open}, closing needs {@code shift.close} and
 * cash movements need {@code cash.movement} — three separate rights, because
 * taking a float is not the same act as counting a drawer down, and neither is
 * paying money out of it.
 */
@RestController
@RequestMapping("/api/shifts")
public class ShiftController {

    /**
     * FR-CASH-06's threshold, until P makes it a setting.
     *
     * <p>GH₵ 5.00. Named here rather than buried as a literal so the day it
     * becomes configurable there is one place to change.
     */
    private static final long VARIANCE_THRESHOLD_PESEWAS = 500L;

    private final ShiftService shifts;

    public ShiftController(ShiftService shifts) {
        this.shifts = shifts;
    }

    /** The caller's own open shift, if they have one. */
    @GetMapping("/current")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ShiftView> current(@AuthenticationPrincipal PosPrincipal actor) {
        return shifts.current(actor.userId()).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('" + Permission.Codes.SHIFT_OPEN + "','"
            + Permission.Codes.CASH_VIEW_VARIANCE + "')")
    public List<ShiftView> recent(@RequestParam(required = false) UUID outletId,
                                  @RequestParam(required = false) UUID cashierId,
                                  @RequestParam(defaultValue = "50") int limit) {
        return shifts.recent(outletId, cashierId, Math.clamp(limit, 1, 200));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ShiftView get(@PathVariable UUID id) {
        return shifts.get(id);
    }

    /** FR-CASH-01. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.SHIFT_OPEN + "')")
    public ShiftView open(@Valid @RequestBody OpenShift body,
                          @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return shifts.open(body.terminalId(), body.openingFloat(), actor, clientIp(request));
    }

    /**
     * FR-CASH-04: close on a blind count.
     *
     * <p>The request carries only what was counted. What was expected comes back
     * in the response and nowhere else.
     */
    @PostMapping("/{id}/close")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SHIFT_CLOSE + "')")
    public ShiftView close(@PathVariable UUID id, @Valid @RequestBody CloseShift body,
                           @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return shifts.close(id, body.countedCash(), body.note(),
                VARIANCE_THRESHOLD_PESEWAS, actor, clientIp(request));
    }

    /** FR-CASH-03. */
    @PostMapping("/{id}/cash")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.CASH_MOVEMENT + "')")
    public ShiftView recordCash(@PathVariable UUID id, @Valid @RequestBody CashEntry body,
                                @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return shifts.recordCash(id, body.type(), body.amount(), body.reason(), body.note(),
                actor, clientIp(request));
    }

    public record OpenShift(
            @NotNull(message = "Choose the till") UUID terminalId,
            @NotNull @PositiveOrZero(message = "An opening float cannot be negative") Long openingFloat) {
    }

    public record CloseShift(
            @NotNull @PositiveOrZero(message = "Enter what you counted") Long countedCash,
            @Size(max = 500) String note) {
    }

    public record CashEntry(
            @NotNull CashMovementType type,
            @NotNull Long amount,
            @NotBlank(message = "Say what the money was for") @Size(max = 200) String reason,
            @Size(max = 500) String note) {
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
