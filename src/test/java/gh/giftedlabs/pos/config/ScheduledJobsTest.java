package gh.giftedlabs.pos.config;

import gh.giftedlabs.pos.entity.BackupRun;
import gh.giftedlabs.pos.entity.StockLevel;
import gh.giftedlabs.pos.repository.ProductRepository;
import gh.giftedlabs.pos.repository.StockLevelRepository;
import gh.giftedlabs.pos.service.BackupService;
import gh.giftedlabs.pos.service.InventoryService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * NFR-6: the off switch.
 *
 * <p>Written because it did not work. The gate was a {@code @ConditionalOnProperty}
 * on the {@code @Scheduled} method, which gates {@code @Bean} methods and
 * nothing else — so the timer fired every fifteen minutes on a machine whose
 * owner had turned backups off, and the only test that set the flag was
 * setting it to stop a race, so nothing noticed.
 */
@DisplayName("Scheduled jobs")
class ScheduledJobsTest {

    private final BackupService backups = mock(BackupService.class);
    private final gh.giftedlabs.pos.service.SyncService sync =
            mock(gh.giftedlabs.pos.service.SyncService.class);
    private final InventoryService inventory = mock(InventoryService.class);
    private final ProductRepository products = mock(ProductRepository.class);
    private final StockLevelRepository levels = mock(StockLevelRepository.class);

    @Test
    @DisplayName("the timer does not take a backup when backups are switched off — NFR-6")
    void respectsTheOffSwitch() {
        jobs(false).backup();

        verify(backups, never()).run(any(), any());
    }

    @Test
    @DisplayName("and does when they are on, recorded as SCHEDULED rather than MANUAL")
    void backsUpOnTheTimer() {
        jobs(true).backup();

        // The kind is what separates "the machine did this" from "somebody
        // pressed the button", and the status screen shows both.
        verify(backups).run(BackupRun.Kind.SCHEDULED, null);
    }

    /**
     * NFR-17 · BR-2: every level is checked against the sum of its movements.
     *
     * <p>Scheduled since P and never tested, which is the same shape of gap as
     * the one above: {@code InventoryService.drift} existed from F and nothing
     * called it, so the requirement was satisfied by code that never ran.
     */
    @Test
    @DisplayName("reconciliation checks every stock level against the ledger — NFR-17")
    void reconciliationChecksEveryLevel() {
        StockLevel matching = new StockLevel(UUID.randomUUID(), UUID.randomUUID());
        StockLevel drifted = new StockLevel(UUID.randomUUID(), UUID.randomUUID());
        when(levels.findAll()).thenReturn(List.of(matching, drifted));
        when(inventory.drift(matching.getProductId(), matching.getOutletId()))
                .thenReturn(BigDecimal.ZERO);
        when(inventory.drift(drifted.getProductId(), drifted.getOutletId()))
                .thenReturn(new BigDecimal("-2.500"));

        jobs(true).reconcileStock();

        verify(inventory).drift(matching.getProductId(), matching.getOutletId());
        verify(inventory).drift(drifted.getProductId(), drifted.getOutletId());
    }

    @Test
    @DisplayName("and reports drift rather than correcting it — BR-2")
    void reconciliationDoesNotCorrect() {
        StockLevel drifted = new StockLevel(UUID.randomUUID(), UUID.randomUUID());
        when(levels.findAll()).thenReturn(List.of(drifted));
        when(inventory.drift(any(), any())).thenReturn(new BigDecimal("7.000"));

        jobs(true).reconcileStock();

        // A level that silently repaired itself would hide the bug that caused
        // it, and BR-2 makes the ledger the truth — so a mismatch is something
        // to investigate, not to paper over. Nothing is written back.
        verify(levels, never()).save(any());
        verify(levels, never()).saveAll(any());
    }

    @Test
    @DisplayName("the push is skipped with no bucket, and never throws at the till")
    void pushNeedsABucket() {
        // No off-site keys in these properties, so there is nowhere to send.
        // Returning quietly is the point: a shop with no bucket configured must
        // not log an error every fifteen minutes.
        jobs(true).pushToHeadOffice();
        verifyNoInteractions(sync);
    }

    @Test
    @DisplayName("a bucket that cannot be reached is a warning, not a thrown timer")
    void pushSurvivesAnUnreachableBucket() {
        when(sync.push(any(), any())).thenThrow(new RuntimeException("no route to host"));

        // The selling path never touches the network; a timer that threw would
        // still be a scheduler thread dying quietly every quarter hour.
        assertDoesNotThrow(() -> configuredJobs().pushToHeadOffice());
    }

    private ScheduledJobs jobs(boolean backupsEnabled) {
        return new ScheduledJobs(backups, inventory, products, levels,
                properties(backupsEnabled), provider(sync));
    }

    /** The same jobs, with somewhere to push to. */
    private ScheduledJobs configuredJobs() {
        var withBucket = new PosProperties(
                new PosProperties.Deployment(PosProperties.Mode.COUNTER, "INC", "01"),
                properties(true).auth(), properties(true).consolidator(), new PosProperties.Web(""),
                new PosProperties.Backup(true, Duration.ofMinutes(15), "backups",
                        Duration.ofDays(30), Duration.ofDays(2), "pg_dump", Duration.ofMinutes(5),
                        new PosProperties.Offsite("https://example.r2.cloudflarestorage.com",
                                "bucket", "key", "secret", "auto", "")));
        return new ScheduledJobs(backups, inventory, products, levels, withBucket, provider(sync));
    }

    private static <T> org.springframework.beans.factory.ObjectProvider<T> provider(T value) {
        return new org.springframework.beans.factory.ObjectProvider<>() {
            @Override public T getObject() { return value; }
            @Override public T getObject(Object... args) { return value; }
            @Override public T getIfAvailable() { return value; }
            @Override public T getIfUnique() { return value; }
        };
    }

    private PosProperties properties(boolean backupsEnabled) {
        return new PosProperties(
                new PosProperties.Deployment(PosProperties.Mode.COUNTER, "INC", "01"),
                new PosProperties.Auth(5, Duration.ofMinutes(15), Duration.ofMinutes(15),
                        Duration.ofMinutes(15), Duration.ofMinutes(30),
                        "http://localhost/reset", "", "noreply@localhost"),
                new PosProperties.Consolidator(false, "", "", Duration.ofMinutes(15),
                        Duration.ofSeconds(10), new PosProperties.Ingest("", Duration.ofMinutes(45))),
                new PosProperties.Web(""),
                new PosProperties.Backup(backupsEnabled, Duration.ofMinutes(15), "backups",
                        Duration.ofDays(30), Duration.ofDays(2), "pg_dump", Duration.ofMinutes(5),
                        new PosProperties.Offsite("", "", "", "", "auto", "")));
    }
}
