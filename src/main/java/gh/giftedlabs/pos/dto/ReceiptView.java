package gh.giftedlabs.pos.dto;

import java.util.List;

/**
 * A receipt, ready to print or preview — FR-RCPT-02, FR-RCPT-09.
 *
 * @param lines    the rendered text, one string per printed line. This is what
 *                 the preview shows, and it is exactly what goes to the printer
 *                 — so what a shop sees at both widths (FR-RCPT-09) cannot drift
 *                 from what comes out
 * @param escPos   the same lines as ESC/POS bytes, base64. The local print
 *                 service writes them straight to the device
 * @param width    which roll this was laid out for
 * @param reprint  FR-RCPT-06: whether the REPRINT band is on it
 */
public record ReceiptView(
        String receiptNumber,
        String width,
        int columns,
        boolean reprint,
        List<String> lines,
        String escPos) {

    /** The preview, as one block of text. */
    public String text() {
        return String.join("\n", lines);
    }
}
