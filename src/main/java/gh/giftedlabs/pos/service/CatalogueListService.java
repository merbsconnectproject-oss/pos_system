package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.CatalogueListItem;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.impl.CatalogueListServiceImpl.Kind;

import java.util.List;
import java.util.UUID;

/** Catalogue setup — the categories, brands and units products are built from. */
public interface CatalogueListService {

    List<CatalogueListItem> list(Kind kind, boolean includeInactive);

    CatalogueListItem add(Kind kind, String name, PosPrincipal actor, String clientIp);

    CatalogueListItem rename(Kind kind, UUID id, String name, PosPrincipal actor, String clientIp);

    /** BR-17: retired, not deleted. */
    CatalogueListItem setActive(Kind kind, UUID id, boolean active, PosPrincipal actor, String clientIp);
}
