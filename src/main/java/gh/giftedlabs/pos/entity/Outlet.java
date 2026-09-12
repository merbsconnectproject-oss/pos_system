package gh.giftedlabs.pos.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

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

    @NotBlank
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

    @Column(name = "receipt_footer")
    private String receiptFooter;

    @Column(name = "logo_url")
    private String logoUrl;

    /** BR-6: the {OUTLET} segment of a receipt number, e.g. INC in INC-01-004312. */
    @NotBlank
    @Size(max = 8)
    @Column(name = "receipt_prefix", nullable = false)
    private String receiptPrefix;

    /** BR-17: deactivation, never deletion — historical documents reference this row. */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "synced_at")
    private Instant syncedAt;

    protected Outlet() {
        // JPA
    }

    public Outlet(String code, String name, String receiptPrefix) {
        this.code = code;
        this.name = name;
        this.receiptPrefix = receiptPrefix;
    }

    public UUID getId() {
        return id;
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

    public String getReceiptPrefix() {
        return receiptPrefix;
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
