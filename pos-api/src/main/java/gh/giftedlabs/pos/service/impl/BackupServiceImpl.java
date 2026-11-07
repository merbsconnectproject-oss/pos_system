package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.dto.BackupView;
import gh.giftedlabs.pos.entity.BackupRun;
import gh.giftedlabs.pos.repository.BackupRunRepository;
import gh.giftedlabs.pos.service.BackupService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.URI;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import java.io.OutputStream;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.CipherOutputStream;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * NFR-6 · NFR-7 · FR-SET-07.
 *
 * <p>A full {@code pg_dump} on an interval rather than a nightly one. NFR-7
 * asks for a recovery point of fifteen minutes and a nightly dump has a
 * recovery point of a day; a shop's database is a few megabytes, so dumping it
 * every fifteen minutes costs nothing and the simple thing is also the one
 * that meets the requirement.
 *
 * <p>Custom format ({@code -Fc}), which is compressed and restores selectively
 * with {@code pg_restore}. A plain SQL file is easier to read and much slower
 * to put back, and putting it back under pressure is the whole point.
 */
@Service
public class BackupServiceImpl implements BackupService {

    private static final Logger log = LoggerFactory.getLogger(BackupServiceImpl.class);

    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final BackupRunRepository runs;
    private final PosProperties properties;
    private final Environment environment;
    private final DataSource dataSource;
    private final OffsiteStore offsite;
    private final Clock clock;

    public BackupServiceImpl(BackupRunRepository runs, PosProperties properties,
                             Environment environment, DataSource dataSource,
                             OffsiteStore offsite, Clock clock) {
        this.runs = runs;
        this.properties = properties;
        this.environment = environment;
        this.dataSource = dataSource;
        this.offsite = offsite;
        this.clock = clock;
    }

    /**
     * REQUIRES_NEW so the record of the attempt survives whatever happened
     * during it — the same reason the audit log uses it. A failed backup whose
     * row rolled back is a failure nobody finds out about.
     */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public BackupView run(BackupRun.Kind kind, UUID actorId) {
        PosProperties.Backup config = properties.backup();
        BackupRun record = runs.saveAndFlush(new BackupRun(kind, actorId, clock.instant()));

        Path file = null;
        try {
            Path directory = Paths.get(config.directory()).toAbsolutePath();
            Files.createDirectories(directory);

            String name = "pos-%s.dump".formatted(STAMP.format(clock.instant()));
            file = directory.resolve(name);

            dump(file, config);

            long size = Files.size(file);
            if (size == 0) throw new IOException("pg_dump produced an empty file");

            boolean sentOffsite = false;
            String destination = directory.toString();
            Path encrypted = null;
            if (config.hasOffsite()) {
                // Off-site failure is not backup failure. The local copy still
                // exists and is still worth recording; the status screen shows
                // that it did not leave the machine.
                try {
                    encrypted = directory.resolve(name + ".enc");
                    encryptForOffsite(file, encrypted);
                    destination = offsite.put(encrypted, name + ".enc", config.offsite());
                    sentOffsite = true;
                    Files.deleteIfExists(encrypted);
                } catch (RuntimeException uploadFailed) {
                    if (encrypted != null) try { Files.deleteIfExists(encrypted); } catch (IOException ignored) { }
                    log.warn("Backup {} stayed local: off-site upload failed", name, uploadFailed);
                    destination = directory + " (off-site upload failed: "
                            + uploadFailed.getMessage() + ")";
                }
            }

            record.succeeded(name, size, true, sentOffsite, destination, clock.instant());
            prune(directory, config);

        } catch (Exception failed) {
            log.error("Backup failed", failed);
            record.failed(describe(failed), clock.instant());
            // A half-written dump is worse than none: it looks like a backup.
            if (file != null) {
                try { Files.deleteIfExists(file); } catch (IOException ignored) { /* best effort */ }
            }
        }

        return BackupView.of(runs.saveAndFlush(record));
    }

    /** Encrypts a dump before it leaves the installation (AES-256-GCM). */
    private void encryptForOffsite(Path source, Path target) {
        String encoded = environment.getProperty("POS_BACKUP_ENCRYPTION_KEY", "").trim();
        if (encoded.isBlank()) {
            throw new IllegalStateException("POS_BACKUP_ENCRYPTION_KEY is required for off-site backups");
        }
        try {
            byte[] key = decodeBackupKey(encoded);
            if (key.length != 32) throw new IllegalArgumentException("backup key must decode to 32 bytes");
            byte[] nonce = new byte[12];
            new SecureRandom().nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
            try (OutputStream raw = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
                raw.write("POSENC1".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                raw.write(nonce);
                try (OutputStream out = new CipherOutputStream(raw, cipher)) {
                Files.copy(source, out);
                }
            }
        } catch (Exception failure) {
            try { Files.deleteIfExists(target); } catch (IOException ignored) { }
            throw new IllegalStateException("could not encrypt backup for off-site storage: "
                    + (failure.getMessage() == null ? failure.getClass().getSimpleName() : failure.getMessage()), failure);
        }
    }

    /** Accept both documented base64 and the common `openssl rand -hex 32` form. */
    private byte[] decodeBackupKey(String value) {
        if (value.matches("[0-9a-fA-F]{64}")) {
            byte[] bytes = new byte[32];
            for (int i = 0; i < bytes.length; i++) {
                bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
            }
            return bytes;
        }
        return Base64.getDecoder().decode(value);
    }

    /** FR-SET-07. */
    @Override
    @Transactional(readOnly = true)
    public BackupView.Status status(int historyLimit) {
        PosProperties.Backup config = properties.backup();

        Optional<BackupRun> lastSuccess =
                runs.findFirstByOutcomeOrderByFinishedAtDesc(BackupRun.Outcome.SUCCEEDED);
        Optional<BackupRun> lastOffsite =
                runs.findFirstByOutcomeAndStoredOffsiteTrueOrderByFinishedAtDesc(
                        BackupRun.Outcome.SUCCEEDED);

        // NFR-7: the live recovery point — how much trading a disk failure
        // would cost right now, not the interval somebody configured.
        Long recoveryPoint = lastSuccess
                .map(run -> Duration.between(run.getFinishedAt(), clock.instant()).toMinutes())
                .orElse(null);

        // "Healthy" has to mean off-site. A copy beside the database survives a
        // mistake and not the disk, and the disk is the risk this is for.
        boolean healthy = config.hasOffsite()
                ? lastOffsite.isPresent() && withinTwoIntervals(lastOffsite.get(), config)
                : false;

        // Two independent facts, and an owner needs both. Returning early on
        // the toggle meant a machine with the timer off reported only that and
        // never that its one copy had never left the disk.
        String schedule = config.enabled() ? "" : "Scheduled backups are switched off. ";

        String storage;
        if (lastSuccess.isEmpty()) {
            storage = "No backup has been taken yet.";
        } else if (!config.hasOffsite()) {
            storage = "Copies are kept on this machine only. A disk failure would lose them "
                    + "with the database — add an off-site bucket to fix that.";
        } else if (healthy) {
            storage = "The last backup reached off-site storage %d minutes ago."
                    .formatted(recoveryPoint == null ? 0 : recoveryPoint);
        } else {
            storage = "The last backup did not reach off-site storage.";
        }

        String summary = schedule + storage;

        return new BackupView.Status(
                config.enabled(),
                config.hasOffsite(),
                healthy,
                summary,
                lastSuccess.map(BackupView::of).orElse(null),
                lastOffsite.map(BackupView::of).orElse(null),
                recoveryPoint,
                (int) config.interval().toMinutes(),
                (int) config.retention().toDays(),
                runs.findAllByOrderByStartedAtDesc(PageRequest.of(0, Math.clamp(historyLimit, 1, 200)))
                        .stream().map(BackupView::of).toList());
    }

    // --- internals ---------------------------------------------------------

    private boolean withinTwoIntervals(BackupRun run, PosProperties.Backup config) {
        // One missed run is a blip; two is a pattern worth a red light.
        return run.getFinishedAt() != null && Duration.between(run.getFinishedAt(), clock.instant())
                .compareTo(config.interval().multipliedBy(2)) <= 0;
    }

    /**
     * The password goes in the environment, never on the command line.
     *
     * <p>Arguments are visible to every process on the machine.
     */
    private void dump(Path file, PosProperties.Backup config) throws Exception {
        // Taken from the pool rather than from properties. The connection
        // details do not always arrive as `spring.datasource.*` — Testcontainers
        // supplies them as a bean, and so does any other connection-details
        // provider — and reading the property left this connecting to
        // localhost with no password.
        Credentials credentials = credentials();
        URI jdbc = URI.create(credentials.url().startsWith("jdbc:")
                ? credentials.url().substring("jdbc:".length())
                : credentials.url());
        String database = jdbc.getPath() == null ? "" : jdbc.getPath().replaceFirst("^/", "");

        List<String> command = List.of(
                config.pgDump(),
                "--host=" + (jdbc.getHost() == null ? "localhost" : jdbc.getHost()),
                "--port=" + (jdbc.getPort() == -1 ? 5432 : jdbc.getPort()),
                "--username=" + credentials.username(),
                "--dbname=" + database,
                "--format=custom",
                "--no-password",
                "--file=" + file);

        ProcessBuilder builder = new ProcessBuilder(command);
        // In the environment, never on the command line: arguments are visible
        // to every process on the machine.
        builder.environment().put("PGPASSWORD", credentials.password());
        builder.redirectErrorStream(true);

        Process process = builder.start();

        // Drained on another thread, not inline. `readAllBytes` returns when the
        // stream closes, which is when the process exits — reading it first made
        // the timeout below unreachable, so a pg_dump that hung hung the
        // scheduler with it. Draining still has to happen, or a chatty failure
        // fills the pipe buffer and blocks the process instead.
        CompletableFuture<String> output = CompletableFuture.supplyAsync(() -> {
            try {
                return new String(process.getInputStream().readAllBytes());
            } catch (IOException unreadable) {
                return "";
            }
        });

        if (!process.waitFor(config.timeout().toSeconds(), TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IOException("pg_dump did not finish within " + config.timeout());
        }
        if (process.exitValue() != 0) {
            throw new IOException("pg_dump exited %d: %s"
                    .formatted(process.exitValue(), output.get(5, TimeUnit.SECONDS).trim()));
        }
    }

    /**
     * NFR-6: thirty days of dailies, and everything from the last two days.
     *
     * <p>Two tiers because the two failures are different. A disk dies and you
     * want last night; somebody notices on Tuesday that Monday's stocktake was
     * wrong and you want Monday lunchtime. Keeping every fifteen-minute copy
     * for thirty days would be 2,880 files a month for no extra safety.
     */
    private void prune(Path directory, PosProperties.Backup config) {
        Instant now = clock.instant();
        Instant keepAllAfter = now.minus(config.keepAll());
        Instant deleteBefore = now.minus(config.retention());

        Set<LocalDate> daysKept = new HashSet<>();
        try (DirectoryStream<Path> files = Files.newDirectoryStream(directory, "pos-*.dump")) {
            List<Path> newestFirst = new ArrayList<>();
            files.forEach(newestFirst::add);
            newestFirst.sort(Comparator.comparing(this::modifiedAt).reversed());

            for (Path file : newestFirst) {
                Instant at = modifiedAt(file);
                if (at.isAfter(keepAllAfter)) continue;

                if (at.isBefore(deleteBefore)) { delete(file); continue; }

                LocalDate day = at.atZone(ZoneOffset.UTC).toLocalDate();
                // The first one seen for a day is the newest for that day.
                if (!daysKept.add(day)) delete(file);
            }
        } catch (IOException unreadable) {
            log.warn("Could not prune old backups in {}", directory, unreadable);
        }
    }

    private Instant modifiedAt(Path file) {
        try {
            return Files.getLastModifiedTime(file).toInstant();
        } catch (IOException unreadable) {
            return FileTime.fromMillis(0).toInstant();
        }
    }

    private void delete(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException refused) {
            log.warn("Could not delete old backup {}", file, refused);
        }
    }

    /** Where pg_dump should connect, and as whom. */
    private record Credentials(String url, String username, String password) { }

    private Credentials credentials() {
        if (dataSource instanceof HikariDataSource hikari) {
            return new Credentials(
                    Objects.requireNonNullElse(hikari.getJdbcUrl(), ""),
                    Objects.requireNonNullElse(hikari.getUsername(), ""),
                    Objects.requireNonNullElse(hikari.getPassword(), ""));
        }
        return new Credentials(
                environment.getProperty("spring.datasource.url", ""),
                environment.getProperty("spring.datasource.username", ""),
                environment.getProperty("spring.datasource.password", ""));
    }

    private String describe(Exception failure) {
        String message = failure.getMessage();
        if (message != null && !message.isBlank()) return message;
        return failure.getClass().getSimpleName();
    }
}
