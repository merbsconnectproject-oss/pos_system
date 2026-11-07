package gh.giftedlabs.pos.rules;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.util.List;

/**
 * ESC/POS encoding — FR-RCPT-02.
 *
 * <p>The layer between {@link ReceiptLayout}'s lines and the bytes a thermal
 * printer understands. Everything that decides <em>what</em> a receipt says
 * lives in the layout, where it can be asserted without hardware; this decides
 * only how each line is struck onto the paper — centred, bold, doubled, as a
 * bitmap or as bars.
 *
 * <p>Code page 437 rather than UTF-8. Thermal printers do not speak UTF-8, and a
 * cedi sign or a curly quote sent as multi-byte UTF-8 prints as two pieces of
 * garbage — which is why the layout writes plain amounts and the currency code
 * goes against the figures.
 */
public final class EscPos {

    private static final byte ESC = 0x1B;
    private static final byte GS = 0x1D;

    /** ESC a n — 0 left, 1 centre. */
    private static final byte[] LEFT = {ESC, 'a', 0};
    private static final byte[] CENTRE = {ESC, 'a', 1};
    /** ESC E n — emphasis. */
    private static final byte[] BOLD_ON = {ESC, 'E', 1};
    private static final byte[] BOLD_OFF = {ESC, 'E', 0};
    /** GS ! n — the high nibble is width, the low nibble height, 0 being ×1. */
    private static final byte[] SIZE_NORMAL = {GS, '!', 0x00};
    private static final byte[] SIZE_TALL = {GS, '!', 0x01};
    private static final byte[] SIZE_DOUBLE = {GS, '!', 0x11};
    /** GS B n — white on black. */
    private static final byte[] INVERT_ON = {GS, 'B', 1};
    private static final byte[] INVERT_OFF = {GS, 'B', 0};

    /** The printer's default single-byte page. */
    private static final Charset PRINTER_CHARSET = resolveCharset();

    private EscPos() {
    }

    /**
     * Wraps styled lines into a complete job: initialise, print, feed, cut.
     *
     * <p>The cut is the reason the feed is there. Cutting immediately severs the
     * paper inside the mechanism and the last lines stay in the printer, so the
     * roll is advanced past the blade first.
     */
    public static byte[] job(List<ReceiptLayout.Line> lines) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        out.writeBytes(new byte[] {ESC, '@'});            // initialise
        out.writeBytes(new byte[] {ESC, 't', 0});         // code page 437

        for (ReceiptLayout.Line line : lines) write(out, line);

        out.writeBytes(LEFT);
        out.writeBytes(new byte[] {ESC, 'd', 4});         // feed past the blade
        out.writeBytes(new byte[] {GS, 'V', 66, 0});      // partial cut

        return out.toByteArray();
    }

    /** The job as base64, which is how it travels to the local print service. */
    public static String encoded(List<ReceiptLayout.Line> lines) {
        return java.util.Base64.getEncoder().encodeToString(job(lines));
    }

    // --- one line ----------------------------------------------------------

    private static void write(ByteArrayOutputStream out, ReceiptLayout.Line line) {
        switch (line.style()) {
            case LOGO -> logo(out, (ReceiptLayout.Logo) line.data());
            case BARCODE -> barcode(out, String.valueOf(line.data()));
            case COMPANY -> decorated(out, line.text(), CENTRE, SIZE_DOUBLE, true, false);
            case OUTLET -> decorated(out, line.text(), CENTRE, SIZE_NORMAL, true, false);
            case BANNER -> decorated(out, line.text(), CENTRE, SIZE_NORMAL, true, true);
            case CENTRED -> decorated(out, line.text(), CENTRE, SIZE_NORMAL, false, false);
            case HEADING -> decorated(out, line.text(), LEFT, SIZE_NORMAL, true, false);
            case TOTAL -> decorated(out, line.text(), LEFT, SIZE_TALL, true, false);
            default -> decorated(out, line.text(), LEFT, SIZE_NORMAL, false, false);
        }
    }

    /**
     * One line, struck with whatever it asked for and reset afterwards.
     *
     * <p>Every attribute is turned off again on the same line. A printer keeps
     * what it was last told, so one line that forgets to reset its emphasis
     * emboldens the whole rest of the receipt.
     */
    private static void decorated(ByteArrayOutputStream out, String text, byte[] alignment,
                                  byte[] size, boolean bold, boolean invert) {
        out.writeBytes(alignment);
        out.writeBytes(size);
        if (bold) out.writeBytes(BOLD_ON);
        if (invert) out.writeBytes(INVERT_ON);

        // Centred and doubled text is positioned by the printer, so the layout's
        // own padding would offset it twice. Only the left-aligned grid keeps it.
        out.writeBytes((alignment == LEFT ? text : text.strip()).getBytes(PRINTER_CHARSET));

        if (invert) out.writeBytes(INVERT_OFF);
        if (bold) out.writeBytes(BOLD_OFF);
        out.writeBytes(SIZE_NORMAL);
        out.write('\n');
        out.writeBytes(LEFT);
    }

    /**
     * FR-RCPT-01: the receipt number as bars, at the foot of the slip.
     *
     * <p>Code 128 subset B, which covers the whole printable ASCII range — a
     * receipt number is letters, digits and hyphens, and the numeric-only
     * symbologies cannot carry it. Anything outside that range is dropped rather
     * than printed as a barcode that scans back to a different number.
     */
    private static void barcode(ByteArrayOutputStream out, String value) {
        String safe = value == null ? "" : value.replaceAll("[^\\x20-\\x7E]", "");
        if (safe.isBlank() || safe.length() > 80) return;

        out.writeBytes(CENTRE);
        out.writeBytes(new byte[] {GS, 'h', 64});         // 64 dots tall
        out.writeBytes(new byte[] {GS, 'w', 2});          // narrow bar, 2 dots
        out.writeBytes(new byte[] {GS, 'H', 2});          // the number, underneath
        out.writeBytes(new byte[] {GS, 'f', 0});

        // GS k m n d1..dn, m = 73 (CODE128). The data opens with the subset
        // selector "{B"; a printer given no subset guesses, and guesses wrong on
        // anything mixed.
        byte[] data = ("{B" + safe).getBytes(PRINTER_CHARSET);
        out.writeBytes(new byte[] {GS, 'k', 73, (byte) data.length});
        out.writeBytes(data);
        out.write('\n');
        out.writeBytes(LEFT);
    }

    /**
     * The shop's mark, as dots.
     *
     * <p>{@code GS v 0} — raster bit image, which every modern ESC/POS printer
     * understands and which does not depend on a logo having been flashed into
     * the printer's own memory by whoever installed it.
     */
    private static void logo(ByteArrayOutputStream out, ReceiptLayout.Logo logo) {
        if (logo == null || logo.widthDots() <= 0 || logo.heightDots() <= 0) return;

        int bytesPerRow = (logo.widthDots() + 7) / 8;
        if (logo.bitmap().length < bytesPerRow * logo.heightDots()) return;

        out.writeBytes(CENTRE);
        out.writeBytes(new byte[] {
                GS, 'v', '0', 0,
                (byte) (bytesPerRow & 0xFF), (byte) (bytesPerRow >> 8),
                (byte) (logo.heightDots() & 0xFF), (byte) (logo.heightDots() >> 8)});
        out.write(logo.bitmap(), 0, bytesPerRow * logo.heightDots());
        out.write('\n');
        out.writeBytes(LEFT);
    }

    /**
     * CP437 if the JVM has it, ASCII if not.
     *
     * <p>Never UTF-8: a multi-byte character sent to a thermal printer prints as
     * separate garbage glyphs rather than failing, which is the kind of bug that
     * is only found on a customer's receipt.
     */
    private static Charset resolveCharset() {
        for (String name : new String[] {"IBM437", "Cp437", "US-ASCII"}) {
            if (Charset.isSupported(name)) return Charset.forName(name);
        }
        return java.nio.charset.StandardCharsets.US_ASCII;
    }
}
