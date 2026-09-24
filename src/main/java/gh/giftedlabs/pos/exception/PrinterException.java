package gh.giftedlabs.pos.exception;

import java.util.Map;

/** A local printer failure. The sale is already complete when this is raised. */
public class PrinterException extends RuntimeException {

    private final String code;
    private final Map<String, Object> details;

    public PrinterException(String code, String message, Map<String, Object> details) {
        super(message);
        this.code = code;
        this.details = Map.copyOf(details);
    }

    public String getCode() {
        return code;
    }

    public Map<String, Object> getDetails() {
        return details;
    }
}
