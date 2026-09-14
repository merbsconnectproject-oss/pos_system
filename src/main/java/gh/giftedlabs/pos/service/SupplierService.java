package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.SupplierRequest;
import gh.giftedlabs.pos.dto.SupplierView;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.List;
import java.util.UUID;

/** FR-SUP-01. */
public interface SupplierService {

    List<SupplierView> list(boolean includeInactive);

    SupplierView get(UUID id);

    SupplierView create(SupplierRequest request, PosPrincipal actor, String clientIp);

    SupplierView update(UUID id, SupplierRequest request, PosPrincipal actor, String clientIp);

    /** BR-17: retired, not deleted — receipts reference the row. */
    SupplierView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp);
}
