package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.SettingsRequest;
import gh.giftedlabs.pos.dto.SettingsView;
import gh.giftedlabs.pos.entity.BusinessSettings;
import gh.giftedlabs.pos.entity.RoleDiscountCeiling;
import gh.giftedlabs.pos.repository.BusinessSettingsRepository;
import gh.giftedlabs.pos.repository.RoleDiscountCeilingRepository;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.SettingsService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.util.*;

/**
 * FR-SET · FR-SET-06.
 *
 * <p>The named accessors are read on hot paths — the idle check runs on every
 * request — so they are served from a snapshot refreshed at most twice a
 * minute rather than from a query each time. The staleness that buys is
 * bounded and harmless: a threshold raised at 10:00 takes effect by 10:00:30,
 * and nothing here is a security boundary that a few seconds could breach.
 */
@Service
public class SettingsServiceImpl implements SettingsService {

    private static final Duration SNAPSHOT_TTL = Duration.ofSeconds(30);

    private final BusinessSettingsRepository settings;
    private final RoleDiscountCeilingRepository ceilings;
    private final AuditService audit;
    private final Clock clock;

    private volatile Snapshot snapshot;

    public SettingsServiceImpl(BusinessSettingsRepository settings, RoleDiscountCeilingRepository ceilings,
                               AuditService audit, Clock clock) {
        this.settings = settings;
        this.ceilings = ceilings;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public SettingsView current() {
        return SettingsView.of(row(), ceilingMap());
    }

    /** FR-SET-01 · FR-USER-08: changed by one person, at one time, on the record. */
    @Override
    @Transactional
    public SettingsView update(SettingsRequest request, PosPrincipal actor, String clientIp) {
        BusinessSettings row = row();
        Map<String, Object> before = fields(row, ceilingMap());

        row.setCompanyName(request.companyName().trim());
        row.setTradingName(blankToNull(request.tradingName()));
        row.setTaxRegistrationNumber(blankToNull(request.taxRegistrationNumber()));
        row.setPhone(blankToNull(request.phone()));
        row.setEmail(blankToNull(request.email()));
        row.setAddress(blankToNull(request.address()));
        row.setLogoUrl(blankToNull(request.logoUrl()));

        row.setTaxEnabled(request.taxEnabled());
        row.setTaxRatePercent(request.taxRatePercent());
        row.setCurrencyCode(request.currencyCode().trim().toUpperCase(Locale.ROOT));
        row.setCurrencySymbol(request.currencySymbol().trim());
        row.setCashRounding(BusinessSettings.CashRounding.valueOf(request.cashRounding()));

        row.setReceiptHeaderMessage(blankToNull(request.receiptHeaderMessage()));
        row.setReceiptFooterPolicy(blankToNull(request.receiptFooterPolicy()));
        row.setReceiptPrinterWidth(request.receiptPrinterWidth());
        row.setAutoPrintReceipt(request.autoPrintReceipt());
        row.setShowCashierOnReceipt(request.showCashierOnReceipt());

        // FR-SET-03: stored upper-case so two spellings of one colour do not
        // read as a change in the audit log.
        row.setAccentColor(request.accentColor().toUpperCase(Locale.ROOT));

        SettingsRequest.Thresholds wanted = request.thresholds();
        row.setIdleLockMinutes(wanted.idleLockMinutes());
        row.setAdjustmentApprovalPesewas(wanted.adjustmentApprovalPesewas());
        row.setCashVariancePesewas(wanted.cashVariancePesewas());

        row.setEnforceFloorPriceApproval(request.enforceFloorPriceApproval());
        row.setEnforceVoidApproval(request.enforceVoidApproval());
        row.setEnforceBlindShiftCount(request.enforceBlindShiftCount());

        applyCeilings(wanted.discountCeilingByRole());

        row.touch(actor.userId(), clock.instant());
        settings.saveAndFlush(row);
        snapshot = null;

        Map<String, BigDecimal> after = ceilingMap();
        audit.record(actor.userId(), "SETTINGS_CHANGED", "settings", null,
                before, fields(row, after), actor.outletId(), null, clientIp);

        return SettingsView.of(row, after);
    }

    @Override
    public long cashVarianceThreshold() { return snapshot().cashVariance(); }

    @Override
    public long adjustmentApprovalThreshold() { return snapshot().adjustmentApproval(); }

    @Override
    public Duration idleTimeout() { return Duration.ofMinutes(snapshot().idleLockMinutes()); }

    @Override
    public BigDecimal discountCeiling(Set<Role> roles) {
        Map<String, BigDecimal> byRole = snapshot().ceilings();
        return roles.stream()
                .map(role -> byRole.getOrDefault(role.key(), BigDecimal.ZERO))
                .max(Comparator.naturalOrder())
                // No role is no ceiling to spend: someone with no role has not
                // been trusted with a discount, they have simply not been set up.
                .orElse(BigDecimal.ZERO);
    }

    // --- internals ---------------------------------------------------------

    private BusinessSettings row() {
        return settings.findById(BusinessSettings.SINGLETON_ID)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Business settings are missing"));
    }

    private Map<String, BigDecimal> ceilingMap() {
        Map<String, BigDecimal> byRole = new LinkedHashMap<>();
        for (Role role : Role.values()) byRole.put(role.key(), BigDecimal.ZERO);
        for (RoleDiscountCeiling ceiling : ceilings.findAll()) {
            byRole.put(ceiling.getRole(), ceiling.getMaxPercent());
        }
        return byRole;
    }

    /**
     * Only roles that exist are stored. A ceiling for a role nobody holds is a
     * row that will be read one day as though somebody configured it.
     */
    private void applyCeilings(Map<String, BigDecimal> wanted) {
        if (wanted == null || wanted.isEmpty()) return;

        Map<String, RoleDiscountCeiling> existing = new LinkedHashMap<>();
        ceilings.findAll().forEach(row -> existing.put(row.getRole(), row));

        for (Map.Entry<String, BigDecimal> entry : wanted.entrySet()) {
            String key = entry.getKey() == null ? "" : entry.getKey().trim().toLowerCase(Locale.ROOT);
            BigDecimal percent = entry.getValue();
            if (Arrays.stream(Role.values()).noneMatch(role -> role.key().equals(key))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown role: " + entry.getKey());
            }
            if (percent == null || percent.signum() < 0 || percent.compareTo(new BigDecimal("100")) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "A discount ceiling is a percentage between 0 and 100");
            }
            RoleDiscountCeiling row = existing.get(key);
            if (row == null) ceilings.save(new RoleDiscountCeiling(key, percent));
            else row.setMaxPercent(percent);
        }
        ceilings.flush();
    }

    private Snapshot snapshot() {
        Snapshot held = snapshot;
        if (held != null && held.takenAt().plus(SNAPSHOT_TTL).isAfter(clock.instant())) return held;

        Snapshot fresh = load();
        snapshot = fresh;
        return fresh;
    }

    protected Snapshot load() {
        BusinessSettings row = row();
        return new Snapshot(row.getCashVariancePesewas(), row.getAdjustmentApprovalPesewas(),
                row.getIdleLockMinutes(), ceilingMap(), clock.instant());
    }

    private Map<String, Object> fields(BusinessSettings row, Map<String, BigDecimal> byRole) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("companyName", row.getCompanyName());
        state.put("tradingName", row.getTradingName());
        state.put("taxRegistrationNumber", row.getTaxRegistrationNumber());
        state.put("taxEnabled", row.isTaxEnabled());
        state.put("taxRatePercent", row.getTaxRatePercent());
        state.put("currency", row.getCurrencyCode() + " " + row.getCurrencySymbol());
        state.put("cashRounding", row.getCashRounding().name());
        state.put("receiptPrinterWidth", row.getReceiptPrinterWidth());
        state.put("autoPrintReceipt", row.isAutoPrintReceipt());
        state.put("showCashierOnReceipt", row.isShowCashierOnReceipt());
        state.put("accentColor", row.getAccentColor());
        state.put("idleLockMinutes", row.getIdleLockMinutes());
        state.put("adjustmentApprovalPesewas", row.getAdjustmentApprovalPesewas());
        state.put("cashVariancePesewas", row.getCashVariancePesewas());
        state.put("enforceFloorPriceApproval", row.isEnforceFloorPriceApproval());
        state.put("enforceVoidApproval", row.isEnforceVoidApproval());
        state.put("enforceBlindShiftCount", row.isEnforceBlindShiftCount());
        // Each ceiling under its own key, so the audit says which role changed
        // rather than that "the ceilings" did.
        byRole.forEach((role, percent) -> state.put("discountCeiling." + role, percent));
        return state;
    }

    private String blankToNull(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }

    /** What the rules read, held for {@link #SNAPSHOT_TTL}. */
    protected record Snapshot(long cashVariance, long adjustmentApproval, int idleLockMinutes,
                              Map<String, BigDecimal> ceilings, java.time.Instant takenAt) {
    }
}
