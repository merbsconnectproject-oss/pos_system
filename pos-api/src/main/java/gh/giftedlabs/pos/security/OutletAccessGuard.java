package gh.giftedlabs.pos.security;

import gh.giftedlabs.pos.exception.OutletNotPermittedException;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.service.UserService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * FR-OUT-05 · FR-AUTH-03: confine a request to the branches the caller may see.
 *
 * <p>Every outlet-scoped endpoint takes an {@code outletId} — in the query, the
 * path, or the body — and queries by it. Enforcing the assigned-branch rule in
 * each controller is how it was missed in most of them: a caller without
 * {@code outlet.view_all} could read and write another branch's data by naming
 * its id, and omitting the id returned every branch at once. This guard is the
 * one place that answers "may this caller touch this outlet", so a new
 * outlet-scoped endpoint inherits the rule by calling it rather than by
 * remembering to re-implement it.
 *
 * <p>The caller is read from the security context rather than passed in, so a
 * controller adds a single line and changes no method signature.
 */
@Component
public class OutletAccessGuard {

    private final UserService staff;

    public OutletAccessGuard(UserService staff) {
        this.staff = staff;
    }

    /** True when the caller may see across branches rather than only their own. */
    public boolean mayViewAll() {
        UUID caller = callerId();
        return caller != null && staff.holdsPermission(caller, Permission.OUTLET_VIEW_ALL);
    }

    /**
     * Reject a request that names a branch the caller is not assigned to.
     *
     * <p>For an explicit {@code outletId} in a path, query or body. A caller with
     * {@code outlet.view_all} passes for any branch; anyone else must be assigned
     * to it. A {@code null} id is left to {@link #scope(UUID)}, which decides what
     * "no branch given" means for a list.
     */
    public void assertVisible(UUID outletId) {
        if (outletId == null || mayViewAll()) return;
        UUID caller = callerId();
        if (caller != null && staff.assignedOutlets(caller).contains(outletId)) return;
        throw new OutletNotPermittedException(outletId);
    }

    /**
     * Resolve the branch a list query should run against.
     *
     * <p>A caller with {@code outlet.view_all} gets exactly what they asked for,
     * {@code null} included, which the query reads as "every branch". Anyone else
     * is confined: an explicit id must be one of theirs (or it is refused), and
     * {@code null} collapses to their active branch rather than to every branch.
     */
    public UUID scope(UUID requested) {
        if (mayViewAll()) return requested;
        if (requested == null) return callerOutlet();
        assertVisible(requested);
        return requested;
    }

    private UUID callerId() {
        PosPrincipal principal = principal();
        return principal == null ? null : principal.userId();
    }

    private UUID callerOutlet() {
        PosPrincipal principal = principal();
        return principal == null ? null : principal.outletId();
    }

    private PosPrincipal principal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) return null;
        Object principal = authentication.getPrincipal();
        return principal instanceof PosPrincipal pos ? pos : null;
    }
}
