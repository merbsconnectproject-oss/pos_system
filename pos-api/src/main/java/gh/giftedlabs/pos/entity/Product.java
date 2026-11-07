package gh.giftedlabs.pos.entity;

import gh.giftedlabs.pos.exception.CatalogueConflictException;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A catalogue product — FR-PROD-01, FR-UOM-01.
 *
 * <p>Stock, weighted-average cost and reorder level are per outlet and live in
 * F. What is here is what the product <em>is</em>, independent of where it sits.
 *
 * <p>Prices carry four decimals because they are per-unit <em>rates</em>, not
 * stored amounts. BR-11's integer rule governs what a sale line settles to;
 * rounding a rate first makes {@code 3 x 18.335} come to 55.02 instead of
 * 55.01, and the receipt stops adding up.
 */
@Entity
@Table(name = "product")
public class Product {

    @Id @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** FR-PROD-02: unique system-wide, compared without regard to case. */
    @NotBlank
    @Column(name = "sku", nullable = false)
    private String sku;

    @NotBlank
    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "brand_id")
    private Brand brand;

    @Column(name = "supplier_id")
    private UUID supplierId;

    /**
     * FR-UOM-01: the smallest sellable unit, and the unit every quantity in the
     * system is stored in. Changing it once movements exist would silently
     * reinterpret every number recorded against this product, which is why
     * FR-UOM-07 locks it — see {@code assertConvertible}.
     */
    @NotBlank
    @Column(name = "base_unit", nullable = false)
    private String baseUnit;

    @PositiveOrZero
    @Column(name = "retail_price", nullable = false)
    private BigDecimal retailPrice = BigDecimal.ZERO;

    @PositiveOrZero
    @Column(name = "trade_price", nullable = false)
    private BigDecimal tradePrice = BigDecimal.ZERO;

    /** BR-10: the lowest price an approval can authorise. */
    @PositiveOrZero
    @Column(name = "floor_price", nullable = false)
    private BigDecimal floorPrice = BigDecimal.ZERO;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "synced_at")
    private Instant syncedAt;

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    private List<ProductSellingUnit> sellingUnits = new ArrayList<>();

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<ProductBarcode> barcodes = new ArrayList<>();

    protected Product() { }

    public Product(String sku, String name, String baseUnit) {
        this.sku = sku;
        this.name = name;
        this.baseUnit = baseUnit;
    }

    public UUID getId() { return id; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Category getCategory() { return category; }
    public void setCategory(Category category) { this.category = category; }

    public Brand getBrand() { return brand; }
    public void setBrand(Brand brand) { this.brand = brand; }

    public UUID getSupplierId() { return supplierId; }
    public void setSupplierId(UUID supplierId) { this.supplierId = supplierId; }

    public String getBaseUnit() { return baseUnit; }
    /** FR-UOM-01: only the service may change this before movements exist. */
    public void setBaseUnit(String baseUnit) {
        if (baseUnit == null || baseUnit.isBlank()) throw new IllegalArgumentException("Base unit is required");
        this.baseUnit = baseUnit.trim();
        touch();
    }

    public BigDecimal getRetailPrice() { return retailPrice; }
    public BigDecimal getTradePrice() { return tradePrice; }
    public BigDecimal getFloorPrice() { return floorPrice; }

    /**
     * BR-10 · FR-PRICE: the three prices move together because the invariant is
     * between them. Setting them one at a time would let a caller pass through a
     * state where the floor is above retail and every sale needs approval.
     */
    public void setPrices(BigDecimal retail, BigDecimal trade, BigDecimal floor) {
        if (floor.compareTo(retail) > 0) {
            throw new IllegalArgumentException("Floor price cannot be above the retail price");
        }
        this.retailPrice = retail;
        this.tradePrice = trade;
        this.floorPrice = floor;
        touch();
    }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public boolean isActive() { return active; }

    /** FR-PROD-08 · BR-17: sale lines reference this row, so it is never deleted. */
    public void deactivate() { this.active = false; touch(); }
    public void activate() { this.active = true; touch(); }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getSyncedAt() { return syncedAt; }

    public List<ProductSellingUnit> getSellingUnits() { return List.copyOf(sellingUnits); }
    public List<ProductBarcode> getBarcodes() { return List.copyOf(barcodes); }

    public void addSellingUnit(ProductSellingUnit unit) {
        unit.attachTo(this);
        sellingUnits.add(unit);
        touch();
    }

    public void clearSellingUnits() {
        sellingUnits.clear();
        touch();
    }

    public void addBarcode(ProductBarcode barcode) {
        barcode.attachTo(this);
        barcodes.add(barcode);
        touch();
    }

    public void clearBarcodes() {
        barcodes.clear();
        touch();
    }

    /**
     * FR-UOM-03: what one of {@code unitName} is worth in base units.
     *
     * <p>The base unit is always 1 and needs no row — a product that sells only
     * in its base unit has no selling units at all, and scanning its barcode
     * must still work.
     */
    public Optional<BigDecimal> conversionFactorFor(String unitName) {
        if (baseUnit.equalsIgnoreCase(unitName)) return Optional.of(BigDecimal.ONE);
        return sellingUnits.stream()
                .filter(unit -> unit.getName().equalsIgnoreCase(unitName))
                .map(ProductSellingUnit::getConversionFactor)
                .findFirst();
    }

    /**
     * FR-UOM-03 · BR-12: the factor for {@code unitName}, checked against the
     * one the caller claimed.
     *
     * <p>This number decides how much stock leaves the shelf. It used to be
     * taken from the request body unexamined on every path that moves
     * inventory, so a screen holding a stale "Box of 12" could sell a box, bill
     * for a box, and take one piece out of stock — and the level and the ledger
     * would agree with each other while both disagreed with the shelf. Line
     * totals were never taken on trust for this reason; the factor is the same
     * kind of number and had simply been missed.
     *
     * <p>{@code claimed} may be null, which asks for the catalogue's figure
     * without comparing anything.
     */
    public BigDecimal requireConversionFactor(String unitName, BigDecimal claimed) {
        BigDecimal known = conversionFactorFor(unitName)
                .orElseThrow(() -> CatalogueConflictException.unitNotSold(name, unitName));
        if (claimed != null && known.compareTo(claimed) != 0) {
            throw CatalogueConflictException.unitMismatch(name, unitName, claimed, known);
        }
        return known;
    }

    /**
     * FR-UOM-05: the same check for goods coming in, where the unit may be one
     * the shop never sells in.
     *
     * <p>A pallet is a purchase unit and nothing else — refusing it because it
     * is not a selling unit would block a delivery that genuinely arrived that
     * way. So an unrecognised unit keeps the caller's factor; a recognised one
     * must match the catalogue, which is where the actual bug lived.
     */
    public BigDecimal receivingConversionFactor(String unitName, BigDecimal claimed) {
        return conversionFactorFor(unitName)
                .map(known -> {
                    if (claimed != null && known.compareTo(claimed) != 0) {
                        throw CatalogueConflictException.unitMismatch(name, unitName, claimed, known);
                    }
                    return known;
                })
                .orElse(claimed);
    }

    private void touch() { this.updatedAt = Instant.now(); }
}
