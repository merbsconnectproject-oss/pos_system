package gh.giftedlabs.pos.rules;

import java.util.Locale;

/**
 * Stock-keeping unit codes — FR-PROD-02.
 *
 * <p>The catalogue's convention is {@code {OUTLET}-{CATEGORY}-{NNN}}, as in
 * {@code RAD-LGT-001}: the branch the product was set up for, a three-letter
 * stem of its category, and a running number.
 *
 * <p>Generated only when the user leaves the field blank — FR-PROD-02 requires
 * a manual override, because a shop that already labels its shelves has a
 * convention of its own and ours must not overwrite it.
 *
 * <p>A pure function, like {@link ReceiptSequence}: the running number is
 * supplied by the caller, who is the only one able to ask the database. That
 * keeps the format decision testable without a database and stops it drifting
 * into a query.
 */
public final class Sku {

    private static final int SEQ_PAD = 3;
    private static final int STEM = 3;

    private Sku() {
    }

    /**
     * The prefix every SKU in this branch-and-category shares, ending in the
     * hyphen before the running number — {@code RAD-LGT-}.
     *
     * <p>The caller counts existing SKUs against this to find the next number.
     */
    public static String prefix(String outletCode, String categoryName) {
        return "%s-%s-".formatted(outletSegment(outletCode), stem(categoryName, "GEN"));
    }

    /** {@code format("RAD", "Lighting & Lamps", 1)} is {@code RAD-LGT-001}. */
    public static String format(String outletCode, String categoryName, long sequence) {
        return prefix(outletCode, categoryName) + pad(sequence);
    }

    private static String pad(long sequence) {
        return String.format("%0" + SEQ_PAD + "d", sequence);
    }

    /**
     * The branch's own code, used as it stands.
     *
     * <p>Deliberately not run through {@link #stem}: an outlet code is already
     * a code — BR-6 constrains it to 2-6 letters or digits — and stripping its
     * digits would turn RAD2 back into RAD and give two branches the same SKU
     * prefix.
     */
    private static String outletSegment(String outletCode) {
        if (outletCode == null || outletCode.isBlank()) return "GEN";
        return outletCode.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * Three letters, upper case, padded when a name is shorter than that.
     *
     * <p>Letters only: "Paints & Adhesives" gives PAI, not "PA&". Digits and
     * punctuation would survive into a code that is read aloud across a counter.
     */
    private static String stem(String value, String fallback) {
        if (value == null) return fallback;
        String letters = value.replaceAll("[^A-Za-z]", "").toUpperCase(Locale.ROOT);
        if (letters.isEmpty()) return fallback;
        return letters.length() >= STEM
                ? letters.substring(0, STEM)
                : (letters + "XXX").substring(0, STEM);
    }
}
