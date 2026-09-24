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
 *
 * <p>The layout emits {@link Line}s rather than bare strings. A thermal printer
 * can centre, embolden, double a line's height, print a bitmap and print a
 * barcode, and a receipt that uses none of that is a wall of identical
 * characters — the shop's name reads no louder than a tender reference. The
 * style is carried here, beside the text it applies to, so the preview and the
 * roll are laid out by one piece of code; {@link EscPos} only turns the styles
 * into control codes.
 */
public final class ReceiptLayout {

    private ReceiptLayout() {
    }

    /** How a line is printed. The text is unpadded; the style owns the alignment. */
    public enum Style {
        /** Already padded to the full width by the layout. Printed as it is. */
        PLAIN,
        /** Centred on the roll. */
        CENTRED,
        /** The business name: centred, bold, double width and height. */
        COMPANY,
        /** The branch and what it is: centred and bold. */
        OUTLET,
        /** A band that must not be missed — REPRINT, VOIDED. Centred, inverted. */
        BANNER,
        /** A column header. Padded, bold. */
        HEADING,
        /** The amount due. Padded, bold, double height. */
        TOTAL,
        /** The shop's logo. Carries no text. */
        LOGO,
        /** A Code 128 barcode of the receipt number, with the number under it. */
        BARCODE
    }

    /**
     * One printed line.
     *
     * @param text  what a reader sees. For {@link Style#BARCODE} this is the
     *              human-readable number printed beneath the bars, so a preview
     *              that cannot draw bars still shows the number; for
     *              {@link Style#LOGO} it is empty
     * @param data  the payload a style needs beyond its text — the barcode's
     *              value, or the logo's bitmap. Null everywhere else
     */
    public record Line(String text, Style style, Object data) {

        static Line of(String text, Style style) {
            return new Line(text, style, null);
        }
    }

    /** One item, already priced. Amounts in major units, formatted to 2dp. */
    public record Item(String name, BigDecimal quantity, String unit, BigDecimal unitPrice,
                       BigDecimal lineTotal) {
    }

    /** One tender line, with an optional reference for mobile money. */
    public record Tender(String label, BigDecimal amount, String reference) {
    }

    /**
     * A logo, already reduced to the dots a thermal head can fire.
     *
     * @param widthDots  the bitmap's width; a row is {@code (widthDots + 7) / 8} bytes
     * @param heightDots the bitmap's height
     * @param bitmap     row-major, one bit per dot, high bit leftmost, 1 = fire
     */
    public record Logo(int widthDots, int heightDots, byte[] bitmap) {
    }

    /**
     * Whose shop this is — the block at the top of every slip.
     *
     * <p>Five things, in the order somebody reads them: the mark, the business,
     * the branch that sold the goods, where it is and how to ring it. A receipt
     * that opens with a receipt number is one a customer cannot place.
     *
     * @param companyName the business, which owns the branches. Omitted when it
     *                    is the same name as the branch — printing "INCO
     *                    HARDWARE" twice tells nobody anything
     * @param outletName  the branch, and the branch's own trading name where it
     *                    has one — FR-SET-02
     * @param addressLine where it is
     * @param phoneLine   how to reach it, already prefixed with "Tel:"
     * @param taxLine     the VAT / TIN registration, where the business has one
     * @param logo        the mark, printed above the name. Null where none is set
     */
    public record Branding(String companyName, String outletName, String addressLine,
                           String phoneLine, String taxLine, Logo logo) {
    }

    /**
     * Everything printed on one receipt.
     *
     * @param reprint FR-RCPT-06: adds the band under the header. Never silently —
     *                a reprint that looked like an original would be a second
     *                receipt for one sale
     */
    public record Receipt(
            Branding branding,
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
            /** Which till rang it — the counter a query is taken back to. */
            String terminal,
            String customer,
            /**
             * BR-3: why this sale was reversed, when it was.
             *
             * <p>A voided sale still has a slip — the one already handed over,
             * and the one a manager reprints to account for it. Printing it
             * unmarked would leave two identical receipts for a sale that did
             * not happen. Null on a live sale.
             */
            String voidNotice,
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

    /**
     * Renders the whole receipt as plain lines of text at the given width.
     *
     * <p>What a preview shows and what the tests assert. The logo has no text to
     * show and is dropped; everything else, including the number under the
     * barcode, is here.
     */
    public static List<String> render(Receipt receipt, ReceiptWidth width) {
        List<String> out = new ArrayList<>();
        for (Line line : renderStyled(receipt, width)) {
            if (line.style() == Style.LOGO) continue;
            out.add(laid(line, width.columns()));
        }
        return List.copyOf(out);
    }

    /** The same receipt with its styles intact — what the printer is given. */
    public static List<Line> renderStyled(Receipt receipt, ReceiptWidth width) {
        int columns = width.columns();
        List<Line> out = new ArrayList<>();

        header(out, receipt, columns);
        details(out, receipt, columns);
        items(out, receipt, width);
        totals(out, receipt, columns);
        tenders(out, receipt, columns);
        footer(out, receipt, columns);

        return List.copyOf(out);
    }

    // --- blocks ------------------------------------------------------------

    /**
     * The mark, the business, the branch, where it is and its number — in that
     * order, before anything about the transaction.
     */
    private static void header(List<Line> out, Receipt receipt, int columns) {
        Branding branding = receipt.branding();
        if (branding == null) return;

        if (branding.logo() != null) {
            out.add(new Line("", Style.LOGO, branding.logo()));
        }
        // Double width halves the grid, so the name is wrapped against half the
        // roll. Wrapping it at the full width would print it off the paper.
        if (present(branding.companyName())) {
            // Printed as the shop wrote it. Upper-casing somebody's trading name
            // decides for them how their own name is spelt, and the double width
            // already gives the line the weight the capitals were there for.
            for (String line : wrap(branding.companyName(), Math.max(1, columns / 2))) {
                out.add(Line.of(line, Style.COMPANY));
            }
        }
        if (present(branding.outletName())) {
            for (String line : wrap(branding.outletName(), columns)) {
                out.add(Line.of(line, Style.OUTLET));
            }
        }
        centre(out, branding.addressLine(), columns);
        centre(out, branding.phoneLine(), columns);
        centre(out, branding.taxLine(), columns);
        out.add(heavyRule(columns));

        // What the document is, before what is on it. A credit note that looked
        // like a receipt is one a customer could present twice.
        if (present(receipt.documentTitle())) {
            out.add(Line.of(receipt.documentTitle().toUpperCase(java.util.Locale.ROOT),
                    Style.BANNER));
        }
        // FR-RCPT-06: immediately below the header, where it cannot be missed.
        if (receipt.reprint()) {
            out.add(Line.of("*** REPRINT ***", Style.BANNER));
        }
        // BR-3, and above the figures rather than below them. A reversal
        // disclosed under the total is one somebody has already stopped reading.
        if (present(receipt.voidNotice())) {
            out.add(Line.of("*** VOIDED ***", Style.BANNER));
            centre(out, receipt.voidNotice(), columns);
        }
        if (present(receipt.documentTitle()) || receipt.reprint()
                || present(receipt.voidNotice())) {
            out.add(rule(columns));
        }
    }

    private static void details(List<Line> out, Receipt receipt, int columns) {
        labelled(out, "Receipt", receipt.receiptNumber(), columns);
        labelled(out, "Date", receipt.dateTime(), columns);
        labelled(out, "Cashier", receipt.cashier(), columns);
        if (present(receipt.terminal())) labelled(out, "Till", receipt.terminal(), columns);
        if (present(receipt.customer())) labelled(out, "Customer", receipt.customer(), columns);
        out.add(rule(columns));
    }

    private static void items(List<Line> out, Receipt receipt, ReceiptWidth width) {
        int columns = width.columns();
        out.add(new Line(pad("ITEM", "AMOUNT", columns), Style.HEADING, null));
        out.add(rule(columns));
        for (Item item : receipt.items()) {
            out.addAll(renderItem(item, width, receipt.currency()));
        }
        out.add(rule(columns));
    }

    private static void totals(List<Line> out, Receipt receipt, int columns) {
        money(out, "Subtotal", receipt.subtotal(), columns, receipt.currency());
        if (isNonZero(receipt.discount())) {
            // Shown as a negative, because that is what it did to the total.
            money(out, "Discount", receipt.discount().negate(), columns, receipt.currency());
        }
        if (isNonZero(receipt.tax())) money(out, "Tax", receipt.tax(), columns, receipt.currency());

        // The one figure a customer checks. It gets the heavy rules and the
        // double height, because everything reading the same size is how a total
        // gets lost among the tenders below it.
        out.add(heavyRule(columns));
        out.add(new Line(pad("TOTAL", amount(receipt.total(), receipt.currency()), columns),
                Style.TOTAL, null));
        out.add(heavyRule(columns));
    }

    private static void tenders(List<Line> out, Receipt receipt, int columns) {
        for (Tender tender : receipt.tenders()) {
            money(out, tender.label(), tender.amount(), columns, receipt.currency());
            if (present(tender.reference())) out.add(Line.of("  Ref: " + tender.reference(), Style.PLAIN));
        }
        money(out, "Change due", receipt.change(), columns, receipt.currency());
        out.add(rule(columns));
    }

    /**
     * The policy, the thanks, and the number as bars.
     *
     * <p>The barcode is last because that is where a hand scanner looks for it,
     * and because a slip a customer brings back is found by scanning it rather
     * than by typing fourteen characters off the top of the page.
     */
    private static void footer(List<Line> out, Receipt receipt, int columns) {
        if (present(receipt.footer())) {
            for (String line : wrap(receipt.footer(), columns)) centre(out, line, columns);
        }
        centre(out, "Thank you.", columns);
        out.add(rule(columns));
        if (present(receipt.receiptNumber())) {
            out.add(new Line("* %s *".formatted(receipt.receiptNumber()), Style.BARCODE,
                    receipt.receiptNumber()));
        }
    }

    /**
     * One item.
     *
     * <p>80mm puts the name and money on one line. 58mm gives the name its own
     * line — truncating a product name to fit 32 characters beside a figure
     * produces a receipt a customer cannot check against what is in the bag.
     */
    private static List<Line> renderItem(Item item, ReceiptWidth width, String currency) {
        List<Line> out = new ArrayList<>();
        int columns = width.columns();
        String detail = "  %s %s @ %s".formatted(
                trimZeros(item.quantity()), item.unit(), amount(item.unitPrice(), currency));

        if (width.fitsTwoColumns()) {
            out.add(Line.of(item.name().length() > columns
                    ? item.name().substring(0, columns) : item.name(), Style.PLAIN));
            out.add(Line.of(pad(detail, amount(item.lineTotal(), currency), columns), Style.PLAIN));
        } else {
            for (String line : wrap(item.name(), columns)) out.add(Line.of(line, Style.PLAIN));
            out.add(Line.of(pad(detail, amount(item.lineTotal(), currency), columns), Style.PLAIN));
        }
        return out;
    }

    // --- primitives --------------------------------------------------------

    /** Lays a styled line onto the character grid, for the text rendering. */
    private static String laid(Line line, int columns) {
        return switch (line.style()) {
            // Double width, so it covers two columns per character. Centred
            // against what it will actually occupy — a preview that centred it
            // by character count would put it left of where it prints.
            case COMPANY ->
                    " ".repeat(Math.max(0, (columns - line.text().length() * 2) / 2)) + line.text();
            case CENTRED, OUTLET, BANNER, BARCODE ->
                    " ".repeat(Math.max(0, (columns - line.text().length()) / 2)) + line.text();
            default -> line.text();
        };
    }

    private static Line rule(int columns) {
        return Line.of("-".repeat(columns), Style.PLAIN);
    }

    /** The heavier rule, around the header block and the total. */
    private static Line heavyRule(int columns) {
        return Line.of("=".repeat(columns), Style.PLAIN);
    }

    private static void centre(List<Line> out, String text, int columns) {
        if (!present(text)) return;
        for (String line : wrap(text, columns)) out.add(Line.of(line, Style.CENTRED));
    }

    private static void labelled(List<Line> out, String label, String value, int columns) {
        // "Receipt : INC-01-004312" — the colon column is fixed so the block
        // reads as a table rather than as ragged text.
        String left = "%-8s: ".formatted(label);
        int room = Math.max(0, columns - left.length());
        String shown = value == null ? "" : value;
        out.add(Line.of(left + (shown.length() > room ? shown.substring(0, room) : shown), Style.PLAIN));
    }

    private static void money(List<Line> out, String label, BigDecimal value, int columns,
                              String currency) {
        out.add(Line.of(pad(label, amount(value, currency), columns), Style.PLAIN));
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
