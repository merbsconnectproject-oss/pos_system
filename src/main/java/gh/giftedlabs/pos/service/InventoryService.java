package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.MovementRequest;
import gh.giftedlabs.pos.dto.StockView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Stock — BR-1, BR-2, BR-4, FR-INV. */
public interface InventoryService {

    /**
     * Write a movement and move the level, in one transaction.
     *
     * @param mayOversell BR-9: whether the caller holds {@code stock.oversell}.
     *                    Passed in rather than read here, so the authorisation
     *                    decision stays at the edge where the principal lives.
     */
    StockView record(MovementRequest request, PosPrincipal actor, boolean mayOversell, String clientIp);

    StockView at(UUID productId, UUID outletId);

    /** FR-INV-01: per outlet, never summed into a global figure. */
    List<StockView> acrossOutlets(UUID productId);

    List<StockView> atOutlet(UUID outletId);

    /** FR-INV-08. */
    List<StockView> lowAt(UUID outletId);

    StockView setReorderLevel(UUID productId, UUID outletId, BigDecimal reorderLevel,
                              PosPrincipal actor, String clientIp);

    /** BR-2 · NFR-17: recorded level minus the sum of movements. Zero, or a bug. */
    BigDecimal drift(UUID productId, UUID outletId);
}
