package gh.giftedlabs.pos.exception;

import java.util.Map;

/**
 * A catalogue value that must be unique is not — FR-PROD-02, FR-PROD-03.
 *
 * <p>One exception with a code rather than one class per field: the client
 * branches on {@code code} and highlights the field named in {@code details},
 * and a duplicate SKU and a duplicate barcode need the same handling.
 */
public class CatalogueConflictException extends RuntimeException {
    private final String code;
    private final Map<String, Object> details;

    private CatalogueConflictException(String code, String message, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public static CatalogueConflictException sku(String sku, String usedBy) {
        return new CatalogueConflictException("SKU_TAKEN",
                "SKU \"%s\" already belongs to %s. A SKU identifies one product.".formatted(sku, usedBy),
                Map.of("field", "sku", "sku", sku));
    }

    public static CatalogueConflictException barcode(String barcode, String usedBy) {
        return new CatalogueConflictException("BARCODE_TAKEN",
                "Barcode \"%s\" already scans to %s. Scanning must never be ambiguous.".formatted(barcode, usedBy),
                Map.of("field", "barcodes", "barcode", barcode));
    }

    /** FR-PROD-04: a code bound to a unit the product does not sell in. */
    public static CatalogueConflictException unknownUnit(String barcode, String unitName) {
        return new CatalogueConflictException("BARCODE_UNIT_UNKNOWN",
                "Barcode \"%s\" is bound to \"%s\", which is not a unit this product sells in."
                        .formatted(barcode, unitName),
                Map.of("field", "barcodes", "unitName", unitName));
    }

    /**
     * FR-UOM-03: a sale in a unit the product does not sell in.
     *
     * <p>Distinct from {@link #unknownUnit}: that is a barcode being bound to a
     * unit as the catalogue is edited, this is a line trying to transact in one.
     */
    public static CatalogueConflictException unitNotSold(String productName, String unitName) {
        return new CatalogueConflictException("UNIT_NOT_SOLD",
                "\"%s\" is not a unit %s is sold in. Reload the catalogue and ring the line again."
                        .formatted(unitName, productName),
                Map.of("field", "selectedUnit", "unitName", unitName));
    }

    /**
     * FR-UOM-03 · BR-12: the client's conversion factor disagrees with the
     * catalogue's.
     *
     * <p>Almost always a screen holding a unit that has since been edited. It is
     * refused rather than corrected: the price on the line was chosen for the
     * unit the cashier saw, and quietly re-scaling the quantity under it would
     * charge for one thing and hand over another.
     */
    public static CatalogueConflictException unitMismatch(String productName, String unitName,
                                                          Object claimed, Object known) {
        return new CatalogueConflictException("UNIT_FACTOR_STALE",
                ("One \"%s\" of %s is %s, not %s. This screen is showing an old version of the "
                        + "catalogue — reload it before continuing.")
                        .formatted(unitName, productName, known, claimed),
                Map.of("field", "conversionFactor", "unitName", unitName,
                        "expected", String.valueOf(known), "submitted", String.valueOf(claimed)));
    }

    public String getCode() { return code; }
    public Map<String, Object> getDetails() { return details; }
}
