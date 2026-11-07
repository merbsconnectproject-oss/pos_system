package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.UUID;

/**
 * A scannable code — FR-PROD-03, FR-PROD-04.
 *
 * <p>Unique system-wide, and bound to one unit: scanning the carton code adds a
 * carton, not one piece. A code that resolved to two products would make the
 * counter ambiguous at exactly the moment it must not be.
 */
@Entity
@Table(name = "product_barcode")
public class ProductBarcode {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @NotBlank
    @Column(name = "code", nullable = false, unique = true)
    private String code;

    /** A selling unit's name, or the product's base unit. */
    @NotBlank
    @Column(name = "unit_name", nullable = false)
    private String unitName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected ProductBarcode() { }

    public ProductBarcode(String code, String unitName) {
        this.code = code;
        this.unitName = unitName;
    }

    void attachTo(Product product) { this.product = product; }

    public UUID getId() { return id; }
    public Product getProduct() { return product; }
    public String getCode() { return code; }
    public String getUnitName() { return unitName; }
    public Instant getCreatedAt() { return createdAt; }
}
