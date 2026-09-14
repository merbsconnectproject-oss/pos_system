package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.ProductRequest;
import gh.giftedlabs.pos.dto.ProductView;
import gh.giftedlabs.pos.dto.ProductImportRequest;
import gh.giftedlabs.pos.dto.ProductImportView;
import gh.giftedlabs.pos.dto.CostHistoryView;
import gh.giftedlabs.pos.security.PosPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** The catalogue — FR-PROD, FR-UOM. */
public interface ProductService {

    /** FR-PROD-06: name, SKU, barcode, brand and category; partial, out-of-order terms. */
    Slice<ProductView> search(String query, boolean activeOnly, Pageable pageable);

    ProductView get(UUID id);

    /** FR-PROD-03/04: one code resolves to one product, never two. */
    Optional<ProductView> findByBarcode(String code);

    ProductView create(ProductRequest request, PosPrincipal actor, String clientIp);

    ProductView update(UUID id, ProductRequest request, PosPrincipal actor, String clientIp);

    ProductImportView importProducts(ProductImportRequest request, PosPrincipal actor, String clientIp);

    List<CostHistoryView> costHistory(UUID productId);

    /** FR-PROD-08 · BR-17: deactivation, never deletion. */
    ProductView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp);

    List<String> categoryNames();

    List<String> brandNames();
}
