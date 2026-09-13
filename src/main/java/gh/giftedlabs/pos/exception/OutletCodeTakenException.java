package gh.giftedlabs.pos.exception;

/** Two branches cannot share a receipt code — BR-6 numbers are per outlet. */
public class OutletCodeTakenException extends RuntimeException {
    private final String code;

    public OutletCodeTakenException(String code, String usedBy) {
        super("Receipt code \"%s\" is already used by %s. Receipt numbers must stay unique per branch."
                .formatted(code, usedBy));
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
