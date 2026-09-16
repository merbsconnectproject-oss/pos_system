package gh.giftedlabs.pos.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.dto.SyncView;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.SyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Channel 2 — transactions, shop → owner.
 *
 * <p>Rows are serialised by Postgres itself ({@code row_to_json}) and rebuilt by
 * Postgres at the far end ({@code json_populate_record}). Hand-mapping fifteen
 * tables in both directions would be thirty places for a column added later to
 * be forgotten, and the failure would be silent — a field that simply stopped
 * arriving.
 *
 * <p>Idempotent by construction. Every key is a UUID generated where the row was
 * made, so applying a batch twice inserts nothing the second time. That matters
 * because the alternative to "safe to repeat" is "must never be repeated", and
 * something will always repeat it.
 */
@Service
public class SyncServiceImpl implements SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncServiceImpl.class);

    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss").withZone(java.time.ZoneOffset.UTC);

    private final NamedParameterJdbcTemplate jdbc;
    private final OffsiteStore store;
    private final PosProperties properties;
    private final ObjectMapper json;
    private final ConfigurationChannel configuration;
    private final AuditService audit;
    private final Clock clock;

    public SyncServiceImpl(NamedParameterJdbcTemplate jdbc, OffsiteStore store,
                           PosProperties properties, ObjectMapper json,
                           ConfigurationChannel configuration, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.store = store;
        this.properties = properties;
        this.json = json;
        this.configuration = configuration;
        this.audit = audit;
        this.clock = clock;
    }

    // --- channel 1, delegated ----------------------------------------------

    @Override
    public gh.giftedlabs.pos.dto.SyncView.Configuration publishConfiguration(
            UUID outletId, PosPrincipal actor, String clientIp) {
        return configuration.publish(outletId, actor, clientIp);
    }

    @Override
    public gh.giftedlabs.pos.dto.SyncView.Configuration pullConfiguration(
            PosPrincipal actor, String clientIp) {
        return configuration.pull(actor, clientIp);
    }

    // --- channel 2, up ------------------------------------------------------

    @Override
    @Transactional
    public SyncView.Transfer push(PosPrincipal actor, String clientIp) {
        PosProperties.Offsite offsite = properties.backup().offsite();
        if (!offsite.isConfigured()) {
            return new SyncView.Transfer(false, 0, 0, Map.of(), List.of(),
                    "No bucket is configured, so there is nowhere to send anything.");
        }

        String outletCode = outletCode();
        ObjectNode batch = json.createObjectNode();
        batch.put("outlet", outletCode);
        batch.put("generatedAt", clock.instant().toString());

        ObjectNode tables = batch.putObject("tables");
        Map<String, Integer> counts = new LinkedHashMap<>();
        int total = 0;

        for (SyncTables.Spec spec : SyncTables.UP) {
            List<String> rows = jdbc.getJdbcTemplate().queryForList(
                    "select row_to_json(t)::text from %s t where %s"
                            .formatted(spec.table(), spec.selection()), String.class);
            if (rows.isEmpty()) continue;

            var array = tables.putArray(spec.table());
            for (String row : rows) array.add(readTree(row));
            counts.put(spec.table(), rows.size());
            total += rows.size();
        }

        if (total == 0) {
            return new SyncView.Transfer(true, 0, 0, Map.of(), List.of(),
                    "Everything here has already been sent.");
        }

        long sequence = nextSequence(outletCode);
        batch.put("sequence", sequence);

        // Zero-padded so that lexical order is chronological order: the owner
        // lists the bucket and applies what comes back in the order it is given.
        String key = "data/%s/%06d-%s.json".formatted(outletCode, sequence, STAMP.format(clock.instant()));
        byte[] body = batch.toString().getBytes(StandardCharsets.UTF_8);

        // Uploaded before anything is stamped. If the upload fails the rows stay
        // unsent and the next push picks them up; stamping first would lose them
        // quietly, which is the one outcome worth engineering against.
        store.putBytes(body, key, "application/json", offsite);

        Instant now = clock.instant();
        for (SyncTables.Spec spec : SyncTables.UP) {
            if (spec.stampBy() == null || !counts.containsKey(spec.table())) continue;

            if (SyncTables.WATERMARK.equals(spec.stampBy())) {
                // The table refuses updates by trigger, so the position is kept
                // beside it. Advanced to the newest row actually sent, never to
                // "now" — anything written between the select above and here has
                // not been sent, and must not be skipped.
                jdbc.getJdbcTemplate().update(
                        ("insert into sync_watermark (table_name, last_sent_at) "
                                + "select ?, max(%s) from %s t where %s "
                                + "on conflict (table_name) do update set "
                                + "last_sent_at = excluded.last_sent_at")
                                .formatted(spec.markOn(), spec.table(), spec.selection()),
                        spec.table());
                continue;
            }

            jdbc.getJdbcTemplate().update(
                    "update %s set synced_at = ? where %s".formatted(spec.table(), spec.selection()),
                    java.sql.Timestamp.from(now));
        }

        recordBatch(key, outletCode, sequence, "PUSHED", total, body.length);
        audit.record(actor.userId(), "SYNC_PUSHED", "sync_batch", null, null,
                Map.of("key", key, "rows", total, "sequence", sequence),
                actor.outletId(), null, clientIp);

        return new SyncView.Transfer(true, 1, total, counts, List.of(key),
                "Sent %d rows to the owner's view.".formatted(total));
    }

    // --- channel 2, down ----------------------------------------------------

    @Override
    @Transactional
    public SyncView.Transfer ingest(PosPrincipal actor, String clientIp) {
        PosProperties.Offsite offsite = properties.backup().offsite();
        if (!offsite.isConfigured()) {
            return new SyncView.Transfer(false, 0, 0, Map.of(), List.of(),
                    "No bucket is configured, so there is nothing to read.");
        }

        Set<String> alreadyIn = new HashSet<>(jdbc.getJdbcTemplate().queryForList(
                "select object_key from sync_batch where direction = 'INGESTED'", String.class));

        List<String> waiting = store.list("data/", offsite).stream()
                .filter(key -> key.endsWith(".json"))
                .filter(key -> !alreadyIn.contains(key))
                .toList();

        if (waiting.isEmpty()) {
            return new SyncView.Transfer(true, 0, 0, Map.of(), List.of(),
                    "Nothing new to bring in.");
        }

        Map<String, Integer> counts = new LinkedHashMap<>();
        List<String> applied = new ArrayList<>();
        int total = 0;

        for (String key : waiting) {
            Optional<byte[]> body = store.get(key, offsite);
            if (body.isEmpty()) continue;

            JsonNode batch = readTree(new String(body.get(), StandardCharsets.UTF_8));
            JsonNode tables = batch.path("tables");
            int rows = 0;

            // In declared order, which is dependency order. A batch applied any
            // other way meets a foreign key that does not exist yet.
            for (SyncTables.Spec spec : SyncTables.UP) {
                JsonNode array = tables.get(spec.table());
                if (array == null || !array.isArray()) continue;
                for (JsonNode row : array) rows += apply(spec, row);
            }

            recordBatch(key, batch.path("outlet").asText(""), batch.path("sequence").asLong(0),
                    "INGESTED", rows, body.get().length);
            counts.merge(batch.path("outlet").asText("?"), rows, Integer::sum);
            applied.add(key);
            total += rows;
        }

        audit.record(actor.userId(), "SYNC_INGESTED", "sync_batch", null, null,
                Map.of("batches", applied.size(), "rows", total),
                actor.outletId(), null, clientIp);

        return new SyncView.Transfer(true, applied.size(), total, counts, applied,
                "Brought in %d rows from %d batch(es).".formatted(total, applied.size()));
    }

    /**
     * One row, rebuilt by Postgres from its own JSON.
     *
     * <p>{@code on conflict do nothing} for anything append-only, so a repeated
     * batch is a no-op; a real upsert only where the shop may legitimately have
     * changed the row since — and even then the shop is the only writer, so
     * "last one wins" cannot lose somebody else's edit.
     */
    private int apply(SyncTables.Spec spec, JsonNode row) {
        String sql = spec.upsert()
                ? """
                  insert into %1$s select (json_populate_record(null::%1$s, cast(:row as json))).*
                  on conflict (%2$s) do update set %3$s
                  """.formatted(spec.table(), spec.conflict(), updateAssignments(spec))
                : """
                  insert into %1$s select (json_populate_record(null::%1$s, cast(:row as json))).*
                  on conflict (%2$s) do nothing
                  """.formatted(spec.table(), spec.conflict());

        // A savepoint, and not merely a catch. Postgres aborts the whole
        // transaction on any error, so catching the exception and carrying on
        // only means the next statement fails with "current transaction is
        // aborted" and the entire ingest dies — one row a trigger dislikes and
        // the owner sees nothing from any shop, with a stack trace that names
        // the wrong statement. The savepoint is what makes "skip this row"
        // actually skip only that row.
        jdbc.getJdbcTemplate().execute("savepoint sync_row");
        try {
            int applied = jdbc.update(sql, new MapSqlParameterSource("row", row.toString()));
            jdbc.getJdbcTemplate().execute("release savepoint sync_row");
            return applied;
        } catch (RuntimeException refused) {
            jdbc.getJdbcTemplate().execute("rollback to savepoint sync_row");

            // Logged with its table so somebody can see what did not arrive,
            // rather than the owner's view quietly being short by one sale.
            log.error("Sync: {} row rejected: {}", spec.table(), refused.getMessage());
            return 0;
        }
    }

    /** Every column but the conflict key, set from the incoming row. */
    private String updateAssignments(SyncTables.Spec spec) {
        Set<String> keys = Arrays.stream(spec.conflict().split(","))
                .map(String::trim).collect(java.util.stream.Collectors.toSet());

        List<String> columns = jdbc.getJdbcTemplate().queryForList(
                "select column_name from information_schema.columns "
                        + "where table_schema = current_schema() and table_name = ?",
                String.class, spec.table());

        String assignments = columns.stream()
                .filter(column -> !keys.contains(column))
                .map(column -> "%1$s = excluded.%1$s".formatted(column))
                .collect(java.util.stream.Collectors.joining(", "));

        // A table whose only columns are its key has nothing to update; setting
        // the key to itself is valid SQL and says what is meant.
        return assignments.isBlank() ? "%1$s = excluded.%1$s".formatted(keys.iterator().next())
                : assignments;
    }

    // --- status -------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public SyncView.Status status() {
        PosProperties.Offsite offsite = properties.backup().offsite();
        String outletCode = outletCode();

        Map<String, Long> pending = new LinkedHashMap<>();
        long total = 0;
        for (SyncTables.Spec spec : SyncTables.UP) {
            if (spec.stampBy() == null) continue;
            Long count = jdbc.getJdbcTemplate().queryForObject(
                    "select count(*) from %s t where %s".formatted(spec.table(), spec.selection()),
                    Long.class);
            if (count != null && count > 0) {
                pending.put(spec.table(), count);
                total += count;
            }
        }

        Map<String, Object> last = lastBatch(outletCode);
        Instant lastPushed = last.get("recorded_at") instanceof java.sql.Timestamp at
                ? at.toInstant() : null;
        long lastSequence = last.get("sequence") instanceof Number number ? number.longValue() : 0;

        String summary;
        if (!offsite.isConfigured()) {
            summary = "No bucket is configured. Nothing is being sent to the owner's view.";
        } else if (total == 0) {
            summary = "Everything here has reached the owner's view.";
        } else {
            // Deliberately not an alarm. The till does not need the network to
            // trade; this only says how far behind the owner's view is.
            summary = "%d row(s) are waiting to be sent.".formatted(total);
        }

        return new SyncView.Status(offsite.isConfigured(), outletCode,
                properties.deployment().mode().name(), total, pending,
                lastPushed, lastSequence, configuration.lastPulledAt(), summary);
    }

    // --- internals ----------------------------------------------------------

    private String outletCode() {
        String configured = properties.deployment().outletCode();
        if (configured != null && !configured.isBlank()) return configured.toUpperCase(Locale.ROOT);
        // A single-outlet instance knows which shop it is without being told.
        List<String> codes = jdbc.getJdbcTemplate().queryForList(
                "select code from outlet where is_active = true order by code", String.class);
        return codes.size() == 1 ? codes.getFirst() : "ALL";
    }

    /** Per-outlet, so two shops cannot both write batch 7. */
    private long nextSequence(String outletCode) {
        Long next = jdbc.getJdbcTemplate().queryForObject("""
                insert into sync_sequence (outlet_code, next_value) values (?, 2)
                on conflict (outlet_code)
                  do update set next_value = sync_sequence.next_value + 1
                returning next_value - 1
                """, Long.class, outletCode);
        return next == null ? 1 : next;
    }

    private void recordBatch(String key, String outletCode, long sequence, String direction,
                             int rows, long bytes) {
        jdbc.getJdbcTemplate().update("""
                insert into sync_batch (id, object_key, outlet_code, sequence, direction,
                                        row_count, byte_count)
                values (?, ?, ?, ?, ?, ?, ?)
                on conflict (object_key, direction) do nothing
                """, UUID.randomUUID(), key, outletCode, sequence, direction, rows, bytes);
    }

    private Map<String, Object> lastBatch(String outletCode) {
        List<Map<String, Object>> rows = jdbc.getJdbcTemplate().queryForList("""
                select sequence, recorded_at from sync_batch
                 where direction = 'PUSHED' and outlet_code = ?
                 order by sequence desc limit 1
                """, outletCode);
        return rows.isEmpty() ? Map.of() : rows.getFirst();
    }

    private JsonNode readTree(String value) {
        try {
            return json.readTree(value);
        } catch (Exception malformed) {
            throw new IllegalStateException("Could not read a sync payload", malformed);
        }
    }
}
