package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.DecimalMin;

import java.math.BigDecimal;

/**
 * Setting or clearing a branch's price — FR-PRICE-03.
 *
 * <p>Null clears that level back to the product's shared price. It is not the
 * same as zero, which is a deliberate price of nothing, so the field is sent
 * explicitly either way rather than omitted.
 */
public record OutletPriceRequest(
        @DecimalMin(value = "0", message = "A price cannot be negative") BigDecimal retailPrice,
        @DecimalMin(value = "0", message = "A price cannot be negative") BigDecimal tradePrice,
        @DecimalMin(value = "0", message = "A price cannot be negative") BigDecimal floorPrice) {

    /** Clearing every level removes the override rather than storing an empty one. */
    public boolean clearsEverything() {
        return retailPrice == null && tradePrice == null && floorPrice == null;
    }
}
