package gh.giftedlabs.pos.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * A delivery being booked in — FR-SUP-02, FR-SUP-03.
 *
 * <p>Creating one confirms it: there is no draft state, because no screen has
 * a use for a receipt that has not moved stock, and a half-posted delivery is
 * a thing to explain rather than a feature.
 */
public record GoodsReceiptRequest(

        @NotNull(message = "Choose the branch receiving the goods") UUID outletId,
        @NotNull(message = "Choose the supplier") UUID supplierId,

        /**
         * The order this delivery is against, when there is one — FR-SUP-08.
         *
         * <p>Optional, and deliberately. Goods arrive without an order every day:
         * a supplier's van turns up and the storekeeper books it in. Requiring an
         * order would only teach people to raise a fake one afterwards.
         */
        UUID purchaseOrderId,

        @Size(max = 80) String reference,
        @Size(max = 500) String note,

        @NotEmpty(message = "A receipt needs at least one line")
        @Valid List<Line> lines) {

    /** FR-SUP-03 · FR-UOM-05: quantity is in the purchase unit, not base units. */
    public record Line(
            @NotNull UUID productId,
            @NotBlank(message = "Name the unit received") @Size(max = 60) String purchaseUnit,
            @NotNull @Positive BigDecimal conversionFactor,
            @NotNull @Positive(message = "Enter a quantity greater than zero") BigDecimal quantity,
            @NotNull @PositiveOrZero BigDecimal unitCost) {
    }
}
