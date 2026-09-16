package gh.giftedlabs.pos.rules;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Laying a receipt out on a character grid — FR-RCPT-03, FR-RCPT-04, PRD §9.
 *
 * <p>Pure text, no printer and no database. That is the point: the layout is the
 * part that is fiddly and the part a customer reads, so it is written where it
 * can be asserted character by character rather than inspected on a roll of
 * paper. Turning these lines into ESC/POS bytes is a separate, trivial step.
 *
 * <p>Money is right-aligned to the last column throughout. A column of figures
 * that does not line up is the difference between a receipt somebody can check
 * at a glance and one they have to read twice.
 */
public final class ReceiptLayout {

    private ReceiptLayout() {
    }

    /** One item, already priced. Amounts in major units, formatted to 2dp. */
    public record Item(String name, BigDecimal quantity, String unit, BigDecimal unitPrice,
                       BigDecimal lineTotal) {
    }

    /** One tender line, with an optional reference for mobile money. */
    public record Tender(String label, BigDecimal amount, String reference) {
    }

    /**
     * Everything printed on one receipt.
     *
     * @param reprint FR-RCPT-06: adds the band under the header. Never silently —
     *                a reprint that looked like an original would be a second
     *                receipt for one sale
     */
    public record Receipt(
            String shopName,
            String addressLine,
            String phoneLine,
            /**
             * What this document is — {@code RECEIPT}, {@code CREDIT NOTE}.
             *
             * <p>Printed under the header on anything that is not an ordinary
             * sale, so a customer holding two slips can tell which is which.
             * Null on a plain receipt, where the receipt number says it.
             */
            String documentTitle,
            String receiptNumber,
            String dateTime,
            String cashier,
            String customer,
            List<Item> items,
            BigDecimal subtotal,
            BigDecimal discount,
            BigDecimal tax,
            BigDecimal total,
            List<Tender> tenders,
            BigDecimal change,
            String footer,
            boolean reprint,
            /**
             * An ASCII currency, printed against every amount.
             *
             * <p>The shop's symbol is GH₵ and a thermal printer on code page 437
             * cannot render it — it would come out as two pieces of rubbish. The
             * currency *code* is ASCII by definition, so that is what is printed.
             * Amounts without any currency at all is the other failure: a slip
             * that says 310.00 and nothing else.
             */
            String currency) {
    }

    /** Renders the whole receipt as lines of text at the given width. */
    public static List<String> render(Receipt receipt, ReceiptWidth width) {
        int columns = width.columns();
        List<String> out = new ArrayList<>();

        centre(out, receipt.shopName(), columns);
        centre(out, receipt.addressLine(), columns);
        centre(out, receipt.phoneLine(), columns);
        out.add(rule(columns));

        // What the document is, before what is on it. A credit note that looked
        // like a receipt is one a customer could present twice.
        if (present(receipt.documentTitle())) {
            centre(out, receipt.documentTitle().toUpperCase(java.util.Locale.ROOT), columns);
            out.add(rule(columns));
        }

        // FR-RCPT-06: immediately below the header, where it cannot be missed.
        if (receipt.reprint()) {
            centre(out, "*** REPRINT ***", columns);
            out.add(rule(columns));
        }

        labelled(out, "Receipt", receipt.receiptNumber(), columns);
        labelled(out, "Date", receipt.dateTime(), columns);
        labelled(out, "Cashier", receipt.cashier(), columns);
        if (present(receipt.customer())) labelled(out, "Customer", receipt.customer(), columns);
        out.add(rule(columns));

        for (Item item : receipt.items()) {
            out.addAll(renderItem(item, width, receipt.currency()));
        }
        out.add(rule(columns));

        money(out, "Subtotal", receipt.subtotal(), columns, receipt.currency());
        if (isNonZero(receipt.discount())) {
            // Shown as a negative, because that is what it did to the total.
            money(out, "Discount", receipt.discount().negate(), columns, receipt.currency());
        }
        if (isNonZero(receipt.tax())) money(out, "Tax", receipt.tax(), columns, receipt.currency());
        money(out, "TOTAL", receipt.total(), columns, receipt.currency());
        out.add(rule(columns));

        for (Tender tender : receipt.tenders()) {
            money(out, tender.label(), tender.amount(), columns, receipt.currency());
            if (present(tender.reference())) out.add("  Ref: " + tender.reference());
        }
        money(out, "Change", receipt.change(), columns, receipt.currency());
        out.add(rule(columns));

        if (present(receipt.footer())) {
            for (String line : wrap(receipt.footer(), columns)) centre(out, line, columns);
        }
        centre(out, "Thank you.", columns);
        out.add(rule(columns));

        return List.copyOf(out);
    }

    /**
     * One item.
     *
     * <p>80mm puts the name and money on one line. 58mm gives the name its own
     * line — truncating a product name to fit 32 characters beside a figure
     * produces a receipt a customer cannot check against what is in the bag.
     */
    private static List<String> renderItem(Item item, ReceiptWidth width, String currency) {
        List<String> out = new ArrayList<>();
        int columns = width.columns();
        String detail = "  %s %s @ %s".formatted(
                trimZeros(item.quantity()), item.unit(), amount(item.unitPrice(), currency));

        if (width.fitsTwoColumns()) {
            out.add(item.name().length() > columns ? item.name().substring(0, columns) : item.name());
            out.add(pad(detail, amount(item.lineTotal(), currency), columns));
        } else {
            for (String line : wrap(item.name(), columns)) out.add(line);
            out.add(pad(detail, amount(item.lineTotal(), currency), columns));
        }
        return out;
    }

    // --- primitives --------------------------------------------------------

    private static String rule(int columns) {
        return "-".repeat(columns);
    }

    private static void centre(List<String> out, String text, int columns) {
        if (!present(text)) return;
        for (String line : wrap(text, columns)) {
            int padding = Math.max(0, (columns - line.length()) / 2);
            out.add(" ".repeat(padding) + line);
        }
    }

    private static void labelled(List<String> out, String label, String value, int columns) {
        // "Receipt : INC-01-004312" — the colon column is fixed so the block
        // reads as a table rather than as ragged text.
        String left = "%-8s: ".formatted(label);
        int room = Math.max(0, columns - left.length());
        String shown = value == null ? "" : value;
        out.add(left + (shown.length() > room ? shown.substring(0, room) : shown));
    }

    private static void money(List<String> out, String label, BigDecimal value, int columns,
                              String currency) {
        out.add(pad(label, amount(value, currency), columns));
    }

    /** Left text, right text, flush to the last column. */
    private static String pad(String left, String right, int columns) {
        int room = columns - right.length();
        if (room <= 0) return right;
        String clipped = left.length() > room - 1 ? left.substring(0, Math.max(0, room - 1)) : left;
        return clipped + " ".repeat(Math.max(1, room - clipped.length())) + right;
    }

    /**
     * BR-11: two decimals, always. A receipt never shows 650 for 650.00.
     *
     * <p>Prefixed with the currency where there is one, so no amount on a printed
     * slip is a bare number.
     */
    private static String amount(BigDecimal value, String currency) {
        String figure = value.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
        return present(currency) ? currency + " " + figure : figure;
    }

    /** Quantities read as a shop says them: 12, not 12.000. */
    private static String trimZeros(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static List<String> wrap(String text, int columns) {
        List<String> lines = new ArrayList<>();
        if (!present(text)) return lines;

        StringBuilder line = new StringBuilder();
        for (String word : text.trim().split("\\s+")) {
            if (line.isEmpty()) {
                line.append(word);
            } else if (line.length() + 1 + word.length() <= columns) {
                line.append(' ').append(word);
            } else {
                lines.add(line.toString());
                line = new StringBuilder(word);
            }
            // A single word longer than the roll is broken rather than dropped.
            while (line.length() > columns) {
                lines.add(line.substring(0, columns));
                line = new StringBuilder(line.substring(columns));
            }
        }
        if (!line.isEmpty()) lines.add(line.toString());
        return lines;
    }

    private static boolean present(String value) {
        return value != null && !value.isBlank();
    }

    private static boolean isNonZero(BigDecimal value) {
        return value != null && value.signum() != 0;
    }
}
