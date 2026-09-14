package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.GoodsReceiptRequest;
import gh.giftedlabs.pos.dto.GoodsReceiptView;
import gh.giftedlabs.pos.dto.MovementRequest;
import gh.giftedlabs.pos.dto.StockView;
import gh.giftedlabs.pos.entity.GoodsReceipt;
import gh.giftedlabs.pos.entity.GoodsReceiptLine;
import gh.giftedlabs.pos.entity.Product;
import gh.giftedlabs.pos.entity.Supplier;
import gh.giftedlabs.pos.exception.ProductNotFoundException;
import gh.giftedlabs.pos.repository.GoodsReceiptRepository;
import gh.giftedlabs.pos.repository.ProductRepository;
import gh.giftedlabs.pos.repository.SupplierRepository;
import gh.giftedlabs.pos.rules.Costing;
import gh.giftedlabs.pos.rules.Money;
import gh.giftedlabs.pos.rules.MovementType;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.GoodsReceiptService;
import gh.giftedlabs.pos.service.InventoryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Booking in a delivery — FR-SUP-02…06, BR-4.
 *
 * <p>This is the only path that moves weighted average cost, and it does so by
 * writing ordinary stock movements through {@link InventoryService} rather than
 * touching levels itself. One place computes BR-4, one place writes the ledger,
 * and a receipt is just the document explaining why.
 */
@Service
public class GoodsReceiptServiceImpl implements GoodsReceiptService {

    private static final String SOURCE = "GRN";

    private final GoodsReceiptRepository receipts;
    private final SupplierRepository suppliers;
    private final ProductRepository products;
    private final InventoryService inventory;
    private final AuditService audit;
    private final Clock clock;

    public GoodsReceiptServiceImpl(GoodsReceiptRepository receipts, SupplierRepository suppliers,
                                   ProductRepository products, InventoryService inventory,
                                   AuditService audit, Clock clock) {
        this.receipts = receipts;
        this.suppliers = suppliers;
        this.products = products;
        this.inventory = inventory;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * FR-SUP-04: create and confirm in one step, writing a movement per line.
     *
     * <p>One transaction, so a delivery either lands in full or not at all. A
     * receipt that moved three of its five lines would leave stock that no
     * document explains.
     */
    @Override
    @Transactional
    public GoodsReceiptView receive(GoodsReceiptRequest request, PosPrincipal actor, String clientIp) {
        Supplier supplier = suppliers.findById(request.supplierId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such supplier"));
        if (!supplier.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "%s is retired. Restore the supplier before receiving against it.".formatted(supplier.getName()));
        }

        GoodsReceipt receipt = new GoodsReceipt(request.outletId(), supplier.getId(),
                blankToNull(request.reference()), blankToNull(request.note()), actor.userId());

        for (GoodsReceiptRequest.Line line : request.lines()) {
            if (!products.existsById(line.productId())) throw new ProductNotFoundException(line.productId());
            receipt.addLine(new GoodsReceiptLine(line.productId(), line.purchaseUnit().trim(),
                    line.conversionFactor(), line.quantity(), line.unitCost()));
        }

        receipt.confirm(actor.userId(), clock.instant());
        GoodsReceipt saved = receipts.save(receipt);

        List<GoodsReceiptView.Line> results = postMovements(saved, actor, false, clientIp);

        audit.record(actor.userId(), "GOODS_RECEIVED", "goods_receipt", saved.getId(), null,
                Map.of("supplier", supplier.getName(),
                        "reference", saved.getReference() == null ? "" : saved.getReference(),
                        "lines", results.size()),
                saved.getOutletId(), null, clientIp);

        return view(saved, supplier.getName(), results, false);
    }

    /**
     * FR-SUP-06: correction is a reversing document, never an edit.
     *
     * <p>The reversal is a receipt in its own right with negated quantities, so
     * both remain visible and the ledger carries a movement for each. Nothing is
     * deleted and no earlier figure is rewritten.
     */
    @Override
    @Transactional
    public GoodsReceiptView reverse(UUID receiptId, PosPrincipal actor, String clientIp) {
        GoodsReceipt original = receipts.findById(receiptId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such goods receipt"));
        if (original.getReversesId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A reversal cannot itself be reversed");
        }
        if (receipts.existsByReversesId(receiptId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This receipt has already been reversed");
        }

        Supplier supplier = suppliers.findById(original.getSupplierId()).orElseThrow();

        GoodsReceipt reversal = new GoodsReceipt(original.getOutletId(), original.getSupplierId(),
                "REV-" + (original.getReference() == null ? shortId(original.getId()) : original.getReference()),
                "Reverses " + shortId(original.getId()), actor.userId());
        reversal.markReverses(original.getId());
        original.getLines().forEach(line -> reversal.addLine(new GoodsReceiptLine(
                line.getProductId(), line.getPurchaseUnit(), line.getConversionFactor(),
                line.getQuantity(), line.getUnitCost())));

        reversal.confirm(actor.userId(), clock.instant());
        GoodsReceipt saved = receipts.save(reversal);

        List<GoodsReceiptView.Line> results = postMovements(saved, actor, true, clientIp);

        audit.record(actor.userId(), "GOODS_RECEIPT_REVERSED", "goods_receipt", saved.getId(),
                Map.of("reverses", original.getId().toString()),
                Map.of("supplier", supplier.getName(), "lines", results.size()),
                saved.getOutletId(), null, clientIp);

        return view(saved, supplier.getName(), results, false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<GoodsReceiptView> forSupplier(UUID supplierId) {
        return receipts.findAllBySupplierIdOrderByCreatedAtDesc(supplierId).stream()
                .map(this::summary).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<GoodsReceiptView> atOutlet(UUID outletId) {
        return receipts.findAllByOutletIdOrderByCreatedAtDesc(outletId).stream()
                .map(this::summary).toList();
    }

    // --- internals ---------------------------------------------------------

    /**
     * Each line becomes a stock movement, and the level that comes back is what
     * the screen reports.
     *
     * <p>{@code sourceId} is the receipt, which is also the idempotency key of
     * BR-7 — the unique index on (source, id, product, type) is why a line can
     * only appear once per product per receipt.
     */
    private List<GoodsReceiptView.Line> postMovements(GoodsReceipt receipt, PosPrincipal actor,
                                                      boolean reversing, String clientIp) {
        List<GoodsReceiptView.Line> results = new ArrayList<>();

        for (GoodsReceiptLine line : receipt.getLines()) {
            BigDecimal baseQuantity = line.quantityInBaseUnits();

            // FR-UOM-05: the cost per base unit, so a 100 m drum at 450 is 4.50
            // a metre before BR-4 blends it with what is already on hand.
            BigDecimal costPerBase = Costing.costPerBaseUnit(
                    Money.ofMajor(line.getUnitCost()), line.getConversionFactor()).toMajor();

            StockView level = inventory.record(new MovementRequest(
                    line.getProductId(), receipt.getOutletId(),
                    // A reversal removes what the original added. It is an
                    // ADJUSTMENT_OUT rather than a negative receipt, because
                    // BR-4 must not treat removal as a new purchase price.
                    reversing ? MovementType.ADJUSTMENT_OUT : MovementType.RECEIPT,
                    baseQuantity, costPerBase,
                    reversing ? "Goods receipt reversed" : null,
                    receipt.getReference(), SOURCE, receipt.getId()),
                    actor, true, clientIp);

            String productName = products.findById(line.getProductId())
                    .map(Product::getName).orElse("(removed)");

            results.add(new GoodsReceiptView.Line(
                    line.getProductId(), productName, line.getPurchaseUnit(), line.getConversionFactor(),
                    line.getQuantity(), baseQuantity, line.getUnitCost(),
                    line.getUnitCost().multiply(line.getQuantity()),
                    level.quantity(), level.averageCost()));
        }
        return results;
    }

    private GoodsReceiptView summary(GoodsReceipt receipt) {
        String supplierName = suppliers.findById(receipt.getSupplierId())
                .map(Supplier::getName).orElse("(removed)");

        List<GoodsReceiptView.Line> lines = receipt.getLines().stream()
                .map(line -> new GoodsReceiptView.Line(
                        line.getProductId(),
                        products.findById(line.getProductId()).map(Product::getName).orElse("(removed)"),
                        line.getPurchaseUnit(), line.getConversionFactor(), line.getQuantity(),
                        line.quantityInBaseUnits(), line.getUnitCost(),
                        line.getUnitCost().multiply(line.getQuantity()), null, null))
                .toList();

        return view(receipt, supplierName, lines, receipts.existsByReversesId(receipt.getId()));
    }

    private GoodsReceiptView view(GoodsReceipt receipt, String supplierName,
                                  List<GoodsReceiptView.Line> lines, boolean reversed) {
        BigDecimal total = lines.stream()
                .map(GoodsReceiptView.Line::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new GoodsReceiptView(receipt.getId(), receipt.getOutletId(), receipt.getSupplierId(),
                supplierName, receipt.getReference(), receipt.getNote(), receipt.getConfirmedAt(),
                null, receipt.getReversesId(), reversed, total, lines);
    }

    private String shortId(UUID id) { return id.toString().substring(0, 8).toUpperCase(); }

    private String blankToNull(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }
}
