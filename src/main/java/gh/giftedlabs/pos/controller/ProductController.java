package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ProductRequest;
import gh.giftedlabs.pos.dto.ProductView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.ProductService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The catalogue — FR-PROD, FR-UOM.
 *
 * <p>Anyone signed in may read it: a cashier cannot sell what they cannot find.
 * Editing needs {@code product.edit}, creating needs {@code product.create},
 * and the server is what enforces both.
 */
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private static final int MAX_PAGE = 200;

    private final ProductService products;

    public ProductController(ProductService products) {
        this.products = products;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public Page<ProductView> search(@RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "true") boolean activeOnly,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size) {
        return products.search(q, activeOnly, PageRequest.of(Math.max(0, page), Math.clamp(size, 1, MAX_PAGE)));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public ProductView get(@PathVariable UUID id) {
        return products.get(id);
    }

    /** FR-PROD-03/04: the counter's scan lookup. */
    @GetMapping("/barcode/{code}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public ResponseEntity<ProductView> byBarcode(@PathVariable String code) {
        return products.findByBarcode(code)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** FR-PROD-05: the lists behind the category and brand pickers. */
    @GetMapping("/lists")
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public Map<String, List<String>> lists() {
        return Map.of("categories", products.categoryNames(), "brands", products.brandNames());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.PRODUCT_CREATE + "')")
    public ProductView create(@Valid @RequestBody ProductRequest body,
                              @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return products.create(body, actor, clientIp(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.PRODUCT_EDIT + "')")
    public ProductView update(@PathVariable UUID id, @Valid @RequestBody ProductRequest body,
                              @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return products.update(id, body, actor, clientIp(request));
    }

    @PostMapping("/{id}/active")
    @PreAuthorize("hasAuthority('" + Permission.Codes.PRODUCT_EDIT + "')")
    public ProductView setActive(@PathVariable UUID id, @RequestParam boolean value,
                                 @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return products.setActive(id, value, actor, clientIp(request));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
