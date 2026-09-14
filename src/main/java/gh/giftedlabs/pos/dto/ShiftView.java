package gh.giftedlabs.pos.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A shift — FR-CASH, BR-14.
 *
 * <p><strong>An open shift tells nobody what it expects.</strong> FR-CASH-04
 * makes the close blind, and expected cash, takings by method and the sale
 * total all give it away — cash takings plus the float <em>is</em> the
 * expectation. They stay null and empty until the count has been submitted,
 * which is the only point at which knowing them cannot influence it.
 *
 * <p>Cash movements are shown throughout: the cashier made them and already
 * knows what they are.
 */
public record ShiftView(
        UUID id,
        UUID outletId,
        UUID terminalId,
        UUID cashierId,
        String cashierName,
        long openingFloat,
        Instant openedAt,
        String status,

        /** Null until closed. */
        Long countedCash,
        Long expectedCash,
        Long variance,
        String varianceNote,
        Instant closedAt,
        String closedBy,

        /** FR-CASH-07/08 — revealed at close, for the same reason. */
        Long saleCount,
        Long saleTotal,
        Map<String, Long> takingsByMethod,

        List<CashLine> cashMovements) {

    public record CashLine(UUID id, String type, long amount, String reason, String note,
                           String actor, Instant at) {
    }
}
