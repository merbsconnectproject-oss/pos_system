package gh.giftedlabs.pos.exception;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * BR-9: negative stock is blocked unless the user holds {@code stock.oversell}.
 *
 * <p>Carries what is actually there, because "not enough stock" without a
 * number gives the cashier nothing to tell the customer.
 */
public class InsufficientStockException extends RuntimeException {
    private final UUID productId;
    private final BigDecimal available;
    private final BigDecimal requested;

    public InsufficientStockException(UUID productId, BigDecimal available, BigDecimal requested) {
        super("Only %s in stock here, and %s was requested.".formatted(
                available.stripTrailingZeros().toPlainString(),
                requested.stripTrailingZeros().toPlainString()));
        this.productId = productId;
        this.available = available;
        this.requested = requested;
    }

    public UUID getProductId() { return productId; }
    public BigDecimal getAvailable() { return available; }
    public BigDecimal getRequested() { return requested; }
}
