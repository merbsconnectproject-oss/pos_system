package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One attempt to copy the database — NFR-6, FR-SET-07.
 *
 * <p>Recorded rather than only logged. A backup nobody can see the state of is
 * indistinguishable from no backup at all, and the question an owner asks is
 * "when did this last work", which a log file on a counter PC cannot answer.
 */
@Entity
@Table(name = "backup_run")
public class BackupRun {

    public enum Kind { SCHEDULED, MANUAL, RESTORE }

    public enum Outcome { RUNNING, SUCCEEDED, FAILED }

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, updatable = false)
    private Kind kind;

    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt = Instant.now();

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false)
    private Outcome outcome = Outcome.RUNNING;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "stored_local", nullable = false)
    private boolean storedLocal;

    /** NFR-6: the word that matters. Local alone does not survive the disk. */
    @Column(name = "stored_offsite", nullable = false)
    private boolean storedOffsite;

    @Column(name = "destination")
    private String destination;

    @Column(name = "error")
    private String error;

    @Column(name = "actor_id", updatable = false)
    private UUID actorId;

    protected BackupRun() { }

    public BackupRun(Kind kind, UUID actorId, Instant at) {
        this.kind = kind;
        this.actorId = actorId;
        this.startedAt = at;
    }

    public UUID getId() { return id; }
    public Kind getKind() { return kind; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public Outcome getOutcome() { return outcome; }
    public String getFileName() { return fileName; }
    public Long getSizeBytes() { return sizeBytes; }
    public boolean isStoredLocal() { return storedLocal; }
    public boolean isStoredOffsite() { return storedOffsite; }
    public String getDestination() { return destination; }
    public String getError() { return error; }
    public UUID getActorId() { return actorId; }

    public void succeeded(String fileName, long sizeBytes, boolean local, boolean offsite,
                          String destination, Instant at) {
        this.fileName = fileName;
        this.sizeBytes = sizeBytes;
        this.storedLocal = local;
        this.storedOffsite = offsite;
        this.destination = destination;
        this.outcome = Outcome.SUCCEEDED;
        this.finishedAt = at;
    }

    /**
     * The reason is kept in full.
     *
     * <p>"The backup failed" without it is a line nobody can act on at eight in
     * the morning with a shop opening.
     */
    public void failed(String reason, Instant at) {
        this.outcome = Outcome.FAILED;
        this.error = reason;
        this.finishedAt = at;
    }
}
