package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.HeldSaleRequest;
import gh.giftedlabs.pos.dto.HeldSaleView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.UUID;

public interface HeldSaleService {
    List<HeldSaleView> atOutlet(UUID outletId, PosPrincipal actor);
    HeldSaleView hold(HeldSaleRequest request, PosPrincipal actor, String clientIp);
    void delete(UUID id, PosPrincipal actor, String clientIp);
}
