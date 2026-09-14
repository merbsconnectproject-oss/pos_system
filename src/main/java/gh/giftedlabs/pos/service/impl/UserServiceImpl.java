package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.UserRequest;
import gh.giftedlabs.pos.dto.UserView;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.exception.CatalogueListException;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.UserService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

/**
 * Staff accounts, roles and individual permissions — FR-USER, BR-16.
 *
 * <p>The rule that shapes this class is BR-16: nobody edits their own rights.
 * It is checked on every path that could change them — roles, overrides and
 * deactivation alike — because an owner who can quietly grant themselves
 * something has made the whole permission model advisory.
 */
@Service
public class UserServiceImpl implements UserService {

    private final UserRepository users;
    private final OutletRepository outlets;
    private final PasswordEncoder passwords;
    private final PasswordEncoder pins;
    private final AuditService audit;

    public UserServiceImpl(UserRepository users, OutletRepository outlets,
                           @Qualifier("passwordEncoder") PasswordEncoder passwords,
                           @Qualifier("pinEncoder") PasswordEncoder pins,
                           AuditService audit) {
        this.users = users;
        this.outlets = outlets;
        this.passwords = passwords;
        this.pins = pins;
        this.audit = audit;
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserView> list(boolean includeInactive) {
        return users.findAll().stream()
                .filter(user -> includeInactive || user.isActive())
                .sorted(Comparator.comparing(User::getFullName, String.CASE_INSENSITIVE_ORDER))
                .map(UserView::of)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public UserView get(UUID id) {
        return UserView.of(find(id));
    }

    /** FR-USER-01: an individual account, never a shared login. */
    @Override
    @Transactional
    public UserView create(UserRequest request, PosPrincipal actor, String clientIp) {
        String username = request.username().trim();
        if (users.existsByUsernameIgnoreCase(username)) {
            throw CatalogueListException.duplicate("user", username);
        }
        if (request.password() == null || request.password().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A new account needs a password");
        }
        if (request.email() != null && !request.email().isBlank()
                && users.existsByEmailIgnoreCase(request.email().trim())) {
            throw CatalogueListException.duplicate("user", request.email().trim());
        }

        User user = new User(username, request.fullName().trim(), passwords.encode(request.password()));
        // FR-AUTH-07: whoever creates the account knows the password they typed
        // into the form. It gets the new member of staff through the door once,
        // and then they choose their own.
        user.requirePasswordChange();
        applyContact(request, user);
        applyRoles(request.roles(), user);
        applyOutlets(request.outletIds(), user);
        if (request.pin() != null && !request.pin().isBlank()) user.setPinHash(pins.encode(request.pin()));

        User saved = users.save(user);

        audit.record(actor.userId(), "USER_CREATED", "user", saved.getId(), null, snapshot(saved),
                actor.outletId(), null, clientIp);
        return UserView.of(saved);
    }

    /**
     * FR-USER-04 · BR-16: edit an account.
     *
     * <p>Editing your own name or phone is fine; changing your own roles is not.
     * The check is on the roles rather than on the whole request, so nobody is
     * locked out of their own profile by a rule about privileges.
     */
    @Override
    @Transactional
    public UserView update(UUID id, UserRequest request, PosPrincipal actor, String clientIp) {
        User user = find(id);
        Map<String, Object> before = snapshot(user);

        String username = request.username().trim();
        users.findByUsernameOrEmail(username)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> { throw CatalogueListException.duplicate("user", username); });

        Set<Role> requestedRoles = request.roles().stream().map(this::roleOf)
                .collect(java.util.stream.Collectors.toCollection(() -> EnumSet.noneOf(Role.class)));
        if (actor.userId().equals(id) && !requestedRoles.equals(user.getRoles())) {
            throw new AccessDeniedException("You cannot change your own roles");
        }

        user.setUsername(username);
        user.setFullName(request.fullName().trim());
        applyContact(request, user);
        applyRoles(request.roles(), user);
        applyOutlets(request.outletIds(), user);

        if (request.password() != null && !request.password().isBlank()) {
            user.changePassword(passwords.encode(request.password()), java.time.Instant.now());
        }
        if (request.pin() != null && !request.pin().isBlank()) {
            user.setPinHash(pins.encode(request.pin()));
        }

        audit.record(actor.userId(), "USER_UPDATED", "user", id, before, snapshot(user),
                actor.outletId(), null, clientIp);
        return UserView.of(user);
    }

    /**
     * FR-USER-03 · FR-USER-08 · BR-16: grant or withhold one permission for one
     * person, on top of what their roles give them.
     *
     * <p>Every change is audited with the code and the direction, because
     * "someone gained a right" is exactly the thing an audit log exists to
     * answer later.
     */
    @Override
    @Transactional
    public UserView setPermission(UUID id, String code, Boolean granted, PosPrincipal actor, String clientIp) {
        if (actor.userId().equals(id)) {
            throw new AccessDeniedException("You cannot change your own permissions");
        }

        User user = find(id);
        Permission permission = Permission.fromCode(code)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown permission"));

        boolean had = user.resolvePermissions().contains(permission);
        if (granted == null) {
            // Back to whatever the roles say — not the same as revoking it.
            user.clearOverride(permission);
        } else {
            user.override(permission, granted);
        }
        boolean has = user.resolvePermissions().contains(permission);

        // The permission code is the field name, not a value beside it. The
        // audit renderer shows what changed and omits what did not, so a code
        // carried in an unchanged field would never appear — leaving an entry
        // that says a right changed without saying which.
        audit.record(actor.userId(), "USER_PERMISSION_CHANGED", "user", id,
                Map.of(code, had),
                Map.of(code, has, "override", granted == null ? "cleared" : granted.toString()),
                actor.outletId(), null, clientIp);

        return UserView.of(user);
    }

    /** FR-USER-07 · BR-17: deactivated, never deleted. */
    @Override
    @Transactional
    public UserView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp) {
        if (actor.userId().equals(id)) {
            // Locking yourself out is not a permission change, but it is the
            // same class of mistake and just as hard to undo.
            throw new AccessDeniedException("You cannot deactivate your own account");
        }

        User user = find(id);
        if (active) user.activate(); else user.deactivate();

        audit.record(actor.userId(), active ? "USER_REACTIVATED" : "USER_DEACTIVATED", "user", id,
                null, Map.of("username", user.getUsername()), actor.outletId(), null, clientIp);
        return UserView.of(user);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean holdsPermission(UUID userId, Permission permission) {
        if (userId == null) return false;
        return users.findById(userId)
                .filter(User::isActive)
                .map(user -> user.resolvePermissions().contains(permission))
                .orElse(false);
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Role> rolesOf(UUID userId) {
        if (userId == null) return Set.of();
        return users.findById(userId)
                .filter(User::isActive)
                .map(user -> Set.copyOf(user.getRoles()))
                .orElse(Set.of());
    }

    /** FR-USER-02 · `J-06`: the catalogue the permission matrix is drawn from. */
    @Override
    public List<PermissionInfo> permissionCatalogue() {
        return Arrays.stream(Permission.values())
                .map(permission -> new PermissionInfo(permission.code(), permission.group().name(),
                        permission.description(), permission.isFutureStage()))
                .toList();
    }

    @Override
    public List<RoleInfo> roleCatalogue() {
        return Arrays.stream(Role.values())
                .map(role -> new RoleInfo(role.key(),
                        role.baseline().stream().map(Permission::code).sorted().toList()))
                .toList();
    }

    // --- internals ---------------------------------------------------------

    private User find(UUID id) {
        return users.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
    }

    private Role roleOf(String key) {
        return Arrays.stream(Role.values())
                .filter(role -> role.key().equalsIgnoreCase(key))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown role: " + key));
    }

    private void applyContact(UserRequest request, User user) {
        user.setEmail(blankToNull(request.email()));
        user.setPhone(blankToNull(request.phone()));
    }

    private void applyRoles(List<String> roles, User user) {
        Set<Role> wanted = roles.stream().map(this::roleOf)
                .collect(java.util.stream.Collectors.toCollection(() -> EnumSet.noneOf(Role.class)));
        Set<Role> current = EnumSet.copyOf(user.getRoles().isEmpty() ? EnumSet.noneOf(Role.class) : user.getRoles());

        current.stream().filter(role -> !wanted.contains(role)).forEach(user::removeRole);
        wanted.stream().filter(role -> !current.contains(role)).forEach(user::assignRole);
    }

    private void applyOutlets(List<UUID> outletIds, User user) {
        for (UUID outletId : outletIds) {
            if (!outlets.existsById(outletId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No such branch: " + outletId);
            }
        }
        Set<UUID> wanted = new LinkedHashSet<>(outletIds);
        Set<UUID> current = new LinkedHashSet<>(user.getOutletIds());

        current.stream().filter(id -> !wanted.contains(id)).forEach(user::unassignOutlet);
        wanted.stream().filter(id -> !current.contains(id)).forEach(user::assignOutlet);
    }

    private Map<String, Object> snapshot(User user) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("username", user.getUsername());
        state.put("fullName", user.getFullName());
        state.put("email", user.getEmail());
        state.put("phone", user.getPhone());
        state.put("roles", user.getRoles().stream().map(Role::key).sorted().toList());
        state.put("outlets", user.getOutletIds().size());
        state.put("active", user.isActive());
        return state;
    }

    private String blankToNull(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }
}
