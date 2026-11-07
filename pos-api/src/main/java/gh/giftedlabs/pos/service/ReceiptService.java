package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.ReceiptView;
import gh.giftedlabs.pos.rules.ReceiptWidth;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.UUID;

/**
 * Turning a sale into something printable — FR-RCPT.
 *
 * <p>Rendered server-side, from the sale as recorded. A receipt built in the
 * browser would be a statement about what the till believed rather than what was
 * sold, and a reprint built the same way could differ from the original — which
 * is the one thing a reprint must never do.
 */
public interface ReceiptService {

    /**
     * @param reprint FR-RCPT-06. Marked on the receipt and recorded in the audit
     *                log by the caller, because a second copy of a receipt is a
     *                thing somebody may later need to account for
     */
    ReceiptView render(UUID saleId, ReceiptWidth width, boolean reprint);

    /**
     * The credit note for a return or a swap.
     *
     * <p>Through the same layout as a sale, on purpose. A customer who is handed
     * a receipt on the way in and a differently shaped slip on the way out has
     * two documents from what looks like two businesses — and the second is the
     * one they keep, because it is the one they may need to come back with.
     */
    ReceiptView renderReturn(UUID returnId, ReceiptWidth width, boolean reprint);

    /** FR-RCPT-09: the layout at a given width, without a real sale behind it. */
    ReceiptView preview(ReceiptWidth width, PosPrincipal actor);
}
