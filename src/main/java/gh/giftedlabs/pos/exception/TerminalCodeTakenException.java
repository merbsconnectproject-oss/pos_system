package gh.giftedlabs.pos.exception;

/**
 * Two tills at one branch cannot share a code — BR-6.
 *
 * <p>The code is part of every receipt number the till issues, so two counters
 * answering to "02" would print numbers nobody could trace back to a machine.
 * {@code terminal_code_unique_per_outlet} enforces it; this exists so the answer
 * is a 409 naming the code rather than a constraint violation surfacing as a
 * generic 500.
 */
public class TerminalCodeTakenException extends RuntimeException {
    private final String code;

    public TerminalCodeTakenException(String code) {
        super("Till \"%s\" already exists at this branch. A till code is part of every receipt number it issues, so it has to be unique here."
                .formatted(code));
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
