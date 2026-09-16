package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.ExpenseRequest;
import gh.giftedlabs.pos.dto.ExpenseView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.time.LocalDate;
import java.util.UUID;

/** Operating expenses — the accounting module's ledger. */
public interface ExpenseService {

    /**
     * The period's expenses and its totals.
     *
     * <p>Totals come back with the list because they are computed over the whole
     * period, not over the rows returned. A screen that summed the page would be
     * the bug this module was built to replace.
     */
    ExpenseView.Page list(LocalDate from, LocalDate to, UUID outletId, int limit);

    ExpenseView record(ExpenseRequest request, PosPrincipal actor, String clientIp);

    ExpenseView update(UUID id, ExpenseRequest request, PosPrincipal actor, String clientIp);

    /** Keeps the row — a filed P&L has to keep reproducing. */
    void voidExpense(UUID id, String reason, PosPrincipal actor, String clientIp);
}
