package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.ExportService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSetMetaData;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * FR-SET-08: every table the shop owns, written out on request.
 *
 * <p>Read straight from the catalogue rather than from a hand-kept list of
 * entities. A list maintained by hand is a list that silently stops being
 * complete: the first table added after it was written is the one missing from
 * the archive, and nobody finds out until they need the archive.
 *
 * <p>Two tables are excluded and both deliberately — {@code password_reset_token}
 * holds live credentials-reset material, and {@code flyway_schema_history}
 * describes the software rather than the business.
 */
@Service
public class ExportServiceImpl implements ExportService {

    /**
     * Not the shop's data, and not safe to hand over.
     *
     * <p>Password hashes stay in — they are in {@code app_user}, they are
     * Argon2id, and an archive that cannot restore its own users is not an
     * archive. Live reset tokens are different: they are bearer credentials
     * with a short life, and a copy in an export file outlives the reset.
     */
    private static final List<String> EXCLUDED = List.of(
            "password_reset_token", "flyway_schema_history");

    /**
     * The accounting view — what a bookkeeper is actually asking for.
     *
     * <p>Ordered so a reader meets the sale before its lines and payments.
     */
    private static final List<String> ACCOUNTING = List.of(
            "sale", "sale_item", "payment", "sale_return", "sale_return_item",
            "expense", "goods_receipt", "goods_receipt_line",
            "installment_plan", "installment_schedule_item",
            "cash_movement", "shift", "outlet", "app_user", "customer", "supplier", "product");

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public ExportServiceImpl(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    public String filenameFor(Format format) {
        String today = LocalDate.now(clock).toString();
        return format == Format.JSON
                ? "radiance-pos-export-%s.json".formatted(today)
                : "radiance-pos-accounting-%s.zip".formatted(today);
    }

    /**
     * Read-only and in one transaction, so every table in the archive is the
     * same instant of the business. Two tables read seconds apart across a sale
     * would give an archive with a payment for a sale it does not contain.
     */
    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRED)
    public void export(Format format, OutputStream out, PosPrincipal actor, String clientIp) {
        // FR-AUDIT-02: recorded before a byte is written. An export that fails
        // halfway still happened, and who asked for it is the point.
        audit.record(actor.userId(), "DATA_EXPORTED", "settings", null, null,
                Map.of("format", format.name()), null, null, clientIp);

        try {
            if (format == Format.JSON) writeJson(out);
            else writeCsvArchive(out);
        } catch (IOException broken) {
            throw new IllegalStateException("The export could not be written", broken);
        }
    }

    // --- JSON ---------------------------------------------------------------

    private void writeJson(OutputStream out) throws IOException {
        Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        writer.write("{\"exportedAt\":\"%s\",\"tables\":{".formatted(clock.instant()));

        List<String> tables = tables();
        for (int index = 0; index < tables.size(); index++) {
            String table = tables.get(index);
            if (index > 0) writer.write(",");
            writer.write("\"%s\":[".formatted(table));
            writeRowsAsJson(table, writer);
            writer.write("]");
        }

        writer.write("}}");
        writer.flush();
    }

    /**
     * Streamed a row at a time.
     *
     * <p>{@code queryForList} would hold the whole table in memory first, and
     * the sale table is the one that grows without limit — an export is exactly
     * when a shop has years of it.
     */
    private void writeRowsAsJson(String table, Writer writer) {
        jdbc.query("select * from " + quoted(table), resultSet -> {
            ResultSetMetaData meta = resultSet.getMetaData();
            boolean first = true;
            while (resultSet.next()) {
                if (!first) writeQuietly(writer, ",");
                first = false;
                writeQuietly(writer, "{");
                for (int column = 1; column <= meta.getColumnCount(); column++) {
                    if (column > 1) writeQuietly(writer, ",");
                    writeQuietly(writer, "\"%s\":".formatted(escape(meta.getColumnLabel(column))));
                    writeQuietly(writer, jsonValue(resultSet.getObject(column)));
                }
                writeQuietly(writer, "}");
            }
            return null;
        });
    }

    private String jsonValue(Object value) {
        return switch (value) {
            case null -> "null";
            // Numbers unquoted so the archive reads back as numbers; BigDecimal
            // keeps its scale, which matters for money.
            case BigDecimal amount -> amount.toPlainString();
            case Number number -> number.toString();
            case Boolean flag -> flag.toString();
            default -> "\"%s\"".formatted(escape(value.toString()));
        };
    }

    private String escape(String text) {
        StringBuilder escaped = new StringBuilder(text.length() + 8);
        for (char character : text.toCharArray()) {
            switch (character) {
                case '"' -> escaped.append("\\\"");
                case '\\' -> escaped.append("\\\\");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                default -> {
                    if (character < 0x20) escaped.append("\\u%04x".formatted((int) character));
                    else escaped.append(character);
                }
            }
        }
        return escaped.toString();
    }

    // --- CSV ----------------------------------------------------------------

    private void writeCsvArchive(OutputStream out) throws IOException {
        try (ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
            for (String table : ACCOUNTING) {
                zip.putNextEntry(new ZipEntry(table + ".csv"));
                Writer writer = new OutputStreamWriter(zip, StandardCharsets.UTF_8);
                writeRowsAsCsv(table, writer);
                writer.flush();
                zip.closeEntry();
            }
        }
    }

    private void writeRowsAsCsv(String table, Writer writer) {
        jdbc.query("select * from " + quoted(table), resultSet -> {
            ResultSetMetaData meta = resultSet.getMetaData();
            int columns = meta.getColumnCount();

            StringBuilder header = new StringBuilder();
            for (int column = 1; column <= columns; column++) {
                if (column > 1) header.append(',');
                header.append(csvCell(meta.getColumnLabel(column)));
            }
            writeQuietly(writer, header.append('\n').toString());

            while (resultSet.next()) {
                StringBuilder row = new StringBuilder();
                for (int column = 1; column <= columns; column++) {
                    if (column > 1) row.append(',');
                    Object value = resultSet.getObject(column);
                    row.append(value == null ? "" : csvCell(value.toString()));
                }
                writeQuietly(writer, row.append('\n').toString());
            }
            return null;
        });
    }

    /**
     * Quoted whenever the value could otherwise change the shape of the row —
     * and always when it starts with a character a spreadsheet would treat as a
     * formula, which is how a CSV export becomes an attack on whoever opens it.
     */
    private String csvCell(String value) {
        boolean risky = value.startsWith("=") || value.startsWith("+")
                || value.startsWith("-") || value.startsWith("@");
        String body = risky ? "'" + value : value;
        return "\"" + body.replace("\"", "\"\"") + "\"";
    }

    // --- shared -------------------------------------------------------------

    /** Every business table in this schema, in a stable order. */
    private List<String> tables() {
        return jdbc.queryForList("""
                select table_name from information_schema.tables
                 where table_schema = current_schema()
                   and table_type = 'BASE TABLE'
                 order by table_name
                """, String.class)
                .stream()
                .filter(table -> !EXCLUDED.contains(table))
                .toList();
    }

    /**
     * Table names come from {@code information_schema} or a constant list, so
     * they are already this database's own. Quoted anyway, because the day one
     * is called {@code order} is the day an unquoted name becomes a syntax
     * error in production rather than in a test.
     */
    private String quoted(String table) {
        return "\"" + table.replace("\"", "\"\"") + "\"";
    }

    private void writeQuietly(Writer writer, String text) {
        try {
            writer.write(text);
        } catch (IOException broken) {
            throw new IllegalStateException("The export could not be written", broken);
        }
    }
}
