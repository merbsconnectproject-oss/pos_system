package gh.giftedlabs.pos.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.dto.AuditEntryView;
import gh.giftedlabs.pos.service.AuditQueryService;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.time.Instant;
import java.util.*;

/**
 * Reading the audit log — BR-15.
 *
 * <p>JdbcTemplate rather than JPA: this is a report over three tables with no
 * object graph worth building, and the entity is deliberately write-only — the
 * one thing that must never happen here is loading an {@code AuditLog} into a
 * persistence context where a stray flush could try to update it.
 */
@Service
public class AuditQueryServiceImpl implements AuditQueryService {

    private static final String SELECT = """
            select a.id, a.created_at, a.action, a.entity_type, a.entity_id,
                   a.before_json, a.after_json, a.ip_address,
                   u.full_name as actor_name, u.username as actor_username,
                   o.name as outlet_name
              from audit_log a
              left join app_user u on u.id = a.actor_id
              left join outlet   o on o.id = a.outlet_id
             -- Every optional filter is cast explicitly. A bare null bind in
             -- "x is null or col = x" leaves Postgres unable to infer the
             -- parameter's type, and it refuses to prepare the statement.
             where (cast(:action   as text) is null or a.action    = cast(:action   as text))
               and (cast(:actorId  as uuid) is null or a.actor_id  = cast(:actorId  as uuid))
               and (cast(:outletId as uuid) is null or a.outlet_id = cast(:outletId as uuid))
               and (cast(:from as timestamptz) is null or a.created_at >= cast(:from as timestamptz))
               and (cast(:to   as timestamptz) is null or a.created_at <= cast(:to   as timestamptz))
             order by a.created_at desc
             limit :limit offset :offset
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;

    public AuditQueryServiceImpl(NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public List<AuditEntryView> recent(String action, UUID actorId, UUID outletId,
                                       Instant from, Instant to, int limit, int offset) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("action", action)
                .addValue("actorId", actorId == null ? null : actorId.toString())
                .addValue("outletId", outletId == null ? null : outletId.toString())
                .addValue("from", from == null ? null : from.toString())
                .addValue("to", to == null ? null : to.toString())
                .addValue("limit", limit)
                .addValue("offset", offset);

        return jdbc.query(SELECT, parameters, (ResultSet row, int index) -> new AuditEntryView(
                UUID.fromString(row.getString("id")),
                row.getTimestamp("created_at").toInstant(),
                actorName(row.getString("actor_name"), row.getString("actor_username")),
                row.getString("action"),
                entityLabel(row.getString("entity_type"), row.getString("entity_id")),
                Optional.ofNullable(row.getString("outlet_name")).orElse("—"),
                details(row.getString("action"), row.getString("before_json"),
                        row.getString("after_json"), row.getString("ip_address"))));
    }

    /** A deleted or system actor still has to read as something. */
    private String actorName(String fullName, String username) {
        if (fullName != null && !fullName.isBlank()) return fullName;
        if (username != null && !username.isBlank()) return username;
        return "System";
    }

    private String entityLabel(String entityType, String entityId) {
        String type = entityType == null ? "record" : entityType;
        if (entityId == null) return type;
        // The short id is enough to tell two rows apart without making the
        // column unreadable; the full id is on the row itself.
        return "%s %s".formatted(type, entityId.substring(0, 8));
    }

    /**
     * The sentence a person reads, derived from the snapshots.
     *
     * <p>Storing a prose description at write time would freeze today's wording
     * into a table that can never be updated — BR-15 makes the log append-only.
     * Deriving it means the phrasing can improve without rewriting history.
     */
    private String details(String action, String beforeJson, String afterJson, String ip) {
        JsonNode before = parse(beforeJson);
        JsonNode after = parse(afterJson);

        if (before == null && after == null) {
            return ip == null ? "" : "From " + ip;
        }
        if (before == null) {
            return summarise(after);
        }
        if (after == null) {
            return summarise(before);
        }

        List<String> changes = new ArrayList<>();
        after.fieldNames().forEachRemaining(field -> {
            String was = text(before.get(field));
            String now = text(after.get(field));
            if (!Objects.equals(was, now)) {
                changes.add("%s: %s → %s".formatted(field, was, now));
            }
        });
        return changes.isEmpty() ? "No fields changed" : String.join(", ", changes);
    }

    /** Creates and deletions have one side, so list what it was. */
    private String summarise(JsonNode node) {
        List<String> parts = new ArrayList<>();
        node.fieldNames().forEachRemaining(field -> {
            String value = text(node.get(field));
            if (!value.isBlank() && !"null".equals(value)) parts.add("%s: %s".formatted(field, value));
        });
        return String.join(", ", parts);
    }

    private String text(JsonNode node) {
        return node == null || node.isNull() ? "null" : node.asText();
    }

    private JsonNode parse(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            JsonNode node = json.readTree(raw);
            return node.isNull() ? null : node;
        } catch (Exception unreadable) {
            return null;
        }
    }
}
