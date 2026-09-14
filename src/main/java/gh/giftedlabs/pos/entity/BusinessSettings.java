package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * The one row of business settings — FR-SET-01, FR-SET-03, FR-SET-06.
 *
 * <p>Everything here was a constant somewhere in the code until this feature.
 * That is the point of the class: a variance threshold that needs a release to
 * change is not a setting, it is a decision the shop is stuck with.
 *
 * <p>There is exactly one row and its id is always 1, enforced by a CHECK in
 * the schema rather than by convention here.
 */
@Entity
@Table(name = "business_settings")
public class BusinessSettings {

    /** The smallest coin the drawer actually holds. */
    public enum CashRounding { EXACT, TEN_PESEWAS, FIFTY_PESEWAS }

    public static final short SINGLETON_ID = 1;

    @Id
    @Column(name = "id", nullable = false)
    private short id = SINGLETON_ID;

    @Column(name = "company_name")
    private String companyName;

    @Column(name = "trading_name")
    private String tradingName;

    @Column(name = "tax_registration_number")
    private String taxRegistrationNumber;

    @Column(name = "phone")
    private String phone;

    @Column(name = "email")
    private String email;

    @Column(name = "address")
    private String address;

    @Column(name = "logo_url")
    private String logoUrl;

    @Column(name = "tax_enabled", nullable = false)
    private boolean taxEnabled;

    @Column(name = "tax_rate_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal taxRatePercent = BigDecimal.ZERO;

    @Column(name = "currency_code", nullable = false)
    private String currencyCode = "GHS";

    @Column(name = "currency_symbol", nullable = false)
    private String currencySymbol = "GH₵";

    @Enumerated(EnumType.STRING)
    @Column(name = "cash_rounding", nullable = false)
    private CashRounding cashRounding = CashRounding.EXACT;

    @Column(name = "receipt_header_message")
    private String receiptHeaderMessage;

    @Column(name = "receipt_footer_policy")
    private String receiptFooterPolicy;

    @Column(name = "receipt_printer_width", nullable = false)
    private String receiptPrinterWidth = "80mm";

    @Column(name = "auto_print_receipt", nullable = false)
    private boolean autoPrintReceipt = true;

    @Column(name = "show_cashier_on_receipt", nullable = false)
    private boolean showCashierOnReceipt = true;

    @Column(name = "accent_color", nullable = false)
    private String accentColor = "#F97316";

    @Column(name = "idle_lock_minutes", nullable = false)
    private int idleLockMinutes = 10;

    /** BR-11 · FR-INV-06: pesewas. */
    @Column(name = "adjustment_approval_pesewas", nullable = false)
    private long adjustmentApprovalPesewas = 50_000L;

    /** BR-11 · FR-CASH-06: pesewas. */
    @Column(name = "cash_variance_pesewas", nullable = false)
    private long cashVariancePesewas = 2_000L;

    @Column(name = "enforce_floor_price_approval", nullable = false)
    private boolean enforceFloorPriceApproval = true;

    @Column(name = "enforce_void_approval", nullable = false)
    private boolean enforceVoidApproval = true;

    @Column(name = "enforce_blind_shift_count", nullable = false)
    private boolean enforceBlindShiftCount = true;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by")
    private UUID updatedBy;

    protected BusinessSettings() { }

    public short getId() { return id; }
    public String getCompanyName() { return companyName; }
    public String getTradingName() { return tradingName; }
    public String getTaxRegistrationNumber() { return taxRegistrationNumber; }
    public String getPhone() { return phone; }
    public String getEmail() { return email; }
    public String getAddress() { return address; }
    public String getLogoUrl() { return logoUrl; }
    public boolean isTaxEnabled() { return taxEnabled; }
    public BigDecimal getTaxRatePercent() { return taxRatePercent; }
    public String getCurrencyCode() { return currencyCode; }
    public String getCurrencySymbol() { return currencySymbol; }
    public CashRounding getCashRounding() { return cashRounding; }
    public String getReceiptHeaderMessage() { return receiptHeaderMessage; }
    public String getReceiptFooterPolicy() { return receiptFooterPolicy; }
    public String getReceiptPrinterWidth() { return receiptPrinterWidth; }
    public boolean isAutoPrintReceipt() { return autoPrintReceipt; }
    public boolean isShowCashierOnReceipt() { return showCashierOnReceipt; }
    public String getAccentColor() { return accentColor; }
    public int getIdleLockMinutes() { return idleLockMinutes; }
    public long getAdjustmentApprovalPesewas() { return adjustmentApprovalPesewas; }
    public long getCashVariancePesewas() { return cashVariancePesewas; }
    public boolean isEnforceFloorPriceApproval() { return enforceFloorPriceApproval; }
    public boolean isEnforceVoidApproval() { return enforceVoidApproval; }
    public boolean isEnforceBlindShiftCount() { return enforceBlindShiftCount; }
    public Instant getUpdatedAt() { return updatedAt; }
    public UUID getUpdatedBy() { return updatedBy; }

    public void setCompanyName(String value) { this.companyName = value; }
    public void setTradingName(String value) { this.tradingName = value; }
    public void setTaxRegistrationNumber(String value) { this.taxRegistrationNumber = value; }
    public void setPhone(String value) { this.phone = value; }
    public void setEmail(String value) { this.email = value; }
    public void setAddress(String value) { this.address = value; }
    public void setLogoUrl(String value) { this.logoUrl = value; }
    public void setTaxEnabled(boolean value) { this.taxEnabled = value; }
    public void setTaxRatePercent(BigDecimal value) { this.taxRatePercent = value; }
    public void setCurrencyCode(String value) { this.currencyCode = value; }
    public void setCurrencySymbol(String value) { this.currencySymbol = value; }
    public void setCashRounding(CashRounding value) { this.cashRounding = value; }
    public void setReceiptHeaderMessage(String value) { this.receiptHeaderMessage = value; }
    public void setReceiptFooterPolicy(String value) { this.receiptFooterPolicy = value; }
    public void setReceiptPrinterWidth(String value) { this.receiptPrinterWidth = value; }
    public void setAutoPrintReceipt(boolean value) { this.autoPrintReceipt = value; }
    public void setShowCashierOnReceipt(boolean value) { this.showCashierOnReceipt = value; }
    public void setAccentColor(String value) { this.accentColor = value; }
    public void setIdleLockMinutes(int value) { this.idleLockMinutes = value; }
    public void setAdjustmentApprovalPesewas(long value) { this.adjustmentApprovalPesewas = value; }
    public void setCashVariancePesewas(long value) { this.cashVariancePesewas = value; }
    public void setEnforceFloorPriceApproval(boolean value) { this.enforceFloorPriceApproval = value; }
    public void setEnforceVoidApproval(boolean value) { this.enforceVoidApproval = value; }
    public void setEnforceBlindShiftCount(boolean value) { this.enforceBlindShiftCount = value; }

    public void touch(UUID actorId, Instant at) {
        this.updatedBy = actorId;
        this.updatedAt = at;
    }
}
