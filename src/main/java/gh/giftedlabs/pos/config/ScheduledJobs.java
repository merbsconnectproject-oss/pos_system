package gh.giftedlabs.pos.config;

import gh.giftedlabs.pos.entity.BackupRun;
import gh.giftedlabs.pos.service.BackupService;
import gh.giftedlabs.pos.service.InventoryService;
import gh.giftedlabs.pos.service.ShiftService;
import gh.giftedlabs.pos.service.SettingsService;
import gh.giftedlabs.pos.repository.ProductRepository;
import gh.giftedlabs.pos.repository.StockLevelRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.SyncService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * The two jobs this system runs on its own — NFR-6, NFR-17.
 *
 * <p>Both were specified and neither was scheduled. {@code InventoryService.drift}
 * has existed since F and nothing ever called it, which is the quiet way a
 * requirement gets marked done: the code to satisfy it exists and never runs.
 */
@Configuration
@EnableScheduling
public class ScheduledJobs {

    private static final Logger log = LoggerFactory.getLogger(ScheduledJobs.class);

    private final BackupService backups;
    private final InventoryService inventory;
    private final ProductRepository products;
    private final StockLevelRepository levels;
    private final PosProperties properties;
    private final ObjectProvider<SyncService> sync;
    private final ShiftService shifts;
    private final SettingsService settings;
    private final Clock clock;
    private final ZoneId shiftZone;
    private volatile Instant lastCloudSyncAttempt;

    public ScheduledJobs(BackupService backups, InventoryService inventory,
                         ProductRepository products, StockLevelRepository levels,
                         PosProperties properties, ObjectProvider<SyncService> sync,
                         ShiftService shifts, SettingsService settings, Clock clock,
                         @Value("${pos.shift.auto-close-zone:Africa/Accra}") String shiftZone) {
        this.backups = backups;
        this.inventory = inventory;
        this.products = products;
        this.levels = levels;
        this.properties = properties;
        this.sync = sync;
        this.shifts = shifts;
        this.settings = settings;
        this.clock = clock;
        this.shiftZone = ZoneId.of(shiftZone);
    }

    /**
     * Close the day's still-open shifts at 23:00 local time.
     *
     * <p>The same check runs once at startup. A counter switched off at 23:00
     * cannot execute a timer, so startup closes only shifts older than the most
     * recent 23:00 boundary; a shift opened this morning remains untouched.
     */
    @Scheduled(cron = "${pos.shift.auto-close-cron:0 0 23 * * *}",
            zone = "${pos.shift.auto-close-zone:Africa/Accra}")
    @EventListener(ApplicationReadyEvent.class)
    public void closeOverdueShifts() {
        if (!properties.deployment().isCounter()) return;

        ZonedDateTime now = ZonedDateTime.ofInstant(clock.instant(), shiftZone);
        ZonedDateTime cutoff = now.toLocalDate().atTime(LocalTime.of(23, 0)).atZone(shiftZone);
        if (now.isBefore(cutoff)) cutoff = cutoff.minusDays(1);

        int closed = shifts.autoCloseDue(cutoff.toInstant());
        if (closed > 0) {
            log.info("Shift close: automatically closed {} shift(s) at the 23:00 boundary", closed);
        }
    }

    /**
     * NFR-6 · NFR-7: the backup.
     *
     * <p>Fixed delay rather than a fixed rate, so a slow dump on a busy machine
     * cannot queue the next one behind it. The interval is the gap between
     * finishing and starting again, which is the honest reading of "every
     * fifteen minutes" on hardware that might be doing something else.
     *
     * <p>The off switch is checked here, in the body. {@code @ConditionalOnProperty}
     * gates {@code @Bean} methods; on a {@code @Scheduled} one it is inert, so
     * this ran on its timer whatever {@code pos.backup.enabled} said. Manual
     * backups stay available either way — the toggle governs the timer, not the
     * button an owner presses before a stocktake.
     */
    @Scheduled(fixedDelayString = "${pos.backup.interval:PT15M}", initialDelay = 60_000)
    public void backup() {
        if (!properties.backup().enabled()) return;
        backups.run(BackupRun.Kind.SCHEDULED, null);
    }

    /**
     * Sends this shop's trading to the owner, on an interval.
     *
     * <p>Without this the owner's view is only as current as somebody at each
     * counter remembering to press a button — which on a till is never. The
     * screen keeps the button for when a shop wants to push now, before closing
     * or after a spell offline.
     *
     * <p>Fixed delay, not a fixed rate: a batch that takes a while on a busy
     * machine must not have the next one queued behind it.
     *
     * <p>Never throws. A push that cannot reach the bucket is not a problem the
     * till should hear about — the rows stay unsent and the next attempt picks
     * them up. This is the whole reason nothing on the selling path touches the
     * network.
     */
    @Scheduled(fixedDelayString = "${pos.consolidator.push-interval:PT15M}", initialDelay = 120_000)
    public synchronized void pushToHeadOffice() {
        if (!properties.backup().offsite().isConfigured()) return;
        // The owner's own instance receives; it does not send to itself.
        if (properties.deployment().isConsolidator()) return;

        Instant now = clock.instant();
        var interval = settings.cloudSyncInterval();
        if (lastCloudSyncAttempt != null && now.isBefore(lastCloudSyncAttempt.plus(interval))) return;
        // Failed uploads also respect the chosen interval. Otherwise an outage
        // would turn the inexpensive schedule into a request every scheduler tick.
        lastCloudSyncAttempt = now;

        try {
            var sent = sync.getObject().push(systemActor(), "scheduled");
            if (sent.rows() > 0) {
                log.info("Cloud Sync: sent {} row(s)", sent.rows());
            }
        } catch (RuntimeException unreachable) {
            // Logged at warn, not error: a shop with no line is the expected
            // state half the time, and an error a day trains people to ignore
            // the log.
            log.warn("Cloud Sync: upload deferred — {}", unreachable.getMessage());
        }
    }

    /**
     * Who the scheduler is, for the audit trail.
     *
     * <p>A null actor rather than a borrowed account. BR-15 wants to know who did
     * something, and attributing a timer to whichever person happened to be
     * signed in would be worse than saying plainly that nobody did.
     */
    private PosPrincipal systemActor() {
        return new PosPrincipal(null, "scheduler", null, java.time.Instant.now());
    }

    /**
     * NFR-17 · BR-2: does every stock level still equal the sum of its
     * movements?
     *
     * <p>It should, by construction — the level and the movement are written in
     * one transaction. This is the check that says so out loud, because "by
     * construction" is an argument and drift is a fact.
     *
     * <p>Reports rather than corrects. A number that silently repaired itself
     * would hide the bug that caused it, and the ledger is the truth (BR-2) —
     * so a mismatch is something to investigate, not to paper over.
     */
    @Scheduled(cron = "${pos.reconcile.cron:0 30 2 * * *}")
    public void reconcileStock() {
        int checked = 0;
        int drifted = 0;

        for (var level : levels.findAll()) {
            BigDecimal drift = inventory.drift(level.getProductId(), level.getOutletId());
            checked++;
            if (drift.signum() != 0) {
                drifted++;
                String name = products.findById(level.getProductId())
                        .map(product -> product.getName()).orElse(level.getProductId().toString());
                log.error("BR-2 drift: {} at outlet {} is off by {} — the level and the ledger disagree",
                        name, level.getOutletId(), drift);
            }
        }

        if (drifted == 0) log.info("Stock reconciliation: {} levels checked, all match the ledger", checked);
        else log.error("Stock reconciliation: {} of {} levels disagree with the ledger", drifted, checked);
    }
}
