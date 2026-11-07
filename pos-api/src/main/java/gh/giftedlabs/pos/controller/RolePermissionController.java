package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.RolePermissionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

/**
 * What each role may do — FR-USER-02, BR-16.
 *
 * <p>Behind {@code user.manage}, like everything else that changes what somebody
 * can do. Widening a role grants the same right to everybody who holds it, which
 * is precisely the point: an owner who is away should be able to let a senior
 * cashier approve adjustments without editing six accounts one at a time.
 */
@RestController
@RequestMapping("/api/roles")
public class RolePermissionController {

    private final RolePermissionService roles;

    public RolePermissionController(RolePermissionService roles) {
        this.roles = roles;
    }

    /** Every role and what it currently grants. */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public Map<String, List<String>> current() {
        return view(roles.current());
    }

    /**
     * Replaces one role's grants.
     *
     * <p>A replace, not a merge: taking a right away has to be as possible as
     * giving one, and merging would make removal impossible.
     */
    @PutMapping("/{role}/permissions")
    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    public Map<String, List<String>> replace(@PathVariable String role,
                                             @RequestBody PermissionList body,
                                             @AuthenticationPrincipal PosPrincipal actor,
                                             HttpServletRequest request) {
        Role target = role(role);
        Set<Permission> granted = new LinkedHashSet<>();
        for (String code : body.permissions()) {
            granted.add(Permission.ofCode(code).orElseThrow(() -> new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "%s is not a permission".formatted(code))));
        }
        return view(roles.replace(target, granted, actor, clientIp(request)));
    }

    /** Puts a role back to what the system ships with. */
    @PostMapping("/{role}/permissions/reset")
    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    public Map<String, List<String>> reset(@PathVariable String role,
                                           @AuthenticationPrincipal PosPrincipal actor,
                                           HttpServletRequest request) {
        return view(roles.resetToDefaults(role(role), actor, clientIp(request)));
    }

    public record PermissionList(@NotNull List<String> permissions) { }

    private Role role(String key) {
        return Role.ofKey(key).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND, "%s is not a role".formatted(key)));
    }

    private Map<String, List<String>> view(Map<Role, Set<Permission>> grants) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        grants.forEach((role, permissions) -> out.put(role.key(),
                permissions.stream().map(Permission::code).sorted().toList()));
        return out;
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
