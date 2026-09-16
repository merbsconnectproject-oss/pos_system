package gh.giftedlabs.pos.rules;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.util.List;

/**
 * ESC/POS encoding — FR-RCPT-02.
 *
 * <p>The thin layer between {@link ReceiptLayout}'s lines of text and the bytes a
 * thermal printer understands. Deliberately small: everything that decides how a
 * receipt <em>looks</em> lives in the layout, where it can be asserted without
 * hardware, and this only wraps it in the control codes.
 *
 * <p>Code page 437 rather than UTF-8. Thermal printers do not speak UTF-8, and a
 * cedi sign or a curly quote sent as multi-byte UTF-8 prints as two pieces of
 * garbage — which is why the layout writes plain amounts and the currency name
 * goes in the header text.
 */
public final class EscPos {

    private static final byte ESC = 0x1B;
    private static final byte GS = 0x1D;

    /** The printer's default single-byte page. */
    private static final Charset PRINTER_CHARSET = resolveCharset();

    private EscPos() {
    }

    /**
     * Wraps rendered lines into a complete job: initialise, print, feed, cut.
     *
     * <p>The cut is the reason the feed is there. Cutting immediately severs the
     * paper inside the mechanism and the last lines stay in the printer, so the
     * roll is advanced past the blade first.
     */
    public static byte[] job(List<String> lines) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        out.writeBytes(new byte[] {ESC, '@'});            // initialise
        out.writeBytes(new byte[] {ESC, 't', 0});         // code page 437

        for (String line : lines) {
            out.writeBytes(line.getBytes(PRINTER_CHARSET));
            out.write('\n');
        }

        out.writeBytes(new byte[] {ESC, 'd', 4});         // feed past the blade
        out.writeBytes(new byte[] {GS, 'V', 66, 0});      // partial cut

        return out.toByteArray();
    }

    /** The job as base64, which is how it travels to the local print service. */
    public static String encoded(List<String> lines) {
        return java.util.Base64.getEncoder().encodeToString(job(lines));
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
