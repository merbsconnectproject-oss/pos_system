package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.MovementView;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Reading the stock ledger — FR-INV-04, FR-INV-10.
 *
 * <p>Separate from {@link InventoryService}, which writes. Nothing that records
 * a movement needs to query history, and keeping the two apart means the write
 * path stays free of reporting concerns.
 */
public interface InventoryQueryService {

    List<MovementView> movements(UUID productId, UUID outletId, String type, UUID actorId,
                                 Instant from, Instant to, boolean exceptionsOnly,
                                 int limit, int offset);
}
