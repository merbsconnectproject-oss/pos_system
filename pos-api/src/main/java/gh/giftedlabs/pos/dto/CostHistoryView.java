package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** A real valuation-changing stock movement — FR-PROD-09. */
public record CostHistoryView(
        UUID id,
        BigDecimal unitCost,
        String movementType,
        UUID outletId,
        String outletName,
        UUID changedById,
        String changedBy,
        Instant changedAt) {
}
