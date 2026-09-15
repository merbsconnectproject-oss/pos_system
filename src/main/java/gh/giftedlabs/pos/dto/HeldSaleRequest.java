package gh.giftedlabs.pos.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record HeldSaleRequest(
        @NotNull UUID outletId,
        UUID terminalId,
        @Size(max = 160) String label,
        UUID customerId,
        @Size(max = 200) String customerName,
        @Size(max = 40) String customerPhone,
        @PositiveOrZero long total,
        @NotEmpty List<@Valid Line> lines) {

    public record Line(
            @NotNull UUID productId,
            @NotBlank String productName,
            @NotBlank String sku,
            @NotBlank String selectedUnit,
            @NotNull @Positive BigDecimal conversionFactor,
            @NotNull @Positive BigDecimal quantity,
            @NotNull @PositiveOrZero BigDecimal unitPrice,
            @NotNull @PositiveOrZero BigDecimal discount,
            @NotNull @PositiveOrZero BigDecimal lineTotal,
            @NotNull @PositiveOrZero BigDecimal frozenCostPrice) { }
}
