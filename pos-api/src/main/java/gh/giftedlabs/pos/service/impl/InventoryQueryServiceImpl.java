package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.MovementView;
import gh.giftedlabs.pos.service.InventoryQueryService;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The stock ledger, read — FR-INV-04, FR-INV-10.
 *
 * <p>JdbcTemplate because this is a report with a window function at the centre
 * of it, and because {@code InventoryMovement} is append-only: loading one into
 * a persistence context is where a stray flush would meet the trigger.
 */
@Service
public class InventoryQueryServiceImpl implements InventoryQueryService {

    /**
     * The running balance is computed, not stored.
     *
     * <p>{@code sum(...) over (partition by product, outlet order by created_at)}
     * is the level after each movement, so the row's own delta subtracted is the
     * level before it. The window runs over the whole history of that
     * product-and-outlet before the filters narrow what is shown, otherwise
     * filtering to one movement type would make every balance wrong.
     */
    private static final String SELECT = """
            with ledger as (
                select m.id, m.created_at, m.product_id, m.outlet_id, m.type,
                       m.quantity_delta, m.unit_cost, m.reason, m.note,
                       m.source_type, m.source_id, m.is_exception, m.actor_id,
                       sum(m.quantity_delta) over (
                           partition by m.product_id, m.outlet_id
                           order by m.created_at, m.id
                           rows between unbounded preceding and current row
                       ) as running_total
                  from inventory_movement m
                 where (cast(:productId as uuid) is null or m.product_id = cast(:productId as uuid))
                   and (cast(:outletId  as uuid) is null or m.outlet_id  = cast(:outletId  as uuid))
            )
            select l.*, p.name as product_name, u.full_name as actor_name, u.username as actor_username
              from ledger l
              join product p on p.id = l.product_id
              left join app_user u on u.id = l.actor_id
             where (cast(:type as text) is null or l.type::text = cast(:type as text))
               and (cast(:actorId as uuid) is null or l.actor_id = cast(:actorId as uuid))
               and (cast(:from as timestamptz) is null or l.created_at >= cast(:from as timestamptz))
               and (cast(:to   as timestamptz) is null or l.created_at <= cast(:to   as timestamptz))
               and (:exceptionsOnly = false or l.is_exception = true)
             order by l.created_at desc, l.id desc
             limit :limit offset :offset
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public InventoryQueryServiceImpl(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(readOnly = true)
    public List<MovementView> movements(UUID productId, UUID outletId, String type, UUID actorId,
                                        Instant from, Instant to, boolean exceptionsOnly,
                                        int limit, int offset) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("productId", productId == null ? null : productId.toString())
                .addValue("outletId", outletId == null ? null : outletId.toString())
                .addValue("type", type)
                .addValue("actorId", actorId == null ? null : actorId.toString())
                .addValue("from", from == null ? null : from.toString())
                .addValue("to", to == null ? null : to.toString())
                .addValue("exceptionsOnly", exceptionsOnly)
                .addValue("limit", limit)
                .addValue("offset", offset);

        return jdbc.query(SELECT, parameters, (row, index) -> {
            BigDecimal delta = row.getBigDecimal("quantity_delta");
            BigDecimal after = row.getBigDecimal("running_total");

            return new MovementView(
                    UUID.fromString(row.getString("id")),
                    row.getTimestamp("created_at").toInstant(),
                    UUID.fromString(row.getString("outlet_id")),
                    UUID.fromString(row.getString("product_id")),
                    row.getString("product_name"),
                    row.getString("type"),
                    // The screen shows a magnitude and reads direction from the
                    // type; the sign stays in the ledger where it belongs.
                    delta.abs(),
                    after.subtract(delta),
                    after,
                    row.getBigDecimal("unit_cost"),
                    row.getString("reason"),
                    row.getString("note"),
                    reference(row.getString("source_type"), row.getString("source_id")),
                    row.getBoolean("is_exception"),
                    actorName(row.getString("actor_name"), row.getString("actor_username")));
        });
    }

    private String reference(String sourceType, String sourceId) {
        if (sourceType == null || sourceId == null) return null;
        return "%s-%s".formatted(sourceType, sourceId.substring(0, 8).toUpperCase());
    }

    private String actorName(String fullName, String username) {
        return Optional.ofNullable(fullName)
                .filter(name -> !name.isBlank())
                .or(() -> Optional.ofNullable(username).filter(name -> !name.isBlank()))
                .orElse("System");
    }
}
