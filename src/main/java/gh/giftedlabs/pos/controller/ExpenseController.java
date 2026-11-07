package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ExpenseRequest;
import gh.giftedlabs.pos.dto.ExpenseView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.OutletAccessGuard;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.ExpenseService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Operating expenses.
 *
 * <p>Reading needs {@code expense.view} and writing needs {@code expense.manage}
 * — two codes, because they are two decisions. A branch manager who records the
 * electricity bill is not necessarily somebody the owner wants reading the
 * payroll, and the screen was previously gated on {@code cash.movement}, which
 * meant anyone who could bank the takings could read both.
 *
 * <p>Note what is <em>not</em> here: no plain delete. An expense that appeared on
 * a P&L somebody filed has to keep existing, so removing one voids the row and
 * leaves it.
 */
@RestController
@RequestMapping("/api/expenses")
public class ExpenseController {

    private final ExpenseService expenses;
    private final OutletAccessGuard outletAccess;

    public ExpenseController(ExpenseService expenses, OutletAccessGuard outletAccess) {
        this.expenses = expenses;
        this.outletAccess = outletAccess;
    }

    /**
     * @param outletId one branch, or absent for the whole business. Business-wide
     *                 costs (a licence covering both shops) are included either
     *                 way, since they belong to neither alone.
     */
    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.EXPENSE_VIEW + "')")
    public ExpenseView.Page list(@RequestParam(required = false) LocalDate from,
                                 @RequestParam(required = false) LocalDate to,
                                 @RequestParam(required = false) UUID outletId,
                                 @RequestParam(defaultValue = "500") int limit) {
        outletId = outletAccess.scope(outletId);
        return expenses.list(from, to, outletId, limit);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.EXPENSE_MANAGE + "')")
    @ResponseStatus(HttpStatus.CREATED)
    public ExpenseView record(@Valid @RequestBody ExpenseRequest body,
                              @AuthenticationPrincipal PosPrincipal actor,
                              HttpServletRequest request) {
        outletAccess.assertVisible(body.outletId());
        return expenses.record(body, actor, clientIp(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.EXPENSE_MANAGE + "')")
    public ExpenseView update(@PathVariable UUID id,
                              @Valid @RequestBody ExpenseRequest body,
                              @AuthenticationPrincipal PosPrincipal actor,
                              HttpServletRequest request) {
        return expenses.update(id, body, actor, clientIp(request));
    }

    /**
     * Removes it from the figures without removing it from the record.
     *
     * <p>The reason is optional but asked for: a number that changed with no
     * explanation is the thing an owner queries three months later.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.EXPENSE_MANAGE + "')")
    public ResponseEntity<Void> remove(@PathVariable UUID id,
                                       @RequestParam(required = false) String reason,
                                       @AuthenticationPrincipal PosPrincipal actor,
                                       HttpServletRequest request) {
        expenses.voidExpense(id, reason, actor, clientIp(request));
        return ResponseEntity.noContent().build();
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
