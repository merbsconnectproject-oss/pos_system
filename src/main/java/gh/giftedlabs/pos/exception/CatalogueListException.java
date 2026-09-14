package gh.giftedlabs.pos.exception;

import java.util.Map;

/** A category, brand or unit that cannot be added or changed — FR-PROD-05. */
public class CatalogueListException extends RuntimeException {
    private final String code;
    private final Map<String, Object> details;

    private CatalogueListException(String code, String message, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public static CatalogueListException duplicate(String kind, String name) {
        return new CatalogueListException("LIST_NAME_TAKEN",
                "There is already a %s called \"%s\".".formatted(kind, name),
                Map.of("kind", kind, "name", name));
    }

    /**
     * FR-UOM-01: a base unit is the unit every quantity of a product is stored
     * in, so retiring one that products still measure in would leave those
     * quantities describing a unit the system no longer recognises.
     */
    public static CatalogueListException stillInUse(String kind, String name, long count) {
        return new CatalogueListException("LIST_ENTRY_IN_USE",
                "\"%s\" is still used by %d product%s. Move them first, or rename it instead."
                        .formatted(name, count, count == 1 ? "" : "s"),
                Map.of("kind", kind, "name", name, "inUse", count));
    }

    public String getCode() { return code; }
    public Map<String, Object> getDetails() { return details; }
}
