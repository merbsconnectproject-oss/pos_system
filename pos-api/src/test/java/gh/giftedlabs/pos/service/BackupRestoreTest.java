package gh.giftedlabs.pos.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.Container;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.junit.jupiter.api.Assertions.*;

/**
 * NFR-6: the "tested" half of "documented and tested restore".
 *
 * <p>A restore procedure nobody has run is a document, not a recovery plan.
 * This takes a real dump of a real database with the same {@code pg_dump}
 * arguments the application uses, destroys the data, puts it back with the
 * same {@code pg_restore} arguments {@code restore.sh} uses, and checks that
 * what was there is there again.
 *
 * <p>It runs inside the container so it needs no client tools on the machine
 * running the tests — and it proves the version of the tools that ships beside
 * the database, which is the pair that will actually be used.
 */
@DisplayName("Backup and restore")
class BackupRestoreTest {

    @Test
    @DisplayName("a dump taken, the data destroyed, and the data back — NFR-6")
    void aDumpRestores() throws Exception {
        String image = System.getProperty("test.postgres.image", "postgres:18");

        try (PostgreSQLContainer postgres = new PostgreSQLContainer(
                DockerImageName.parse(image).asCompatibleSubstituteFor("postgres"))) {
            postgres.start();

            // Something that looks like a day's trading: a table with rows that
            // matter, and a receipt number nobody can regenerate (BR-6).
            sql(postgres, """
                    create table sale_snapshot (
                        receipt_number text primary key,
                        total_pesewas bigint not null
                    );
                    insert into sale_snapshot values
                        ('INC-01-000001', 4000),
                        ('INC-01-000002', 6000),
                        ('INC-01-000003', 12550);
                    """);

            assertEquals("3", one(postgres, "select count(*) from sale_snapshot"),
                    "the fixture should be there before anything is backed up");

            // The application's own arguments — custom format, compressed.
            Container.ExecResult dump = postgres.execInContainer("pg_dump",
                    "--username=" + postgres.getUsername(),
                    "--dbname=" + postgres.getDatabaseName(),
                    "--format=custom",
                    "--file=/tmp/pos-test.dump");
            assertEquals(0, dump.getExitCode(), dump.getStderr());

            // The disk failure, or the mistake: everything gone.
            sql(postgres, "drop table sale_snapshot;");
            assertEquals("0", one(postgres, """
                    select count(*) from information_schema.tables
                     where table_name = 'sale_snapshot'
                    """), "the table should be gone before the restore proves anything");

            // restore.sh's arguments, exactly.
            Container.ExecResult restore = postgres.execInContainer("pg_restore",
                    "--username=" + postgres.getUsername(),
                    "--dbname=" + postgres.getDatabaseName(),
                    "--clean", "--if-exists", "--single-transaction",
                    "/tmp/pos-test.dump");
            assertEquals(0, restore.getExitCode(), restore.getStderr());

            assertEquals("3", one(postgres, "select count(*) from sale_snapshot"),
                    "every row should be back");
            assertEquals("12550", one(postgres,
                    "select total_pesewas from sale_snapshot where receipt_number = 'INC-01-000003'"),
                    "BR-11: the amounts should come back to the pesewa");
            assertEquals("INC-01-000003", one(postgres,
                    "select max(receipt_number) from sale_snapshot"),
                    "BR-6: receipt numbers are not regenerated, so they have to survive the restore");
        }
    }

    @Test
    @DisplayName("a restore into a database that still has data replaces it, not merges it")
    void restoreReplacesRatherThanMerges() throws Exception {
        String image = System.getProperty("test.postgres.image", "postgres:18");

        try (PostgreSQLContainer postgres = new PostgreSQLContainer(
                DockerImageName.parse(image).asCompatibleSubstituteFor("postgres"))) {
            postgres.start();

            sql(postgres, """
                    create table sale_snapshot (receipt_number text primary key, total_pesewas bigint not null);
                    insert into sale_snapshot values ('INC-01-000001', 4000);
                    """);
            Container.ExecResult dump = postgres.execInContainer("pg_dump",
                    "--username=" + postgres.getUsername(), "--dbname=" + postgres.getDatabaseName(),
                    "--format=custom", "--file=/tmp/pos-test.dump");
            assertEquals(0, dump.getExitCode(), dump.getStderr());

            // Trading continued after the backup — these rows are the ones the
            // script warns will be lost.
            sql(postgres, "insert into sale_snapshot values ('INC-01-000002', 9999);");

            Container.ExecResult restore = postgres.execInContainer("pg_restore",
                    "--username=" + postgres.getUsername(), "--dbname=" + postgres.getDatabaseName(),
                    "--clean", "--if-exists", "--single-transaction", "/tmp/pos-test.dump");
            assertEquals(0, restore.getExitCode(), restore.getStderr());

            // One row, not two. A restore that merged would leave a database
            // that is neither the backup nor what was there — and the warning
            // in restore.sh would be a lie.
            assertEquals("1", one(postgres, "select count(*) from sale_snapshot"),
                    "the restore should replace the table, not add to it");
        }
    }

    private void sql(PostgreSQLContainer postgres, String statements) throws Exception {
        Container.ExecResult result = postgres.execInContainer("psql",
                "--username=" + postgres.getUsername(), "--dbname=" + postgres.getDatabaseName(),
                "--quiet", "-c", statements);
        assertEquals(0, result.getExitCode(), result.getStderr());
    }

    private String one(PostgreSQLContainer postgres, String query) throws Exception {
        Container.ExecResult result = postgres.execInContainer("psql",
                "--username=" + postgres.getUsername(), "--dbname=" + postgres.getDatabaseName(),
                "--tuples-only", "--no-align", "-c", query);
        assertEquals(0, result.getExitCode(), result.getStderr());
        return result.getStdout().trim();
    }
}
