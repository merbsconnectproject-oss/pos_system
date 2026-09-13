package gh.giftedlabs.pos.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "password_reset_token")
public class PasswordResetToken {
    @Id @GeneratedValue private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "token_hash", nullable = false, unique = true, length = 64) private String tokenHash;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "used_at") private Instant usedAt;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt = Instant.now();

    protected PasswordResetToken() {}
    public PasswordResetToken(UUID userId, String tokenHash, Instant expiresAt, Instant createdAt) {
        this.userId = userId; this.tokenHash = tokenHash; this.expiresAt = expiresAt; this.createdAt = createdAt;
    }
    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public boolean isUsableAt(Instant now) { return usedAt == null && expiresAt.isAfter(now); }
    public void consume(Instant now) { usedAt = now; }
}
