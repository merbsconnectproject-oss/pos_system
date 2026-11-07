package gh.giftedlabs.pos.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Creating or editing a product — FR-PROD-01, FR-UOM-02.
 *
 * <p>{@code sku} is optional: leave it blank and FR-PROD-02 generates one.
 * {@code baseUnit} is accepted on create and ignored on edit — changing it
 * would reinterpret every quantity already recorded against the product.
 */
public record ProductRequest(

        @Size(max = 40) String sku,

        @NotBlank(message = "Enter the product name")
        @Size(max = 300)
        String name,

        @Size(max = 2000) String description,

        @NotBlank(message = "Choose a category")
        String category,

        @Size(max = 120) String brand,

        UUID supplierId,

        @NotBlank(message = "Choose a base unit")
        @Size(max = 30)
        String baseUnit,

        @NotNull @PositiveOrZero BigDecimal retailPrice,
        @NotNull @PositiveOrZero BigDecimal tradePrice,
        @NotNull @PositiveOrZero BigDecimal floorPrice,

        @Size(max = 500) String imageUrl,

        @Valid List<SellingUnitRequest> sellingUnits,
        @Valid List<BarcodeRequest> barcodes) {

    /** FR-UOM-02/04. */
    public record SellingUnitRequest(
            @NotBlank @Size(max = 60) String name,
            @NotNull @Positive BigDecimal conversionFactor,
            @NotNull @PositiveOrZero BigDecimal price,
            @PositiveOrZero BigDecimal tradePrice) {
    }

    /** FR-PROD-03/04. */
    public record BarcodeRequest(
            @NotBlank @Pattern(regexp = "[0-9A-Za-z\\-]{4,64}", message = "A barcode is 4-64 letters, digits or hyphens")
            String code,
            @NotBlank @Size(max = 60) String unitName) {
    }
}
