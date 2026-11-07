package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.Product;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A product as the frontend's {@code types.ts} Product expects it.
 *
 * <p>{@code costPrice}, {@code stock} and {@code minStockAlert} are per-outlet
 * maps that F owns. They are absent here rather than sent empty, so a screen
 * cannot mistake "inventory not built yet" for "no stock anywhere".
 */
public record ProductView(
        UUID id,
        String sku,
        String name,
        String description,
        String category,
        String brand,
        UUID supplierId,
        String baseUnit,
        BigDecimal retailPrice,
        BigDecimal tradePrice,
        BigDecimal floorPrice,
        String imageUrl,
        boolean active,
        List<SellingUnitView> sellingUnits,
        List<BarcodeView> barcodes,
        Instant createdAt,
        Instant updatedAt) {

    public record SellingUnitView(String name, BigDecimal conversionFactor, BigDecimal price, BigDecimal tradePrice) {
    }

    public record BarcodeView(String code, String unitName) {
    }

    public static ProductView of(Product product) {
        return new ProductView(
                product.getId(),
                product.getSku(),
                product.getName(),
                product.getDescription(),
                product.getCategory() == null ? null : product.getCategory().getName(),
                product.getBrand() == null ? null : product.getBrand().getName(),
                product.getSupplierId(),
                product.getBaseUnit(),
                product.getRetailPrice(),
                product.getTradePrice(),
                product.getFloorPrice(),
                product.getImageUrl(),
                product.isActive(),
                product.getSellingUnits().stream()
                        .map(unit -> new SellingUnitView(unit.getName(), unit.getConversionFactor(),
                                unit.getPrice(), unit.getTradePrice()))
                        .toList(),
                product.getBarcodes().stream()
                        .map(code -> new BarcodeView(code.getCode(), code.getUnitName()))
                        .toList(),
                product.getCreatedAt(),
                product.getUpdatedAt());
    }
}
