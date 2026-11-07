package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.UUID;

/**
 * A base unit a product may be measured in — FR-UOM-01.
 *
 * <p>Distinct from {@link ProductSellingUnit}, which is one product's own units
 * and their conversion factors. This is the vocabulary those are drawn from.
 */
@Entity
@Table(name = "unit_of_measure")
public class UnitOfMeasure {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @NotBlank
    @Column(name = "name", nullable = false, unique = true)
    private String name;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected UnitOfMeasure() { }

    public UnitOfMeasure(String name) { this.name = name; }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isActive() { return active; }
    public void deactivate() { this.active = false; }
    public void activate() { this.active = true; }
    public Instant getCreatedAt() { return createdAt; }
}
