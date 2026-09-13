package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.OutletRequest;
import gh.giftedlabs.pos.dto.OutletView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.UUID;

/** Branches — FR-OUT. */
public interface OutletService {

    /**
     * The outlets this caller may see — FR-OUT-05.
     *
     * <p>Scoped by assignment unless the caller holds {@code outlet.view_all}.
     * The scoping lives here rather than in the controller because every later
     * feature reads outlets the same way, and FR-OUT's acceptance is that no
     * Outlet B record reaches someone working in Outlet A.
     */
    List<OutletView> visibleTo(PosPrincipal caller, boolean mayViewAll, boolean includeInactive);

    OutletView get(UUID id, PosPrincipal caller, boolean mayViewAll);

    OutletView create(OutletRequest request, PosPrincipal actor, String clientIp);

    OutletView update(UUID id, OutletRequest request, PosPrincipal actor, String clientIp);

    /** BR-17: deactivation, never deletion — receipts and movements reference this row. */
    OutletView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp);
}
