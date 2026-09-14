package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.UUID;

/** A party goods are bought from — FR-SUP-01. */
@Entity
@Table(name = "supplier")
public class Supplier {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @NotBlank
    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "contact_person") private String contactPerson;
    @Column(name = "phone") private String phone;
    @Column(name = "email") private String email;
    @Column(name = "address") private String address;
    @Column(name = "payment_terms") private String paymentTerms;
    @Column(name = "notes") private String notes;
    @Column(name = "category_supplied") private String categorySupplied;

    /** Null means every branch — most suppliers serve the whole business. */
    @Column(name = "outlet_id") private UUID outletId;

    /** BR-17: receipts reference this row, so it is retired rather than removed. */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Supplier() { }

    public Supplier(String name) { this.name = name; }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getContactPerson() { return contactPerson; }
    public void setContactPerson(String contactPerson) { this.contactPerson = contactPerson; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getPaymentTerms() { return paymentTerms; }
    public void setPaymentTerms(String paymentTerms) { this.paymentTerms = paymentTerms; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getCategorySupplied() { return categorySupplied; }
    public void setCategorySupplied(String categorySupplied) { this.categorySupplied = categorySupplied; }
    public UUID getOutletId() { return outletId; }
    public void setOutletId(UUID outletId) { this.outletId = outletId; }
    public boolean isActive() { return active; }
    public void activate() { this.active = true; }
    public void deactivate() { this.active = false; }
    public Instant getCreatedAt() { return createdAt; }
}
