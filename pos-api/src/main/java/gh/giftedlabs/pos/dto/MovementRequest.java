package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.rules.MovementType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A stock change — FR-INV-02, FR-INV-03.
 *
 * <p>{@code quantity} is a magnitude, always positive. The direction belongs to
 * the {@link MovementType}, so no caller can turn a DAMAGE into an increase by
 * passing a negative number.
 */
public record MovementRequest(

        @NotNull UUID productId,
        @NotNull UUID outletId,
        @NotNull MovementType type,

        @NotNull @Positive(message = "Enter a quantity greater than zero")
        BigDecimal quantity,

        /** BR-4: required for a receipt, ignored by every other type. */
        BigDecimal unitCost,

        /** FR-INV-05: adjustments and write-offs cannot be entered blind. */
        @Size(max = 80) String reason,
        @Size(max = 500) String note,

        /** BR-7: the document this came from, and the idempotency key with it. */
        @Size(max = 40) String sourceType,
        UUID sourceId,

        /**
         * FR-INV-06: who approved this, when its value passes the threshold.
         *
         * <p>Null on everything below the threshold, which is most movements.
         * The person named must hold {@code stock.approve_adjustment}, and
         * {@link #approvalPin} must prove it is really them — an id in a request
         * body is only the client's claim.
         */
        UUID approvedBy,

        /** FR-INV-06: the approver's PIN. {@link #approvedBy} is honoured only when it matches. */
        String approvalPin) {

    /**
     * For movements the system writes itself — a sale, a receipt, a void.
     *
     * <p>None of them can need approval: they are the consequence of a document
     * that was already authorised, and {@link MovementType#isAdjustment()} does
     * not hold for any of them.
     */
    public MovementRequest(UUID productId, UUID outletId, MovementType type, BigDecimal quantity,
                           BigDecimal unitCost, String reason, String note,
                           String sourceType, UUID sourceId) {
        this(productId, outletId, type, quantity, unitCost, reason, note, sourceType, sourceId, null, null);
    }

    /** Back-compat: an approver named without a PIN (the PIN path supersedes this). */
    public MovementRequest(UUID productId, UUID outletId, MovementType type, BigDecimal quantity,
                           BigDecimal unitCost, String reason, String note,
                           String sourceType, UUID sourceId, UUID approvedBy) {
        this(productId, outletId, type, quantity, unitCost, reason, note, sourceType, sourceId, approvedBy, null);
    }
}
