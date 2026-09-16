package gh.giftedlabs.pos.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * An order being raised or amended — FR-SUP-08.
 *
 * <p>Unlike a goods receipt, an order genuinely has a draft state: it is written,
 * checked against what the shelves need, and only then sent. Nothing it records
 * moves stock, so a half-finished one is harmless.
 */
public record PurchaseOrderRequest(

        @NotNull(message = "Choose the branch the goods are for") UUID outletId,
        @NotNull(message = "Choose the supplier") UUID supplierId,

        /** When the supplier promised it. Optional — plenty of orders have no date. */
        LocalDate expectedOn,

        @Size(max = 500) String note,

        @NotEmpty(message = "An order needs at least one line")
        @Valid List<Line> lines) {

    /** FR-UOM-05: quantity is in the purchase unit — 3 drums, not 300 metres. */
    public record Line(
            @NotNull UUID productId,
            @NotBlank(message = "Name the unit being ordered") @Size(max = 60) String purchaseUnit,
            @NotNull @Positive BigDecimal conversionFactor,
            @NotNull @Positive(message = "Enter a quantity greater than zero") BigDecimal quantity,
            @NotNull @PositiveOrZero BigDecimal unitCost) {
    }
}
