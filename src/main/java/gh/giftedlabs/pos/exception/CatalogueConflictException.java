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

    public String getCode() { return code; }
    public Map<String, Object> getDetails() { return details; }
}
