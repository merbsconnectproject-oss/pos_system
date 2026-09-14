package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.CatalogueListItem;
import gh.giftedlabs.pos.exception.CatalogueListException;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.CatalogueListService;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Catalogue setup — FR-PROD-05, FR-UOM-01.
 *
 * <p>Three lists with identical behaviour and different tables, so they share
 * one implementation parameterised by {@link Kind} rather than three
 * near-identical services. The only thing that genuinely differs is how a
 * product refers to the entry — a foreign key for categories and brands, a
 * plain string for base units — and that is one column name.
 *
 * <p>Renaming is the operation the tables exist for. Products point at a
 * category row, so correcting a name is one update rather than a sweep through
 * every product that carried the old string; a base unit is denormalised onto
 * the product, so renaming one has to carry the products with it, which is why
 * that case is spelled out below.
 */
@Service
public class CatalogueListServiceImpl implements CatalogueListService {

    /** What differs between the three lists, and nothing more. */
    public enum Kind {
        CATEGORY("category", "categories", "category_id", false),
        BRAND("brand", "brands", "brand_id", false),
        UNIT("unit_of_measure", "units", "base_unit", true);

        final String table;
        final String label;
        final String productColumn;
        /** True when the product stores the name itself rather than an id. */
        final boolean byName;

        Kind(String table, String label, String productColumn, boolean byName) {
            this.table = table;
            this.label = label;
            this.productColumn = productColumn;
            this.byName = byName;
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final AuditService audit;

    public CatalogueListServiceImpl(NamedParameterJdbcTemplate jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CatalogueListItem> list(Kind kind, boolean includeInactive) {
        String usage = kind.byName
                ? "(select count(*) from product p where upper(p.%s) = upper(l.name))".formatted(kind.productColumn)
                : "(select count(*) from product p where p.%s = l.id)".formatted(kind.productColumn);

        String sql = """
                select l.id, l.name, l.is_active, %s as in_use
                  from %s l
                 where (:includeInactive = true or l.is_active = true)
                 order by l.name asc
                """.formatted(usage, kind.table);

        return jdbc.query(sql, new MapSqlParameterSource("includeInactive", includeInactive),
                (row, index) -> new CatalogueListItem(
                        UUID.fromString(row.getString("id")),
                        row.getString("name"),
                        row.getBoolean("is_active"),
                        row.getLong("in_use")));
    }

    @Override
    @Transactional
    public CatalogueListItem add(Kind kind, String name, PosPrincipal actor, String clientIp) {
        String clean = name.trim();
        refuseDuplicate(kind, clean, null);

        UUID id = jdbc.queryForObject(
                "insert into %s (name) values (:name) returning id".formatted(kind.table),
                new MapSqlParameterSource("name", clean), UUID.class);

        audit.record(actor.userId(), "CATALOGUE_LIST_ADDED", kind.table, id,
                null, Map.of("name", clean), actor.outletId(), null, clientIp);
        return new CatalogueListItem(id, clean, true, 0);
    }

    @Override
    @Transactional
    public CatalogueListItem rename(Kind kind, UUID id, String name, PosPrincipal actor, String clientIp) {
        String clean = name.trim();
        String previous = nameOf(kind, id);
        refuseDuplicate(kind, clean, id);

        jdbc.update("update %s set name = :name where id = :id".formatted(kind.table),
                new MapSqlParameterSource().addValue("name", clean).addValue("id", id));

        // A base unit is denormalised onto the product, so the rename has to
        // carry the products with it or their base_unit would name a row that
        // no longer exists under that name. Categories and brands are joined by
        // id and need nothing.
        if (kind.byName) {
            jdbc.update("update product set base_unit = :name where upper(base_unit) = upper(:previous)",
                    new MapSqlParameterSource().addValue("name", clean).addValue("previous", previous));
        }

        audit.record(actor.userId(), "CATALOGUE_LIST_RENAMED", kind.table, id,
                Map.of("name", previous), Map.of("name", clean), actor.outletId(), null, clientIp);
        return new CatalogueListItem(id, clean, true, usageOf(kind, id, clean));
    }

    /**
     * BR-17: retired, not deleted — a product that used it keeps its history.
     *
     * <p>Retiring an entry products still use is refused rather than cascaded.
     * The screen offers rename alongside it, which is almost always what was
     * actually meant.
     */
    @Override
    @Transactional
    public CatalogueListItem setActive(Kind kind, UUID id, boolean active, PosPrincipal actor, String clientIp) {
        String name = nameOf(kind, id);
        long inUse = usageOf(kind, id, name);

        if (!active && inUse > 0) {
            throw CatalogueListException.stillInUse(kind.label, name, inUse);
        }

        jdbc.update("update %s set is_active = :active where id = :id".formatted(kind.table),
                new MapSqlParameterSource().addValue("active", active).addValue("id", id));

        audit.record(actor.userId(), active ? "CATALOGUE_LIST_RESTORED" : "CATALOGUE_LIST_RETIRED",
                kind.table, id, null, Map.of("name", name), actor.outletId(), null, clientIp);
        return new CatalogueListItem(id, name, active, inUse);
    }

    private void refuseDuplicate(Kind kind, String name, UUID selfId) {
        Boolean exists = jdbc.queryForObject("""
                select exists (select 1 from %s where upper(name) = upper(:name)
                                and (cast(:selfId as uuid) is null or id <> cast(:selfId as uuid)))
                """.formatted(kind.table),
                new MapSqlParameterSource()
                        .addValue("name", name)
                        .addValue("selfId", selfId == null ? null : selfId.toString()),
                Boolean.class);

        if (Boolean.TRUE.equals(exists)) throw CatalogueListException.duplicate(kind.label, name);
    }

    private String nameOf(Kind kind, UUID id) {
        List<String> found = jdbc.queryForList(
                "select name from %s where id = :id".formatted(kind.table),
                new MapSqlParameterSource("id", id), String.class);
        if (found.isEmpty()) throw new IllegalArgumentException("No such entry");
        return found.getFirst();
    }

    private long usageOf(Kind kind, UUID id, String name) {
        String sql = kind.byName
                ? "select count(*) from product where upper(base_unit) = upper(:name)"
                : "select count(*) from product where %s = :id".formatted(kind.productColumn);
        Long count = jdbc.queryForObject(sql,
                new MapSqlParameterSource().addValue("name", name).addValue("id", id), Long.class);
        return count == null ? 0 : count;
    }
}
