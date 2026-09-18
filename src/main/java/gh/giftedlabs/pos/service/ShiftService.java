package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.ShiftView;
import gh.giftedlabs.pos.rules.CashMovementType;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;

/** Shifts and the cash drawer — FR-CASH, BR-13, BR-14. */
public interface ShiftService {

    /** FR-CASH-01 · BR-13. */
    ShiftView open(UUID terminalId, long openingFloat, PosPrincipal actor, String clientIp);

    /**
     * FR-CASH-04/05/06 · BR-14: close on a blind count.
     *
     * @param countedCash      what the cashier counted, submitted before seeing
     *                         what was expected
     * @param varianceThreshold above which FR-CASH-06 demands a written note.
     *                         Passed in because it is a setting, and settings
     *                         are P — the rule lives here, the number does not
     */
    ShiftView close(UUID shiftId, long countedCash, String note, long varianceThreshold,
                    PosPrincipal actor, String clientIp);

    /** Close still-open shifts that crossed the configured business-day boundary. */
    int autoCloseDue(Instant cutoff);

    /** FR-CASH-03. */
    ShiftView recordCash(UUID shiftId, CashMovementType type, long amount, String reason,
                         String note, PosPrincipal actor, String clientIp);

    /** FR-POS-02: the shift a sale should be recorded against. */
    Optional<UUID> openShiftFor(UUID cashierId);

    Optional<ShiftView> current(UUID cashierId);

    ShiftView get(UUID shiftId);

    List<ShiftView> recent(UUID outletId, UUID cashierId, int limit);
}
