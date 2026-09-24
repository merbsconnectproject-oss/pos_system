package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.rules.CustomerType;
import gh.giftedlabs.pos.rules.PhoneKey;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A customer — FR-CUST-02, FR-CUST-03, FR-CUST-05.
 *
 * <p>One record for the whole business, not one per branch. An electrician who
 * buys cable at one branch and conduit at the other is one customer, and two
 * records would quote them two different prices depending on the door they
 * came through.
 */
@Entity
@Table(name = "customer")
public class Customer {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @Column(name = "name", nullable = false)
    private String name;

    /** As the customer says it. */
    @Column(name = "phone", nullable = false)
    private String phone;

    /** FR-CUST-03: what they are found and made unique by. */
    @Column(name = "phone_key", nullable = false)
    private String phoneKey;

    @Column(name = "email")
    private String email;

    @Column(name = "address")
    private String address;

    @Column(name = "type", nullable = false)
    private String type = CustomerType.RETAIL.key();

    @Column(name = "discount_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountRate = BigDecimal.ZERO;

    /**
     * FR-CUST-07: the most this customer may owe across open plans.
     *
     * <p>Zero means <em>no limit set</em>, not no credit. The column defaults to
     * zero, so reading it as a refusal would have the upgrade that introduced
     * it deny credit to every customer a shop already serves. A limit does its
     * job from the moment somebody sets one.
     *
     * <p>The *balance* is not here and not stored anywhere. It is summed on
     * read from the customer's open plans; a stored copy would be a second
     * record of the same money, and the first payment posted outside the one
     * path that maintained it would have the shop refusing credit to somebody
     * who had already paid.
     */
    @Column(name = "credit_limit", nullable = false, precision = 12, scale = 2)
    private BigDecimal creditLimit = BigDecimal.ZERO;

    @Column(name = "notes")
    private String notes;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "created_by", updatable = false)
    private UUID createdBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected Customer() { }

    public Customer(String name, String phone, CustomerType type, UUID createdBy, Instant at) {
        this.name = name;
        setPhone(phone);
        this.type = type.key();
        this.discountRate = type.defaultDiscountRate();
        this.createdBy = createdBy;
        this.createdAt = at;
        this.updatedAt = at;
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getPhone() { return phone; }
    public String getPhoneKey() { return phoneKey; }
    public String getEmail() { return email; }
    public String getAddress() { return address; }
    public CustomerType getType() { return CustomerType.fromKey(type); }
    public BigDecimal getDiscountRate() { return discountRate; }
    public BigDecimal getCreditLimit() { return creditLimit; }
    public void setCreditLimit(BigDecimal value) {
        this.creditLimit = value == null ? BigDecimal.ZERO : value;
    }

    public String getNotes() { return notes; }
    public boolean isActive() { return active; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setName(String name) { this.name = name; }

    /** The key is derived here, so no caller can save a number it cannot be found by. */
    public void setPhone(String phone) {
        this.phone = phone;
        this.phoneKey = PhoneKey.of(phone);
    }

    public void setEmail(String email) { this.email = email; }
    public void setAddress(String address) { this.address = address; }
    public void setType(CustomerType type) { this.type = type.key(); }
    public void setDiscountRate(BigDecimal rate) { this.discountRate = rate; }
    public void setNotes(String notes) { this.notes = notes; }

    /** BR-17: deactivated, never deleted — they are on receipts already printed. */
    public void deactivate() { this.active = false; }
    public void activate() { this.active = true; }

    public void touch(Instant at) { this.updatedAt = at; }
}
