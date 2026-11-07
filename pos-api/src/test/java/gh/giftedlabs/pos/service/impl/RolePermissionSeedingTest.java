package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * How a newly shipped permission code reaches a shop that is already trading.
 *
 * <p>Both halves of this matter and both fail silently. Seed only when
 * {@code role_permission} is empty and a code shipped later never reaches a
 * running install — the shop that has been open a month is the one quietly
 * missing it, and nobody finds out until somebody cannot press a button. Seed
 * unconditionally and every restart restores grants the owner deliberately
 * revoked, which is worse: a permission nobody meant to give, back again, with an
 * audit trail saying it was taken away.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DisplayName("Permission seeding across an upgrade")
class RolePermissionSeedingTest {

    @Autowired RolePermissionServiceImpl seeder;
    @Autowired JdbcTemplate jdbc;

    @AfterEach
    void putItBack() {
        // Whatever the test did, leave the install as the defaults describe it.
        for (Role role : Role.values()) {
            for (Permission permission : role.baseline()) {
                jdbc.update("insert into role_permission (role_key, permission_code) "
                        + "values (?, ?) on conflict do nothing", role.key(), permission.code());
            }
        }
        for (Permission permission : Permission.values()) {
            jdbc.update("insert into role_permission_seeded (permission_code) values (?) "
                    + "on conflict do nothing", permission.code());
        }
        seeder.seedAndLoad();
    }

    @Test
    @DisplayName("a code that has never been seeded reaches its default roles on the next start")
    void aNewCodeArrivesOnUpgrade() {
        // An install that predates sync.push: the grants are gone and so is any
        // record of the code ever having been offered.
        jdbc.update("delete from role_permission where permission_code = ?",
                Permission.SYNC_PUSH.code());
        jdbc.update("delete from role_permission_seeded where permission_code = ?",
                Permission.SYNC_PUSH.code());

        seeder.seedAndLoad();

        assertTrue(granted(Role.CASHIER, Permission.SYNC_PUSH),
                "a cashier should be able to send the day up after the upgrade");
        assertTrue(granted(Role.MANAGER, Permission.SYNC_PUSH));
        assertTrue(granted(Role.OWNER, Permission.SYNC_PUSH));

        // Storekeepers do not sell, so they have no day to send.
        assertFalse(granted(Role.STOREKEEPER, Permission.SYNC_PUSH));
    }

    @Test
    @DisplayName("a grant the owner revoked stays revoked across restarts")
    void aRevokedGrantIsNotResurrected() {
        jdbc.update("delete from role_permission where role_key = ? and permission_code = ?",
                Role.CASHIER.key(), Permission.SYNC_PUSH.code());

        seeder.seedAndLoad();

        // The code is in the ledger, so it is not offered again. An owner who took
        // this away from the counter meant it.
        assertFalse(granted(Role.CASHIER, Permission.SYNC_PUSH),
                "seeding must not restore a grant somebody deliberately removed");
    }

    @Test
    @DisplayName("seeding is recorded per code, so nothing is offered twice")
    void everyShippedCodeIsRecorded() {
        seeder.seedAndLoad();

        Long missing = jdbc.queryForObject("""
                select count(*) from (select unnest(?::text[]) as code) shipped
                 where not exists (select 1 from role_permission_seeded s
                                    where s.permission_code = shipped.code)
                """, Long.class,
                "{" + String.join(",",
                        java.util.Arrays.stream(Permission.values())
                                .map(Permission::code).toList()) + "}");

        assertTrue(missing != null && missing == 0,
                missing + " shipped code(s) are not recorded as seeded, so they would be "
                        + "re-offered on every restart");
    }

    private boolean granted(Role role, Permission permission) {
        Long rows = jdbc.queryForObject(
                "select count(*) from role_permission where role_key = ? and permission_code = ?",
                Long.class, role.key(), permission.code());
        return rows != null && rows > 0;
    }
}
