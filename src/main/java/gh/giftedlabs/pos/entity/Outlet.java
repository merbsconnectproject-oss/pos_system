package gh.giftedlabs.pos.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A shop — FR-OUT, AS-2.
 *
 * <p>Under the local-first topology each installation holds exactly one outlet,
 * but {@code outlet_id} stays on every scoped table. That is what lets two
 * shops merge into one cloud database later without touching a query, and what
 * NFR-16 means by "a third outlet requires configuration only".
 */
@Entity
@Table(name = "outlet")
public class Outlet {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /**
     * BR-6: the {@code {OUTLET}} segment of a receipt number — {@code INC} in
     * {@code INC-01-004312}. No hyphen: one here makes the number four parts
     * with the terminal repeated. Enforced by {@code outlet_code_is_receipt_safe}.
     */
    @NotBlank
    @Pattern(regexp = "[A-Z0-9]{2,6}", message = "Use 2-6 letters or digits, no hyphen")
    @Column(name = "code", nullable = false, unique = true)
    private String code;

    @NotBlank
    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "trading_name")
    private String tradingName;

    @Column(name = "address")
    private String address;

    @Column(name = "phone")
    private String phone;

    /** FR-OUT-02: shown in the header and grouped on reports. */
    @Column(name = "town")
    private String town;

    /** FR-OUT-02: display only. Naming a manager here grants nothing. */
    @Column(name = "manager_name")
    private String managerName;

    @Column(name = "receipt_footer")
    private String receiptFooter;

    @Column(name = "logo_url")
    private String logoUrl;

    /** BR-17: deactivation, never deletion — historical documents reference this row. */
    /**
     * FR-SET-02: what a product's reorder level starts at in this branch.
     *
     * <p>Per branch rather than per business: a showroom that turns over a
     * pallet a week and a store that sells two a month cannot share a number.
     */
    @Column(name = "default_reorder_level", nullable = false)
    private BigDecimal defaultReorderLevel = BigDecimal.ZERO;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "synced_at")
    private Instant syncedAt;

    protected Outlet() {
        // JPA
    }

    public Outlet(String code, String name) {
        this.code = code;
        this.name = name;
    }

    public UUID getId() {
        return id;
    }

    /**
     * Renaming the receipt code changes what future receipts print. Past
     * receipts keep the number they were issued — BR-6 numbers are never
     * reused, so they are not rewritten either.
     */
    public void setCode(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getTradingName() {
        return tradingName;
    }

    public void setTradingName(String tradingName) {
        this.tradingName = tradingName;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getReceiptFooter() {
        return receiptFooter;
    }

    public void setReceiptFooter(String receiptFooter) {
        this.receiptFooter = receiptFooter;
    }

    public String getLogoUrl() {
        return logoUrl;
    }

    public void setLogoUrl(String logoUrl) {
        this.logoUrl = logoUrl;
    }

    public String getTown() {
        return town;
    }

    public void setTown(String town) {
        this.town = town;
    }

    public String getManagerName() {
        return managerName;
    }

    public void setManagerName(String managerName) {
        this.managerName = managerName;
    }

    public BigDecimal getDefaultReorderLevel() {
        return defaultReorderLevel;
    }

    public void setDefaultReorderLevel(BigDecimal defaultReorderLevel) {
        this.defaultReorderLevel = defaultReorderLevel == null ? BigDecimal.ZERO : defaultReorderLevel;
    }

    public boolean isActive() {
        return active;
    }

    public void deactivate() {
        this.active = false;
    }

    public void activate() {
        this.active = true;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getSyncedAt() {
        return syncedAt;
    }

    public void markSynced(Instant at) {
        this.syncedAt = at;
    }
}
