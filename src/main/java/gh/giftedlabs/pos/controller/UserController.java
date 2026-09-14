package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.UserRequest;
import gh.giftedlabs.pos.dto.UserView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Staff, roles and permissions — FR-USER.
 *
 * <p>Everything here needs {@code user.manage}, except the catalogues, which
 * any signed-in user may read: a screen has to know what a permission code
 * means to explain why a control is missing.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService users;

    public UserController(UserService users) {
        this.users = users;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    public List<UserView> list(@RequestParam(defaultValue = "false") boolean includeInactive) {
        return users.list(includeInactive);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    public UserView get(@PathVariable UUID id) {
        return users.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    public UserView create(@Valid @RequestBody UserRequest body,
                           @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return users.create(body, actor, clientIp(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    public UserView update(@PathVariable UUID id, @Valid @RequestBody UserRequest body,
                           @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return users.update(id, body, actor, clientIp(request));
    }

    /**
     * FR-USER-03 · FR-USER-05 · BR-16.
     *
     * <p>A null {@code granted} clears the override, which returns the person to
     * their role baseline. That is a third state, not a synonym for false.
     */
    @PutMapping("/{id}/permissions/{code}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    public UserView setPermission(@PathVariable UUID id, @PathVariable String code,
                                  @RequestParam(required = false) Boolean granted,
                                  @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return users.setPermission(id, code, granted, actor, clientIp(request));
    }

    /** FR-USER-07. */
    @PostMapping("/{id}/active")
    @PreAuthorize("hasAuthority('" + Permission.Codes.USER_MANAGE + "')")
    public UserView setActive(@PathVariable UUID id, @RequestParam boolean value,
                              @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return users.setActive(id, value, actor, clientIp(request));
    }

    /** `J-06`: the matrix, and what each role starts with. */
    @GetMapping("/catalogue")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> catalogue() {
        return Map.of("permissions", users.permissionCatalogue(), "roles", users.roleCatalogue());
    }

    public record PermissionChange(@NotBlank String code, Boolean granted) {
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
