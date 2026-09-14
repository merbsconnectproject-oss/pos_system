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
        UUID sourceId) {
}
