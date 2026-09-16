package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.RolePermissionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

/**
 * FR-USER-02 · BR-16.
 *
 * <p>Held in memory and rebuilt on every write. Permission resolution happens on
 * every authenticated request — {@code SessionGuardFilter} re-resolves so that a
 * revoke takes effect on the next click — and going to the database for the role
 * baselines each time would put a query on every request to save a map of four
 * entries.
 *
 * <p>The cache is safe because this is the only writer. Two instances would each
 * hold their own, which is correct for the topology: a shop's roles arrive
 * through the configuration channel, not by two servers sharing a table.
 */
@Service
public class RolePermissionServiceImpl implements RolePermissionService {

    private static final Logger log = LoggerFactory.getLogger(RolePermissionServiceImpl.class);

    private final JdbcTemplate jdbc;
    private final AuditService audit;

    /** Rebuilt wholesale on write; never mutated in place. */
    private final AtomicReference<Map<Role, Set<Permission>>> cache =
            new AtomicReference<>(Map.of());

    public RolePermissionServiceImpl(JdbcTemplate jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /**
     * Seeds each permission code once, ever, then loads.
     *
     * <p>Seeded here rather than in the migration so the defaults live in exactly
     * one place. A hundred INSERT statements in SQL would be a second copy of the
     * baselines, free to drift from the ones the contract vectors assert — which
     * is the very thing the original all-enum decision was protecting against.
     *
     * <p>The unit of seeding is the <em>code</em>, not the table. Guarding on
     * "role_permission is empty" was correct exactly once: a code shipped later
     * reached every fresh install and no running one, so the shop that had been
     * trading for a month was the one that silently lacked the new permission.
     * Guarding on nothing at all is worse — it would restore, on every restart,
     * every grant the owner had deliberately revoked. So
     * {@code role_permission_seeded} records which codes have ever been offered,
     * and each is handed to its default roles exactly once.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void seedAndLoad() {
        Set<String> alreadyOffered = new HashSet<>(jdbc.queryForList(
                "select permission_code from role_permission_seeded", String.class));

        List<Permission> arriving = Arrays.stream(Permission.values())
                .filter(permission -> !alreadyOffered.contains(permission.code()))
                .toList();

        if (!arriving.isEmpty()) {
            log.info("Seeding {} permission code(s) from the shipped defaults: {}",
                    arriving.size(), arriving.stream().map(Permission::code).toList());

            for (Permission permission : arriving) {
                for (Role role : Role.values()) {
                    if (!role.baseline().contains(permission)) continue;
                    jdbc.update("""
                            insert into role_permission (role_key, permission_code)
                            values (?, ?) on conflict do nothing
                            """, role.key(), permission.code());
                }

                // Recorded whether or not any role wanted it, so a code no role
                // holds by default is not re-offered on every restart.
                jdbc.update("""
                        insert into role_permission_seeded (permission_code)
                        values (?) on conflict do nothing
                        """, permission.code());
            }
        }

        reload();
    }

    @Override
    public Map<Role, Set<Permission>> current() {
        Map<Role, Set<Permission>> held = cache.get();
        // Before the ready event — a unit test, or a very early request — the
        // shipped defaults are the honest answer rather than "nothing".
        return held.isEmpty() ? defaults() : held;
    }

    @Override
    public Set<Permission> grantedTo(Role role) {
        return current().getOrDefault(role, Set.of());
    }

    @Override
    @Transactional
    public Map<Role, Set<Permission>> replace(Role role, Set<Permission> permissions,
                                              PosPrincipal actor, String clientIp) {
        Set<Permission> before = grantedTo(role);

        jdbc.update("delete from role_permission where role_key = ?", role.key());
        for (Permission permission : permissions) {
            jdbc.update("""
                    insert into role_permission (role_key, permission_code, granted_by)
                    values (?, ?, ?) on conflict do nothing
                    """, role.key(), permission.code(), actor == null ? null : actor.userId());
        }
        reload();

        // BR-16: a privilege change is audited with both sides, because "the
        // manager role changed" is not a thing anybody can act on later.
        audit.record(actor == null ? null : actor.userId(), "ROLE_PERMISSIONS_CHANGED",
                "role", null,
                Map.of("role", role.key(), "permissions", codes(before)),
                Map.of("role", role.key(), "permissions", codes(permissions)),
                actor == null ? null : actor.outletId(), null, clientIp);

        return current();
    }

    @Override
    @Transactional
    public Map<Role, Set<Permission>> resetToDefaults(Role role, PosPrincipal actor, String clientIp) {
        return replace(role, role.baseline(), actor, clientIp);
    }

    // --- internals ----------------------------------------------------------

    private void reload() {
        Map<Role, Set<Permission>> loaded = new EnumMap<>(Role.class);
        for (Role role : Role.values()) loaded.put(role, EnumSet.noneOf(Permission.class));

        jdbc.query("select role_key, permission_code from role_permission", rows -> {
            Role role = Role.ofKey(rows.getString("role_key")).orElse(null);
            Permission permission = Permission.ofCode(rows.getString("permission_code")).orElse(null);
            // A code retired from the enum leaves its rows behind; ignoring them
            // is right, and deleting them here would hide a rename that ought to
            // be a migration.
            if (role != null && permission != null) loaded.get(role).add(permission);
        });

        cache.set(Map.copyOf(loaded));
    }

    private Map<Role, Set<Permission>> defaults() {
        Map<Role, Set<Permission>> shipped = new EnumMap<>(Role.class);
        for (Role role : Role.values()) shipped.put(role, role.baseline());
        return Map.copyOf(shipped);
    }

    private List<String> codes(Set<Permission> permissions) {
        return permissions.stream().map(Permission::code).sorted().toList();
    }
}
