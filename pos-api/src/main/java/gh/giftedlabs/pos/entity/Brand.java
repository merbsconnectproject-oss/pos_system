package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.UUID;

/** A catalogue list, managed rather than hard-coded — FR-PROD-05. */
@Entity
@Table(name = "brand")
public class Brand {

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

    protected Brand() { }

    public Brand(String name) { this.name = name; }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isActive() { return active; }
    public void deactivate() { this.active = false; }
    public void activate() { this.active = true; }
    public Instant getCreatedAt() { return createdAt; }
}
