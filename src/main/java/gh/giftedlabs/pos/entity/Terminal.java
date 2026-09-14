package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A till, and the block of receipt numbers it owns — BR-6.
 *
 * <p>Each terminal holds a pre-allocated range. That is what lets it number a
 * receipt with no server in the path, and what stops two tills ever issuing the
 * same number: their ranges do not overlap.
 */
@Entity
@Table(name = "terminal")
public class Terminal {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "outlet_id", nullable = false, updatable = false)
    private UUID outletId;

    @Column(name = "code", nullable = false)
    private String code;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "seq_block_start", nullable = false)
    private long blockStart;

    @Column(name = "seq_block_end", nullable = false)
    private long blockEnd;

    @Column(name = "seq_current", nullable = false)
    private long current;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Terminal() { }

    public Terminal(UUID outletId, String code, String name, long blockStart, long blockSize) {
        this.outletId = outletId;
        this.code = code;
        this.name = name;
        this.blockStart = blockStart;
        this.blockEnd = blockStart + blockSize - 1;
        this.current = blockStart;
    }

    public UUID getId() { return id; }
    public UUID getOutletId() { return outletId; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public long getBlockStart() { return blockStart; }
    public long getBlockEnd() { return blockEnd; }
    public long getCurrent() { return current; }
    public boolean isActive() { return active; }
    public Instant getCreatedAt() { return createdAt; }

    public boolean hasNumbersLeft() { return current <= blockEnd; }

    /**
     * Take the next sequence number and advance past it — BR-6.
     *
     * <p>Consumed exactly once and never reissued, which is why the caller must
     * hold a row lock: two transactions reading the same {@code current} would
     * both claim it, and the receipt number would stop being unique.
     */
    public long takeNextSequence() {
        if (!hasNumbersLeft()) {
            throw new IllegalStateException("Terminal %s has used its whole receipt block".formatted(code));
        }
        return current++;
    }

    /** A new block, issued when the old one runs out. */
    public void assignBlock(long start, long size) {
        this.blockStart = start;
        this.blockEnd = start + size - 1;
        this.current = start;
    }
}
