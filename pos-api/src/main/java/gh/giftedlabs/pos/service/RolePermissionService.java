package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.Map;
import java.util.Set;

/**
 * What each role grants — FR-USER-02.
 *
 * <p>The set of permissions that <em>exist</em> is the {@link Permission} enum and
 * stays that way: it is a vocabulary the code switches on. What a role
 * <em>grants</em> is a shop's decision, and this is where that lives.
 *
 * <p>The enum's baselines are the seed and the reset, not the runtime answer. One
 * authority, not two.
 */
public interface RolePermissionService {

    /** The current grants for every role. */
    Map<Role, Set<Permission>> current();

    /** The grants for one role. */
    Set<Permission> grantedTo(Role role);

    /**
     * Replaces one role's grants outright — BR-16.
     *
     * <p>Replace rather than add: taking a right away has to be as possible as
     * giving one, and a merge would make removal impossible.
     */
    Map<Role, Set<Permission>> replace(Role role, Set<Permission> permissions,
                                       PosPrincipal actor, String clientIp);

    /** Puts one role back to what the system ships with. */
    Map<Role, Set<Permission>> resetToDefaults(Role role, PosPrincipal actor, String clientIp);
}
