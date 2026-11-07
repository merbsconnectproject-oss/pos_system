package gh.giftedlabs.pos.support;

import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.RolePermissionService;

import java.util.EnumMap;
import java.util.Map;
import java.util.Set;

/**
 * Role grants as the system ships them, for unit tests with no database.
 *
 * <p>What a role grants is editable at runtime, so services take a
 * {@link RolePermissionService}. A unit test asserting a rule about the default
 * matrix wants the defaults and nothing else — mocking it per test would put the
 * same four lines in every one of them.
 */
public final class ShippedRoleGrants implements RolePermissionService {

    @Override
    public Map<Role, Set<Permission>> current() {
        Map<Role, Set<Permission>> shipped = new EnumMap<>(Role.class);
        for (Role role : Role.values()) shipped.put(role, role.baseline());
        return Map.copyOf(shipped);
    }

    @Override
    public Set<Permission> grantedTo(Role role) {
        return role.baseline();
    }

    @Override
    public Map<Role, Set<Permission>> replace(Role role, Set<Permission> permissions,
                                              PosPrincipal actor, String clientIp) {
        throw new UnsupportedOperationException(
                "a unit test on the shipped defaults should not be changing them");
    }

    @Override
    public Map<Role, Set<Permission>> resetToDefaults(Role role, PosPrincipal actor, String clientIp) {
        return current();
    }
}
