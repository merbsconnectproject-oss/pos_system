package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One ledger line as the movements screen reads it — FR-INV-03, FR-INV-04.
 *
 * <p>{@code previousStock} and {@code newStock} are computed as a running
 * balance over the ledger, not stored. Storing them would be a second record of
 * the same fact, free to disagree with the deltas that BR-2 says are the truth —
 * and a backdated correction would leave every later row's figures wrong.
 */
public record MovementView(
        UUID id,
        Instant timestamp,
        UUID outletId,
        UUID productId,
        String productName,
        String type,
        BigDecimal quantity,
        BigDecimal previousStock,
        BigDecimal newStock,
        BigDecimal unitCost,
        String reason,
        String note,
        String referenceNumber,
        boolean exception,
        String user) {
}
