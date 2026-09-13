package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.OutletRequest;
import gh.giftedlabs.pos.dto.OutletView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.OutletService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Branches — FR-OUT.
 *
 * <p>Reads are open to any signed-in user and scoped by assignment in the
 * service; writes require {@code settings.general}. That split is FR-OUT-06:
 * a cashier sees the branch they work in, and the server — not the UI — is
 * what stops them editing it.
 */
@RestController
@RequestMapping("/api/outlets")
public class OutletController {

    private final OutletService outlets;

    public OutletController(OutletService outlets) {
        this.outlets = outlets;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<OutletView> list(@AuthenticationPrincipal PosPrincipal caller,
                                 Authentication authentication,
                                 @RequestParam(defaultValue = "false") boolean includeInactive) {
        return outlets.visibleTo(caller, mayViewAll(authentication), includeInactive);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public OutletView get(@PathVariable UUID id, @AuthenticationPrincipal PosPrincipal caller,
                          Authentication authentication) {
        return outlets.get(id, caller, mayViewAll(authentication));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public OutletView create(@Valid @RequestBody OutletRequest body,
                             @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return outlets.create(body, actor, clientIp(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public OutletView update(@PathVariable UUID id, @Valid @RequestBody OutletRequest body,
                             @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return outlets.update(id, body, actor, clientIp(request));
    }

    /** BR-17: a branch closes, it is never deleted. */
    @PostMapping("/{id}/active")
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public OutletView setActive(@PathVariable UUID id, @RequestParam boolean value,
                                @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return outlets.setActive(id, value, actor, clientIp(request));
    }

    /** FR-OUT-05: only this permission may see beyond the assigned branches. */
    private boolean mayViewAll(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(Permission.Codes.OUTLET_VIEW_ALL::equals);
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
