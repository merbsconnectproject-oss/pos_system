package gh.giftedlabs.pos.dto;

import java.util.UUID;

/**
 * One entry in a catalogue list — FR-PROD-05, FR-UOM-01.
 *
 * <p>{@code inUse} is what lets the screen explain itself: a list entry that
 * products point at can be renamed but not meaningfully removed, and telling
 * the user how many products use it beats refusing with no reason.
 */
public record CatalogueListItem(UUID id, String name, boolean active, long inUse) {
}
