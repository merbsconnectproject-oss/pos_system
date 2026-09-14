package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Stock for one product at one outlet — BR-1.
 *
 * <p>Always carries its outlet. There is no shape in this API for "the stock of
 * a product" without one, because BR-1 says no such number exists.
 */
public record StockView(
        UUID productId,
        UUID outletId,
        BigDecimal quantity,
        BigDecimal averageCost,
        BigDecimal reorderLevel,
        boolean low) {

    /** A product never stocked here is zero, not absent — the counter asks either way. */
    public static StockView empty(UUID productId, UUID outletId) {
        return new StockView(productId, outletId, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, true);
    }
}
