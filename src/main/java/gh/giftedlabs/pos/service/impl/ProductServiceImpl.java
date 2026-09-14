package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.*;
import gh.giftedlabs.pos.entity.*;
import gh.giftedlabs.pos.exception.CatalogueConflictException;
import gh.giftedlabs.pos.exception.ProductNotFoundException;
import gh.giftedlabs.pos.repository.*;
import gh.giftedlabs.pos.rules.Sku;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.ProductService;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.*;

/**
 * The catalogue — FR-PROD, FR-UOM.
 *
 * <p>Uniqueness is checked here and enforced by the database. Both, deliberately:
 * the check produces a message a shopkeeper can act on, and the constraint is
 * what actually holds when two terminals save at the same moment.
 */
@Service
public class ProductServiceImpl implements ProductService {

    private final ProductRepository products;
    private final CategoryRepository categories;
    private final BrandRepository brands;
    private final ProductPriceHistoryRepository priceHistory;
    private final OutletRepository outlets;
    private final SupplierRepository suppliers;
    private final InventoryMovementRepository movements;
    private final UserRepository users;
    private final AuditService audit;
    private final Clock clock;
    private final EntityManager entityManager;
    private final JdbcTemplate jdbc;

    public ProductServiceImpl(ProductRepository products, CategoryRepository categories, BrandRepository brands,
                              ProductPriceHistoryRepository priceHistory, OutletRepository outlets,
                              SupplierRepository suppliers, InventoryMovementRepository movements,
                              UserRepository users, AuditService audit, Clock clock,
                              EntityManager entityManager, JdbcTemplate jdbc) {
        this.products = products;
        this.categories = categories;
        this.brands = brands;
        this.priceHistory = priceHistory;
        this.outlets = outlets;
        this.suppliers = suppliers;
        this.movements = movements;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
        this.entityManager = entityManager;
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(readOnly = true)
    public Slice<ProductView> search(String query, boolean activeOnly, Pageable pageable) {
        if (query == null || query.isBlank()) {
            Page<Product> page = activeOnly
                    ? products.findAllByActiveTrueOrderByNameAsc(pageable)
                    : products.findAllByOrderByNameAsc(pageable);
            return page.map(ProductView::of);
        }

        return products.searchAllTerms(query.trim(), activeOnly, pageable).map(ProductView::of);
    }

    @Override
    @Transactional(readOnly = true)
    public ProductView get(UUID id) {
        return ProductView.of(products.findById(id).orElseThrow(() -> new ProductNotFoundException(id)));
    }

    /** FR-PROD-03/04: what the counter does with a scan. */
    @Override
    @Transactional(readOnly = true)
    public Optional<ProductView> findByBarcode(String code) {
        return products.findByBarcode(code).map(ProductView::of);
    }

    @Override
    @Transactional
    public ProductView create(ProductRequest request, PosPrincipal actor, String clientIp) {
        Category category = categoryNamed(request.category());
        String sku = request.sku() == null || request.sku().isBlank()
                ? generateSku(actor, category)
                : request.sku().trim().toUpperCase();

        if (products.skuTaken(sku, null)) {
            throw CatalogueConflictException.sku(sku, products.findBySku(sku).map(Product::getName).orElse("another product"));
        }

        Product product = new Product(sku, request.name().trim(), request.baseUnit().trim());
        product.setCategory(category);
        product.setBrand(brandNamed(request.brand()));
        product.setSupplierId(validSupplier(request.supplierId()));
        apply(request, product);

        Product saved = products.save(product);
        recordPrices(saved, actor);
        audit.record(actor.userId(), "PRODUCT_CREATED", "product", saved.getId(),
                null, snapshot(saved), actor.outletId(), null, clientIp);
        return ProductView.of(saved);
    }

    @Override
    @Transactional
    public ProductView update(UUID id, ProductRequest request, PosPrincipal actor, String clientIp) {
        Product product = products.findById(id).orElseThrow(() -> new ProductNotFoundException(id));
        Map<String, Object> before = snapshot(product);
        BigDecimal previousRetail = product.getRetailPrice();
        BigDecimal previousTrade = product.getTradePrice();
        BigDecimal previousFloor = product.getFloorPrice();

        String sku = request.sku() == null || request.sku().isBlank()
                ? product.getSku()
                : request.sku().trim().toUpperCase();
        if (products.skuTaken(sku, id)) {
            throw CatalogueConflictException.sku(sku, products.findBySku(sku).map(Product::getName).orElse("another product"));
        }

        product.setSku(sku);
        product.setName(request.name().trim());
        product.setCategory(categoryNamed(request.category()));
        product.setBrand(brandNamed(request.brand()));
        product.setSupplierId(validSupplier(request.supplierId()));
        apply(request, product);

        // FR-PROD-09: a row only when something actually moved, so the history
        // reads as a list of changes rather than a list of saves.
        if (previousRetail.compareTo(product.getRetailPrice()) != 0
                || previousTrade.compareTo(product.getTradePrice()) != 0
                || previousFloor.compareTo(product.getFloorPrice()) != 0) {
            recordPrices(product, actor);
        }

        audit.record(actor.userId(), "PRODUCT_UPDATED", "product", id,
                before, snapshot(product), actor.outletId(), null, clientIp);
        return ProductView.of(product);
    }

    /** FR-PROD-10: the preview happens in the browser; this is one atomic, authoritative commit. */
    @Override
    @Transactional
    public ProductImportView importProducts(ProductImportRequest request, PosPrincipal actor, String clientIp) {
        Set<String> submittedSkus = new HashSet<>();
        List<ProductView> saved = new ArrayList<>();
        int created = 0;
        int updated = 0;
        for (ProductRequest row : request.products()) {
            String sku = blankToNull(row.sku());
            if (sku != null && !submittedSkus.add(sku.toUpperCase(Locale.ROOT))) {
                throw new IllegalArgumentException("Duplicate SKU within import: " + sku);
            }
            Optional<Product> existing = sku == null ? Optional.empty() : products.findBySku(sku);
            if (existing.isPresent()) {
                saved.add(update(existing.get().getId(), row, actor, clientIp));
                updated++;
            } else {
                saved.add(create(row, actor, clientIp));
                created++;
            }
        }
        return new ProductImportView(created, updated, saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<CostHistoryView> costHistory(UUID productId) {
        if (!products.existsById(productId)) throw new ProductNotFoundException(productId);
        return movements.costHistory(productId, List.of(gh.giftedlabs.pos.rules.MovementType.OPENING,
                        gh.giftedlabs.pos.rules.MovementType.RECEIPT)).stream()
                .map(row -> new CostHistoryView(row.getId(), row.getUnitCost(), row.getType().name(),
                        row.getOutletId(), outlets.findById(row.getOutletId()).map(Outlet::getName).orElse(null),
                        row.getActorId(), row.getActorId() == null ? null
                                : users.findById(row.getActorId()).map(User::getFullName).orElse(null),
                        row.getCreatedAt()))
                .toList();
    }

    /** FR-PROD-08 · BR-17. */
    @Override
    @Transactional
    public ProductView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp) {
        Product product = products.findById(id).orElseThrow(() -> new ProductNotFoundException(id));
        Map<String, Object> before = snapshot(product);

        if (active) product.activate(); else product.deactivate();

        audit.record(actor.userId(), active ? "PRODUCT_REACTIVATED" : "PRODUCT_DEACTIVATED", "product", id,
                before, snapshot(product), actor.outletId(), null, clientIp);
        return ProductView.of(product);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> categoryNames() {
        return categories.findAllByOrderByNameAsc().stream().map(Category::getName).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> brandNames() {
        return brands.findAllByOrderByNameAsc().stream().map(Brand::getName).toList();
    }

    // --- internals ---------------------------------------------------------

    /**
     * Units and barcodes are replaced wholesale rather than diffed.
     *
     * <p>The branch form submits the full list, so a diff would have to infer
     * intent from what is missing — and inferring "delete" from absence is how a
     * dropped field silently removes a barcode.
     */
    private void apply(ProductRequest request, Product product) {
        product.setDescription(blankToNull(request.description()));
        product.setImageUrl(blankToNull(request.imageUrl()));
        product.setPrices(request.retailPrice(), request.tradePrice(), request.floorPrice());

        product.clearSellingUnits();
        product.clearBarcodes();

        // Hibernate batches inserts ahead of deletes, so re-adding a unit or a
        // barcode with the name it already had collides with its own outgoing
        // row — "Metre" already exists, from the copy being replaced. Flushing
        // the removals first is what makes replace-wholesale legal; without it,
        // editing a product without renaming its units fails.
        entityManager.flush();

        List<ProductRequest.SellingUnitRequest> units =
                request.sellingUnits() == null ? List.of() : request.sellingUnits();
        for (int i = 0; i < units.size(); i++) {
            var unit = units.get(i);
            product.addSellingUnit(new ProductSellingUnit(
                    unit.name().trim(), unit.conversionFactor(), unit.price(), unit.tradePrice(), i));
        }

        for (var barcode : request.barcodes() == null ? List.<ProductRequest.BarcodeRequest>of() : request.barcodes()) {
            String code = barcode.code().trim();

            // FR-PROD-03: system-wide, so the clash may be with any product.
            if (products.barcodeTaken(code, product.getId())) {
                throw CatalogueConflictException.barcode(code,
                        products.findByBarcode(code).map(Product::getName).orElse("another product"));
            }
            // FR-PROD-04: the code must name a unit this product actually sells
            // in, or scanning it would add a quantity of nothing.
            if (product.conversionFactorFor(barcode.unitName().trim()).isEmpty()) {
                throw CatalogueConflictException.unknownUnit(code, barcode.unitName().trim());
            }
            product.addBarcode(new ProductBarcode(code, barcode.unitName().trim()));
        }
    }

    /**
     * FR-PROD-02: {@code RAD-LGT-001}, from the branch the user is working in.
     *
     * <p>Counting rows is right for a catalogue set up by hand and wrong for a
     * bulk import running in parallel — two importers would compute the same
     * number. The unique index is what stops that becoming two products, and
     * the import endpoint (FR-PROD-10) should allocate a block the way BR-6
     * does for receipts rather than lean on this.
     */
    private String generateSku(PosPrincipal actor, Category category) {
        String outletCode = Optional.ofNullable(actor.outletId())
                .flatMap(outlets::findById)
                .map(Outlet::getCode)
                .orElse("GEN");

        String prefix = Sku.prefix(outletCode, category == null ? null : category.getName());
        // One transaction-level lock per prefix serialises tills and imports,
        // while unrelated categories continue in parallel.
        jdbc.query("select pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { }, prefix);
        Long catalogueMaximum = jdbc.queryForObject("""
                select coalesce(max(substring(sku from char_length(?) + 1)::bigint), 0)
                  from product
                 where upper(sku) like upper(?) || '%'
                   and substring(sku from char_length(?) + 1) ~ '^[0-9]+$'
                """, Long.class, prefix, prefix, prefix);
        List<Long> allocated = jdbc.query("select next_value from sku_sequence where prefix = ? for update",
                (rs, row) -> rs.getLong(1), prefix);
        long next = Math.max(catalogueMaximum == null ? 0 : catalogueMaximum,
                allocated.isEmpty() ? 0 : allocated.getFirst()) + 1;
        if (allocated.isEmpty()) {
            jdbc.update("insert into sku_sequence (id, prefix, next_value) values (gen_random_uuid(), ?, ?)",
                    prefix, next);
        } else {
            jdbc.update("update sku_sequence set next_value = ?, synced_at = null where prefix = ?", next, prefix);
        }
        return prefix + String.format("%03d", next);
    }

    /** FR-PROD-05: the list grows as products are entered rather than by a separate screen. */
    private Category categoryNamed(String name) {
        if (name == null || name.isBlank()) return null;
        return categories.findByNameIgnoreCase(name.trim())
                .orElseGet(() -> categories.save(new Category(name.trim())));
    }

    private Brand brandNamed(String name) {
        if (name == null || name.isBlank()) return null;
        return brands.findByNameIgnoreCase(name.trim())
                .orElseGet(() -> brands.save(new Brand(name.trim())));
    }

    private UUID validSupplier(UUID supplierId) {
        if (supplierId == null) return null;
        if (!suppliers.existsById(supplierId)) throw new IllegalArgumentException("Supplier does not exist");
        return supplierId;
    }

    private void recordPrices(Product product, PosPrincipal actor) {
        priceHistory.save(new ProductPriceHistory(product.getId(), product.getRetailPrice(),
                product.getTradePrice(), product.getFloorPrice(), actor.userId(), clock.instant()));
    }

    private String blankToNull(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }

    private Map<String, Object> snapshot(Product product) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("sku", product.getSku());
        state.put("name", product.getName());
        state.put("category", product.getCategory() == null ? null : product.getCategory().getName());
        state.put("brand", product.getBrand() == null ? null : product.getBrand().getName());
        state.put("supplierId", product.getSupplierId());
        state.put("baseUnit", product.getBaseUnit());
        state.put("retailPrice", product.getRetailPrice());
        state.put("tradePrice", product.getTradePrice());
        state.put("floorPrice", product.getFloorPrice());
        state.put("active", product.isActive());
        return state;
    }
}
