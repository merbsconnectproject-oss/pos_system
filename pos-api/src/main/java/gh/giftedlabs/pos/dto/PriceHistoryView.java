package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * FR-PRICE-06: a price as it stood, and who set it.
 *
 * <p>The table is append-only, so this is the record of what was charged at a
 * given time — which is what BR-5 relies on when somebody asks why a receipt
 * from March says what it says.
 */
public record PriceHistoryView(
        UUID id,
        BigDecimal retailPrice,
        BigDecimal tradePrice,
        BigDecimal floorPrice,
        String changedBy,
        Instant changedAt) {
}
