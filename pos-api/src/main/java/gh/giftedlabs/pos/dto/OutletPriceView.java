package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.ProductOutletPrice;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * FR-PRICE-03: what one branch charges, where it differs.
 *
 * <p>Nulls travel as nulls. A screen showing the override needs to tell "this
 * branch charges the shared price" apart from "this branch charges nothing",
 * and sending the resolved price for both would make them identical.
 */
public record OutletPriceView(
        UUID outletId,
        BigDecimal retailPrice,
        BigDecimal tradePrice,
        BigDecimal floorPrice,
        Instant updatedAt) {

    public static OutletPriceView of(ProductOutletPrice price) {
        return new OutletPriceView(price.getOutletId(), price.getRetailPrice(),
                price.getTradePrice(), price.getFloorPrice(), price.getUpdatedAt());
    }
}
