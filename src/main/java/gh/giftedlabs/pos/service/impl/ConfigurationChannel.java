package gh.giftedlabs.pos.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.dto.OutletConfig;
import gh.giftedlabs.pos.dto.SyncView;
import gh.giftedlabs.pos.entity.*;
import gh.giftedlabs.pos.exception.OutletNotFoundException;
import gh.giftedlabs.pos.repository.*;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Channel 1 — configuration, owner → shop.
 *
 * <p>The owner is the authority and a shop never writes any of this back. That is
 * the whole design: with one writer there is no conflict to resolve, and setting
 * a second shop up is a button rather than an afternoon of retyping.
 *
 * <p>A pull is re-runnable. Once-only would leave the owner editing the tax rate
 * in three places and the copies drifting apart in silence.
 */
@Component
public class ConfigurationChannel {

    private static final Logger log = LoggerFactory.getLogger(ConfigurationChannel.class);

    private final OffsiteStore store;
    private final PosProperties properties;
    private final ObjectMapper json;
    private final NamedParameterJdbcTemplate jdbc;
    private final OutletRepository outlets;
    private final UserRepository users;
    private final ProductRepository products;
    private final ProductOutletRepository assignments;
    private final ProductOutletPriceRepository outletPrices;
    private final BusinessSettingsRepository settings;
    private final AuditService audit;
    private final Clock clock;

    private volatile Instant lastPulledAt;

    public ConfigurationChannel(OffsiteStore store, PosProperties properties, ObjectMapper json,
                                NamedParameterJdbcTemplate jdbc, OutletRepository outlets,
                                UserRepository users, ProductRepository products,
                                ProductOutletRepository assignments,
                                ProductOutletPriceRepository outletPrices,
                                BusinessSettingsRepository settings, AuditService audit, Clock clock) {
        this.store = store;
        this.properties = properties;
        this.json = json;
        this.jdbc = jdbc;
        this.outlets = outlets;
        this.users = users;
        this.products = products;
        this.assignments = assignments;
        this.outletPrices = outletPrices;
        this.settings = settings;
        this.audit = audit;
        this.clock = clock;
    }

    Instant lastPulledAt() {
        return lastPulledAt;
    }

    // --- publish ------------------------------------------------------------

    @Transactional(readOnly = true)
    public SyncView.Configuration publish(UUID outletId, PosPrincipal actor, String clientIp) {
        PosProperties.Offsite offsite = properties.backup().offsite();
        requireBucket(offsite);

        Outlet outlet = outlets.findById(outletId)
                .orElseThrow(() -> new OutletNotFoundException(outletId));
        BusinessSettings profile = settings.findById(BusinessSettings.SINGLETON_ID).orElse(null);

        List<OutletConfig.Staff> staff = users.findAll().stream()
                .filter(user -> user.getOutletIds().contains(outletId))
                .map(this::toStaff)
                .toList();

        Map<UUID, ProductOutletPrice> overrides = outletPrices.findByOutletId(outletId).stream()
                .collect(Collectors.toMap(ProductOutletPrice::getProductId, price -> price));

        List<UUID> carried = assignments.productIdsAt(outletId);
        List<OutletConfig.CatalogueItem> catalogue = products.findAllById(carried).stream()
                .map(product -> toItem(product, overrides.get(product.getId())))
                .toList();

        OutletConfig config = new OutletConfig(
                OutletConfig.VERSION, clock.instant().toString(),
                toOutlet(outlet), toBusiness(profile), toThresholds(profile),
                staff, catalogue);

        String key = "config/%s.json".formatted(outlet.getCode());
        store.putBytes(write(config), key, "application/json", offsite);

        audit.record(actor.userId(), "CONFIG_PUBLISHED", "outlet", outletId, null,
                Map.of("key", key, "users", staff.size(), "products", catalogue.size()),
                outletId, null, clientIp);

        return new SyncView.Configuration(outlet.getCode(), Instant.parse(config.publishedAt()),
                staff.size(), catalogue.size(),
                "Published %d staff and %d products for %s."
                        .formatted(staff.size(), catalogue.size(), outlet.getName()));
    }

    // --- pull ---------------------------------------------------------------

    @Transactional
    public SyncView.Configuration pull(PosPrincipal actor, String clientIp) {
        PosProperties.Offsite offsite = properties.backup().offsite();
        requireBucket(offsite);

        String code = outletCode(actor);
        String key = "config/%s.json".formatted(code);

        byte[] body = store.get(key, offsite).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "No configuration has been published for %s yet.".formatted(code)));

        OutletConfig config = read(body);
        Outlet outlet = applyOutlet(config.outlet());
        applyBusiness(config.business(), config.thresholds());
        int staff = applyStaff(config.users(), outlet.getId());
        int catalogue = applyCatalogue(config.products(), outlet.getId());

        lastPulledAt = clock.instant();
        // In this transaction, not its own. The pull rewrites every user at the
        // shop — including whoever is performing it — so an entry naming that
        // actor cannot be written from a separate connection: the foreign key
        // check blocks on the uncommitted row, waiting for a transaction that is
        // waiting for it, and nothing times out. The first "Get configuration"
        // at every new shop hung until somebody restarted the server.
        audit.recordInCallerTransaction(actor.userId(), "CONFIG_PULLED", "outlet", outlet.getId(),
                null,
                Map.of("key", key, "publishedAt", String.valueOf(config.publishedAt()),
                        "users", staff, "products", catalogue),
                outlet.getId(), null, clientIp);

        return new SyncView.Configuration(code, Instant.parse(config.publishedAt()), staff, catalogue,
                "Applied %d staff and %d products published %s."
                        .formatted(staff, catalogue, config.publishedAt()));
    }

    // --- applying -----------------------------------------------------------

    /**
     * The outlet record itself.
     *
     * <p>Written through SQL rather than the entity, like the catalogue below.
     * These rows belong to the owner, and giving {@code Outlet} and {@code User}
     * setters for the benefit of one caller would make them look editable
     * everywhere else — which is the opposite of what the read-only rule says.
     */
    private Outlet applyOutlet(OutletConfig.Outlet wire) {
        adoptHeadOfficeId(wire);

        jdbc.getJdbcTemplate().update("""
                insert into outlet (id, code, name, trading_name, address, town, phone,
                                    receipt_footer, logo_url, is_active)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, true)
                on conflict (id) do update set
                    code = excluded.code, name = excluded.name,
                    trading_name = excluded.trading_name, address = excluded.address,
                    town = excluded.town, phone = excluded.phone,
                    receipt_footer = excluded.receipt_footer, logo_url = excluded.logo_url
                """, wire.id(), wire.code(), wire.name(), wire.tradingName(), wire.address(),
                wire.town(), wire.phone(), wire.receiptFooter(), wire.logoUrl());

        return outlets.findById(wire.id()).orElseThrow(
                () -> new IllegalStateException("outlet vanished immediately after being written"));
    }

    /**
     * Takes on Cloud Sync's id for this outlet, when a first run invented one.
     *
     * <p>A fresh counter bootstraps itself an outlet so somebody can sign in at
     * all — and gives it a random id, because it has never received cloud configuration.
     * The owner's copy of the same shop has a different id and the same code, and
     * {@code outlet.code} is unique: inserting Cloud Sync's row violates the
     * <em>code</em> index, which an {@code on conflict (id)} clause does not
     * catch. Every first "Get configuration" failed with a 500.
     *
     * <p>Both ids have to agree, and Cloud Sync's must win. It is the id every
     * product, price and pushed sale is keyed to; if a shop kept its own, its
     * trading would arrive at the owner's view attached to an outlet that exists
     * nowhere else, and the combined reports would quietly sum to nothing.
     *
     * <p>Only ever done while the shop has no trading of its own. Swapping the id
     * under a shop that has been selling would orphan its sales, so that is
     * refused rather than attempted.
     */
    private void adoptHeadOfficeId(OutletConfig.Outlet wire) {
        List<UUID> sameCode = jdbc.getJdbcTemplate().queryForList(
                "select id from outlet where upper(code) = upper(?) and id <> ?",
                UUID.class, wire.code(), wire.id());
        if (sameCode.isEmpty()) return;

        for (UUID local : sameCode) {
            long trading = countTrading(local);
            if (trading > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, ("""
                        This counter already has %d recorded transaction(s) against outlet %s,                         under a different id from Cloud Sync. Applying the configuration would                         detach them. Sync this shop's trading first, or set it up on a clean                         database.""").formatted(trading, wire.code()));
            }

            // Nothing has traded yet, so the only things pointing at the invented
            // outlet are what the first run created: a till and the bootstrap
            // account's assignment. Move them over, then let it go.
            //
            // The code has to be freed before Cloud Sync's row can take it —
            // it is unique. Parked on a temporary one that still satisfies BR-6's
            // receipt-safe shape (2-6 upper alphanumerics), because the check
            // constraint is not suspended for housekeeping.
            String parked = "Z" + wire.id().toString().replaceAll("[^0-9a-f]", "")
                    .substring(0, 5).toUpperCase(Locale.ROOT);
            jdbc.getJdbcTemplate().update("update outlet set code = ? where id = ?", parked, local);

            jdbc.getJdbcTemplate().update(
                    "insert into outlet (id, code, name, is_active) values (?, ?, ?, true) "
                            + "on conflict (id) do nothing",
                    wire.id(), wire.code(), wire.name());

            jdbc.getJdbcTemplate().update("update terminal set outlet_id = ? where outlet_id = ?",
                    wire.id(), local);
            jdbc.getJdbcTemplate().update(
                    "update user_outlet set outlet_id = ? where outlet_id = ? "
                            + "and not exists (select 1 from user_outlet u2 "
                            + "where u2.user_id = user_outlet.user_id and u2.outlet_id = ?)",
                    wire.id(), local, wire.id());
            jdbc.getJdbcTemplate().update("delete from user_outlet where outlet_id = ?", local);
            jdbc.getJdbcTemplate().update("delete from outlet where id = ?", local);

            log.info("Adopted Cloud Sync id for outlet {} (was {})", wire.code(), local);
        }
    }

    /** Has this outlet traded? Anything here makes its id load-bearing. */
    private long countTrading(UUID outletId) {
        Long count = jdbc.getJdbcTemplate().queryForObject("""
                select (select count(*) from sale where outlet_id = ?)
                     + (select count(*) from inventory_movement where outlet_id = ?)
                     + (select count(*) from shift where outlet_id = ?)
                """, Long.class, outletId, outletId, outletId);
        return count == null ? 0 : count;
    }

    private void applyBusiness(OutletConfig.Business wire, OutletConfig.Thresholds thresholds) {
        // V11 seeds the singleton row, so its absence is a broken install
        // rather than a first run — and silently creating a second one would
        // defeat the CHECK that makes "one business, one row" true.
        BusinessSettings row = settings.findById(BusinessSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException(
                        "business_settings is missing its singleton row"));
        row.setCompanyName(wire.companyName());
        row.setTaxRegistrationNumber(wire.taxRegistrationNumber());
        row.setTaxEnabled(wire.taxEnabled());
        row.setTaxRatePercent(wire.taxRatePercent());
        row.setCurrencyCode(wire.currencyCode());
        row.setCurrencySymbol(wire.currencySymbol());
        row.setReceiptHeaderMessage(wire.receiptHeaderMessage());
        row.setReceiptFooterPolicy(wire.receiptFooterPolicy());
        row.setAccentColor(wire.accentColor());
        row.setCloudSyncIntervalMinutes(wire.cloudSyncIntervalMinutes() >= 15
                ? wire.cloudSyncIntervalMinutes() : 15);
        row.setIdleLockMinutes(thresholds.idleLockMinutes());
        row.setAdjustmentApprovalPesewas(thresholds.adjustmentApprovalPesewas());
        row.setCashVariancePesewas(thresholds.cashVariancePesewas());
        row.setEnforceFloorPriceApproval(thresholds.enforceFloorPriceApproval());
        row.setEnforceVoidApproval(thresholds.enforceVoidApproval());
        row.setEnforceBlindShiftCount(thresholds.enforceBlindShiftCount());
        settings.save(row);

        thresholds.discountCeilingByRole().forEach((role, percent) ->
                jdbc.getJdbcTemplate().update("""
                        insert into role_discount_ceiling (role, max_percent) values (?, ?)
                        on conflict (role) do update set max_percent = excluded.max_percent
                        """, role, percent));
    }

    /**
     * Staff, hashes and all.
     *
     * <p>The hashes travel because a shop has to authenticate its own people
     * while the line is down — there is little point in a till that trades
     * offline if nobody can sign in to it. Nothing is reversible from them, but
     * the bucket does hold credential material, which is why it must stay
     * private and its token scoped to one prefix.
     *
     * <p>Roles and overrides are <em>replaced</em>, not merged. A right the owner
     * has taken away has to disappear here, and merging would leave it in place
     * for ever.
     */
    private int applyStaff(List<OutletConfig.Staff> staff, UUID outletId) {
        for (OutletConfig.Staff wire : staff) {
            jdbc.getJdbcTemplate().update("""
                    insert into app_user (id, username, email, password_hash, pin_hash,
                                          full_name, phone, is_active, must_change_password)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    on conflict (id) do update set
                        username = excluded.username, email = excluded.email,
                        password_hash = excluded.password_hash, pin_hash = excluded.pin_hash,
                        full_name = excluded.full_name, phone = excluded.phone,
                        is_active = excluded.is_active,
                        must_change_password = excluded.must_change_password
                    """, wire.id(), wire.username(), wire.email(), wire.passwordHash(),
                    wire.pinHash(), wire.fullName(), wire.phone(), wire.active(),
                    wire.mustChangePassword());

            // A role has two spellings and they are not interchangeable. The wire
            // carries key() — "owner", lowercase, the form the frontend and the
            // contract vectors use. The column holds name() — "OWNER" — because
            // JPA maps the field with @Enumerated(STRING). Writing the wire form
            // straight in makes every later read throw "No enum constant".
            jdbc.getJdbcTemplate().update("delete from user_role where user_id = ?", wire.id());
            for (String role : wire.roles()) {
                Role resolved = Role.ofKey(role).orElse(null);
                if (resolved == null) {
                    log.warn("Configuration names a role this build does not have: {}", role);
                    continue;
                }
                jdbc.getJdbcTemplate().update(
                        "insert into user_role (user_id, role_key) values (?, ?) on conflict do nothing",
                        wire.id(), resolved.name());
            }

            jdbc.getJdbcTemplate().update("delete from user_permission where user_id = ?", wire.id());
            wire.permissionOverrides().forEach((code, granted) ->
                    jdbc.getJdbcTemplate().update("""
                            insert into user_permission (user_id, permission_code, granted)
                            values (?, ?, ?) on conflict do nothing
                            """, wire.id(), code, granted));

            jdbc.getJdbcTemplate().update("""
                    insert into user_outlet (user_id, outlet_id) values (?, ?)
                    on conflict do nothing
                    """, wire.id(), outletId);
        }
        return staff.size();
    }

    /**
     * The catalogue this shop carries.
     *
     * <p>Marked {@code CENTRAL} on the way in, which is what makes it read-only
     * at the till: a manager may add a line of their own and no pull will ever
     * touch it, but they cannot edit the owner's and have the next pull silently
     * undo the change.
     */
    private int applyCatalogue(List<OutletConfig.CatalogueItem> items, UUID outletId) {
        Instant now = clock.instant();
        for (OutletConfig.CatalogueItem wire : items) {
            jdbc.getJdbcTemplate().update("""
                    insert into product (id, sku, name, description, base_unit,
                                         retail_price, trade_price, floor_price, is_active, origin)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CENTRAL')
                    on conflict (id) do update set
                        sku = excluded.sku, name = excluded.name,
                        description = excluded.description, base_unit = excluded.base_unit,
                        retail_price = excluded.retail_price, trade_price = excluded.trade_price,
                        floor_price = excluded.floor_price, is_active = excluded.is_active,
                        origin = 'CENTRAL'
                    """, wire.id(), wire.sku(), wire.name(), wire.description(), wire.baseUnit(),
                    wire.retailPrice(), wire.tradePrice(), wire.floorPrice(), wire.active());

            if (!assignments.existsByProductIdAndOutletId(wire.id(), outletId)) {
                assignments.save(new ProductOutlet(wire.id(), outletId, now));
            }
        }
        return items.size();
    }

    // --- building -----------------------------------------------------------

    private OutletConfig.Outlet toOutlet(Outlet outlet) {
        return new OutletConfig.Outlet(outlet.getId(), outlet.getCode(), outlet.getName(),
                outlet.getTradingName(), outlet.getAddress(), outlet.getTown(), outlet.getPhone(),
                outlet.getReceiptFooter(), outlet.getLogoUrl());
    }

    private OutletConfig.Business toBusiness(BusinessSettings row) {
        if (row == null) {
            return new OutletConfig.Business("", "", false, BigDecimal.ZERO, "GHS", "GH₵",
                    "EXACT", null, null, "#C55200", 15);
        }
        return new OutletConfig.Business(row.getCompanyName(), row.getTaxRegistrationNumber(),
                row.isTaxEnabled(), row.getTaxRatePercent(), row.getCurrencyCode(),
                row.getCurrencySymbol(), row.getCashRounding().name(),
                row.getReceiptHeaderMessage(), row.getReceiptFooterPolicy(), row.getAccentColor(),
                row.getCloudSyncIntervalMinutes());
    }

    private OutletConfig.Thresholds toThresholds(BusinessSettings row) {
        Map<String, BigDecimal> ceilings = new LinkedHashMap<>();
        jdbc.getJdbcTemplate().query("select role, max_percent from role_discount_ceiling",
                rows -> { ceilings.put(rows.getString("role"), rows.getBigDecimal("max_percent")); });

        if (row == null) {
            return new OutletConfig.Thresholds(10, 50000, 5000, ceilings, false, false, false);
        }
        return new OutletConfig.Thresholds(row.getIdleLockMinutes(),
                row.getAdjustmentApprovalPesewas(), row.getCashVariancePesewas(), ceilings,
                row.isEnforceFloorPriceApproval(), row.isEnforceVoidApproval(),
                row.isEnforceBlindShiftCount());
    }

    private OutletConfig.Staff toStaff(User user) {
        return new OutletConfig.Staff(user.getId(), user.getUsername(), user.getFullName(),
                user.getEmail(), user.getPhone(), user.getPasswordHash(), user.getPinHash(),
                user.isActive(), user.mustChangePassword(),
                user.getRoles().stream().map(Role::key).toList(),
                user.getPermissionOverrides().entrySet().stream()
                        .collect(Collectors.toMap(entry -> entry.getKey().code(), Map.Entry::getValue)));
    }

    private OutletConfig.CatalogueItem toItem(Product product, ProductOutletPrice override) {
        return new OutletConfig.CatalogueItem(
                product.getId(), product.getSku(), product.getName(), product.getDescription(),
                product.getBrand() == null ? null : product.getBrand().getName(),
                product.getCategory() == null ? null : product.getCategory().getName(),
                product.getBaseUnit(), product.getRetailPrice(), product.getTradePrice(),
                product.getFloorPrice(),
                override == null ? null : override.getRetailPrice(),
                product.getBarcodes().stream().map(ProductBarcode::getCode).toList(),
                product.getSellingUnits().stream()
                        .map(unit -> new OutletConfig.CatalogueItem.UnitOption(
                                unit.getName(), unit.getConversionFactor()))
                        .toList(),
                product.isActive());
    }

    // --- plumbing -----------------------------------------------------------

    private void requireBucket(PosProperties.Offsite offsite) {
        if (!offsite.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "No bucket is configured. Set the off-site keys before syncing.");
        }
    }

    /**
     * Which shop this pull is for.
     *
     * <p>The configured code wins, because a counter knows which shop it is. With
     * one outlet in the database — the ordinary state at a shop — it is inferred.
     *
     * <p>Otherwise the signed-in person's outlet, which is the honest answer to an
     * ambiguous question: somebody standing at a branch pressing "Get
     * configuration" means that branch. Refusing outright would make the button
     * unusable on the owner's instance, where every outlet exists.
     */
    private String outletCode(PosPrincipal actor) {
        String configured = properties.deployment().outletCode();
        if (configured != null && !configured.isBlank()) return configured.toUpperCase(Locale.ROOT);

        List<String> codes = outlets.findAll().stream().map(Outlet::getCode).sorted().toList();
        if (codes.size() == 1) return codes.getFirst();

        if (actor != null && actor.outletId() != null) {
            Optional<Outlet> theirs = outlets.findById(actor.outletId());
            if (theirs.isPresent()) return theirs.get().getCode();
        }

        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This instance holds more than one outlet and you are not placed at one. "
                        + "Set pos.deployment.outlet-code to say which to pull.");
    }

    private byte[] write(OutletConfig config) {
        try {
            return json.writeValueAsBytes(config);
        } catch (Exception failed) {
            log.error("Configuration could not be serialised", failed);
            throw new IllegalStateException("Could not serialise the configuration: "
                    + failed.getMessage(), failed);
        }
    }

    private OutletConfig read(byte[] body) {
        try {
            return json.readValue(new String(body, StandardCharsets.UTF_8), OutletConfig.class);
        } catch (Exception failed) {
            log.error("Configuration payload could not be read", failed);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The published configuration could not be read. Publish it again.");
        }
    }
}
