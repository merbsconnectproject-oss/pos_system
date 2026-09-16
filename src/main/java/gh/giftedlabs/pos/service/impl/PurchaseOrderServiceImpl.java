package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.PurchaseOrderRequest;
import gh.giftedlabs.pos.dto.PurchaseOrderView;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.Product;
import gh.giftedlabs.pos.entity.PurchaseOrder;
import gh.giftedlabs.pos.entity.PurchaseOrderLine;
import gh.giftedlabs.pos.entity.Supplier;
import gh.giftedlabs.pos.exception.OutletNotFoundException;
import gh.giftedlabs.pos.exception.ProductNotFoundException;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.ProductRepository;
import gh.giftedlabs.pos.repository.PurchaseOrderRepository;
import gh.giftedlabs.pos.repository.SupplierRepository;
import gh.giftedlabs.pos.rules.Money;
import gh.giftedlabs.pos.rules.PurchaseOrderStatus;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.PurchaseOrderService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Raising and tracking orders — FR-SUP-08.
 *
 * <p>The whole feature turns on one decision: <strong>received is never stored</strong>.
 * It is summed, on read, from the confirmed goods receipts pointing at the order.
 * A received column would be a second copy of the deliveries, and the first time
 * somebody reversed a receipt the two would part company — with the order
 * claiming goods the ledger says never arrived.
 *
 * <p>Everything else follows from that. Partial delivery needs no state, because
 * it is a subtraction. Over-delivery needs no state either, and is not an error:
 * the goods are on the shelf, and pretending otherwise would put the order and
 * the stock ledger into permanent disagreement.
 */
@Service
public class PurchaseOrderServiceImpl implements PurchaseOrderService {

    /**
     * Quantities compare to three decimals, which is the scale the schema stores.
     * Comparing at full precision would make 3.0000 and 3.000 different orders.
     */
    private static final int QUANTITY_SCALE = 3;

    private final PurchaseOrderRepository orders;
    private final SupplierRepository suppliers;
    private final ProductRepository products;
    private final OutletRepository outlets;
    private final NamedParameterJdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public PurchaseOrderServiceImpl(PurchaseOrderRepository orders, SupplierRepository suppliers,
                                    ProductRepository products, OutletRepository outlets,
                                    NamedParameterJdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.orders = orders;
        this.suppliers = suppliers;
        this.products = products;
        this.outlets = outlets;
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    // --- reading ------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public List<PurchaseOrderView> list(UUID outletId, String status, UUID supplierId, int limit) {
        List<UUID> scope = outletId == null
                ? outlets.findAll().stream().map(Outlet::getId).toList()
                : List.of(outletId);
        if (scope.isEmpty()) return List.of();

        PurchaseOrderStatus wanted = parseStatus(status);

        List<PurchaseOrder> rows = orders.findForOutlets(scope).stream()
                .filter(order -> wanted == null || order.getStatus() == wanted)
                .filter(order -> supplierId == null || order.getSupplierId().equals(supplierId))
                .limit(Math.clamp(limit, 1, 500))
                .toList();

        // One aggregate for the whole page rather than one per order. A shop with
        // forty open orders would otherwise issue forty of these.
        Map<UUID, Map<UUID, BigDecimal>> received = receivedFor(
                rows.stream().map(PurchaseOrder::getId).toList());

        Map<UUID, String> supplierNames = supplierNames(rows);

        return rows.stream()
                .map(order -> view(order, supplierNames.get(order.getSupplierId()),
                        received.getOrDefault(order.getId(), Map.of()), List.of()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public PurchaseOrderView get(UUID id) {
        PurchaseOrder order = find(id);
        return view(order, supplierName(order.getSupplierId()),
                receivedFor(List.of(id)).getOrDefault(id, Map.of()), receiptsAgainst(id));
    }

    // --- writing ------------------------------------------------------------

    @Override
    @Transactional
    public PurchaseOrderView create(PurchaseOrderRequest request, PosPrincipal actor, String clientIp) {
        Outlet outlet = outlets.findById(request.outletId())
                .orElseThrow(() -> new OutletNotFoundException(request.outletId()));
        Supplier supplier = activeSupplier(request.supplierId());

        PurchaseOrder order = new PurchaseOrder(
                "%s-PO-%06d".formatted(outlet.getCode(), orders.nextOrderNumber(outlet.getId())),
                outlet.getId(), supplier.getId(), request.expectedOn(),
                blankToNull(request.note()), actor.userId());

        applyLines(order, request);
        PurchaseOrder saved = orders.save(order);

        audit.record(actor.userId(), "PURCHASE_ORDER_RAISED", "purchase_order", saved.getId(), null,
                Map.of("number", saved.getNumber(), "supplier", supplier.getName(),
                        "lines", saved.getLines().size(),
                        "committedPesewas", committed(saved)),
                saved.getOutletId(), null, clientIp);

        return get(saved.getId());
    }

    @Override
    @Transactional
    public PurchaseOrderView amend(UUID id, PurchaseOrderRequest request, PosPrincipal actor,
                                   String clientIp) {
        PurchaseOrder order = find(id);
        if (!order.isDraft()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "%s has already gone to the supplier. Cancel it and raise another."
                            .formatted(order.getNumber()));
        }

        activeSupplier(order.getSupplierId());

        Map<String, Object> before = Map.of("lines", order.getLines().size(),
                "committedPesewas", committed(order));

        // Flushed between the two, because Hibernate orders inserts before
        // deletes within a flush: re-ordering the same product would otherwise
        // collide with the line being replaced on po_line_one_per_product.
        order.removeLines();
        orders.saveAndFlush(order);

        order.amend(request.expectedOn(), blankToNull(request.note()));
        applyLines(order, request);
        orders.save(order);

        audit.record(actor.userId(), "PURCHASE_ORDER_AMENDED", "purchase_order", order.getId(),
                before,
                Map.of("lines", order.getLines().size(), "committedPesewas", committed(order)),
                order.getOutletId(), null, clientIp);

        return get(order.getId());
    }

    @Override
    @Transactional
    public PurchaseOrderView send(UUID id, PosPrincipal actor, String clientIp) {
        PurchaseOrder order = find(id);
        if (!order.isDraft()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "%s is already %s".formatted(order.getNumber(),
                            order.getStatus().name().toLowerCase(java.util.Locale.ROOT)));
        }
        if (order.getLines().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An empty order cannot be sent to a supplier");
        }

        order.send(actor.userId(), clock.instant());
        orders.save(order);

        audit.record(actor.userId(), "PURCHASE_ORDER_SENT", "purchase_order", order.getId(),
                Map.of("status", PurchaseOrderStatus.DRAFT.name()),
                Map.of("status", PurchaseOrderStatus.SENT.name(), "number", order.getNumber(),
                        "committedPesewas", committed(order)),
                order.getOutletId(), null, clientIp);

        return get(order.getId());
    }

    @Override
    @Transactional
    public PurchaseOrderView close(UUID id, String reason, PosPrincipal actor, String clientIp) {
        PurchaseOrder order = find(id);
        if (!order.isOpen()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    order.isDraft()
                            ? "%s has not been sent yet. Cancel it instead.".formatted(order.getNumber())
                            : "%s is already finished".formatted(order.getNumber()));
        }

        Map<UUID, BigDecimal> received = receivedFor(List.of(id)).getOrDefault(id, Map.of());
        PurchaseOrderView.Delivery state = deliveryOf(order, received);

        // Closing an order nothing arrived against is a decision that needs
        // stating. Closing one that came in full does not, so it is written for
        // whoever reads the order later rather than demanded of the storekeeper.
        String stated = blankToNull(reason);
        if (stated == null) {
            stated = switch (state) {
                case COMPLETE -> "Received in full";
                case OVER -> "Received in full, with an over-delivery";
                case PARTIAL -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Say why this order is being closed short");
                case NONE -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Nothing has arrived against this order. Say why it is being closed, "
                                + "or cancel it instead.");
            };
        }

        order.close(actor.userId(), clock.instant(), stated);
        orders.save(order);

        audit.record(actor.userId(), "PURCHASE_ORDER_CLOSED", "purchase_order", order.getId(),
                Map.of("status", PurchaseOrderStatus.SENT.name()),
                Map.of("status", PurchaseOrderStatus.CLOSED.name(), "number", order.getNumber(),
                        "delivery", state.name(), "reason", stated),
                order.getOutletId(), null, clientIp);

        return get(order.getId());
    }

    @Override
    @Transactional
    public PurchaseOrderView cancel(UUID id, String reason, PosPrincipal actor, String clientIp) {
        PurchaseOrder order = find(id);
        if (order.isFinished()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "%s is already finished".formatted(order.getNumber()));
        }

        String stated = blankToNull(reason);
        if (stated == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Say why this order is being cancelled");
        }

        // A cancelled order that already had deliveries against it would leave
        // stock nothing explains. Close it instead — the goods did arrive.
        Map<UUID, BigDecimal> received = receivedFor(List.of(id)).getOrDefault(id, Map.of());
        if (!received.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Goods have already arrived against %s. Close it short instead of cancelling it."
                            .formatted(order.getNumber()));
        }

        PurchaseOrderStatus was = order.getStatus();
        order.cancel(actor.userId(), clock.instant(), stated);
        orders.save(order);

        audit.record(actor.userId(), "PURCHASE_ORDER_CANCELLED", "purchase_order", order.getId(),
                Map.of("status", was.name()),
                Map.of("status", PurchaseOrderStatus.CANCELLED.name(), "number", order.getNumber(),
                        "reason", stated),
                order.getOutletId(), null, clientIp);

        return get(order.getId());
    }

    @Override
    @Transactional
    public void noteDelivery(UUID orderId, PosPrincipal actor, String clientIp) {
        PurchaseOrder order = orders.findWithLines(orderId).orElse(null);
        if (order == null || !order.isOpen()) return;

        Map<UUID, BigDecimal> received = receivedFor(List.of(orderId))
                .getOrDefault(orderId, Map.of());
        PurchaseOrderView.Delivery state = deliveryOf(order, received);

        if (state != PurchaseOrderView.Delivery.COMPLETE
                && state != PurchaseOrderView.Delivery.OVER) {
            // Still outstanding, which is an ordinary state and not worth a note.
            return;
        }

        order.close(actor.userId(), clock.instant(),
                state == PurchaseOrderView.Delivery.OVER
                        ? "Received in full, with an over-delivery"
                        : "Received in full");
        orders.save(order);

        audit.record(actor.userId(), "PURCHASE_ORDER_CLOSED", "purchase_order", order.getId(),
                Map.of("status", PurchaseOrderStatus.SENT.name()),
                Map.of("status", PurchaseOrderStatus.CLOSED.name(), "number", order.getNumber(),
                        "delivery", state.name(), "closedBy", "delivery"),
                order.getOutletId(), null, clientIp);
    }

    // --- what has arrived ---------------------------------------------------

    /**
     * Base units received per product, per order, from confirmed receipts only.
     *
     * <p>In base units rather than purchase units because a delivery need not use
     * the unit the order was written in: 300 m may arrive against 3 drums ordered,
     * and both are the same goods. The conversion is what makes that comparable.
     *
     * <p>Reversals are excluded on both sides — the correcting receipt and the one
     * it corrects. A reversal carries positive lines and posts negative movements,
     * so counting either would say goods arrived that the ledger says did not.
     */
    private Map<UUID, Map<UUID, BigDecimal>> receivedFor(List<UUID> orderIds) {
        if (orderIds.isEmpty()) return Map.of();

        Map<UUID, Map<UUID, BigDecimal>> byOrder = new LinkedHashMap<>();
        jdbc.query("""
                select gr.purchase_order_id as order_id,
                       grl.product_id       as product_id,
                       sum(grl.quantity * grl.conversion_factor) as base_quantity
                  from goods_receipt_line grl
                  join goods_receipt gr on gr.id = grl.receipt_id
                 where gr.purchase_order_id in (:orderIds)
                   and gr.confirmed_at is not null
                   and gr.reverses_id is null
                   and not exists (select 1 from goods_receipt r where r.reverses_id = gr.id)
                 group by gr.purchase_order_id, grl.product_id
                """,
                new MapSqlParameterSource("orderIds", orderIds),
                rows -> {
                    byOrder.computeIfAbsent(rows.getObject("order_id", UUID.class),
                                    key -> new LinkedHashMap<>())
                            .put(rows.getObject("product_id", UUID.class),
                                    rows.getBigDecimal("base_quantity"));
                });
        return byOrder;
    }

    /** The deliveries booked against an order, newest first. */
    private List<PurchaseOrderView.Receipt> receiptsAgainst(UUID orderId) {
        List<PurchaseOrderView.Receipt> found = new ArrayList<>();
        jdbc.query("""
                select gr.id, gr.reference, gr.confirmed_at,
                       exists (select 1 from goods_receipt r where r.reverses_id = gr.id) as reversed
                  from goods_receipt gr
                 where gr.purchase_order_id = :orderId
                   and gr.reverses_id is null
                 order by gr.created_at desc
                """,
                new MapSqlParameterSource("orderId", orderId),
                rows -> {
                    var confirmed = rows.getTimestamp("confirmed_at");
                    found.add(new PurchaseOrderView.Receipt(
                            rows.getObject("id", UUID.class),
                            rows.getString("reference"),
                            confirmed == null ? null : confirmed.toInstant(),
                            rows.getBoolean("reversed")));
                });
        return found;
    }

    // --- views --------------------------------------------------------------

    private PurchaseOrderView view(PurchaseOrder order, String supplierName,
                                   Map<UUID, BigDecimal> receivedBase,
                                   List<PurchaseOrderView.Receipt> receipts) {

        Map<UUID, Product> catalogue = new LinkedHashMap<>();
        products.findAllById(order.getLines().stream().map(PurchaseOrderLine::getProductId).toList())
                .forEach(product -> catalogue.put(product.getId(), product));

        List<PurchaseOrderView.Line> lines = new ArrayList<>();
        long orderedTotal = 0;

        for (PurchaseOrderLine line : order.getLines()) {
            BigDecimal orderedBase = line.quantityInBaseUnits();
            BigDecimal receivedInBase = receivedBase.getOrDefault(line.getProductId(), BigDecimal.ZERO);

            // Back into this line's own purchase unit, so a screen showing "3
            // drums ordered" also shows "2 drums received" rather than "200 m".
            BigDecimal receivedHere = receivedInBase
                    .divide(line.getConversionFactor(), QUANTITY_SCALE, RoundingMode.HALF_UP);
            BigDecimal outstanding = line.getQuantity()
                    .setScale(QUANTITY_SCALE, RoundingMode.HALF_UP)
                    .subtract(receivedHere);

            long lineTotal = Money.ofMajor(line.lineTotal()).pesewas();
            orderedTotal += lineTotal;

            Product product = catalogue.get(line.getProductId());
            lines.add(new PurchaseOrderView.Line(
                    line.getProductId(),
                    product == null ? null : product.getSku(),
                    product == null ? null : product.getName(),
                    line.getPurchaseUnit(),
                    line.getConversionFactor(),
                    line.getQuantity(),
                    receivedHere,
                    outstanding,
                    line.getUnitCost(),
                    lineTotal,
                    lineDelivery(orderedBase, receivedInBase)));
        }

        return new PurchaseOrderView(
                order.getId(), order.getNumber(), order.getOutletId(), order.getSupplierId(),
                supplierName, order.getStatus().name(), deliveryOf(order, receivedBase),
                order.getExpectedOn(), overdue(order), order.getNote(),
                order.getSentAt(), order.getClosedAt(), order.getCloseReason(),
                order.getCreatedAt(), orderedTotal, receivedValue(order.getId()),
                lines, receipts);
    }

    /**
     * Whether an open order has passed the date the supplier promised.
     *
     * <p>Only meaningful while it is open: a closed order that was late is history,
     * and flagging it forever would bury the ones somebody can still chase.
     */
    private boolean overdue(PurchaseOrder order) {
        if (!order.isOpen() || order.getExpectedOn() == null) return false;
        return order.getExpectedOn().isBefore(LocalDate.now(clock.withZone(ZoneId.systemDefault())));
    }

    /** What the deliveries against an order were actually booked in at. */
    private long receivedValue(UUID orderId) {
        BigDecimal value = jdbc.queryForObject("""
                select coalesce(sum(grl.quantity * grl.unit_cost), 0)
                  from goods_receipt_line grl
                  join goods_receipt gr on gr.id = grl.receipt_id
                 where gr.purchase_order_id = :orderId
                   and gr.confirmed_at is not null
                   and gr.reverses_id is null
                   and not exists (select 1 from goods_receipt r where r.reverses_id = gr.id)
                """, new MapSqlParameterSource("orderId", orderId), BigDecimal.class);
        return Money.ofMajor(value == null ? BigDecimal.ZERO : value).pesewas();
    }

    private PurchaseOrderView.Delivery lineDelivery(BigDecimal orderedBase, BigDecimal receivedBase) {
        int scaled = receivedBase.setScale(QUANTITY_SCALE, RoundingMode.HALF_UP)
                .compareTo(orderedBase.setScale(QUANTITY_SCALE, RoundingMode.HALF_UP));
        if (receivedBase.signum() == 0) return PurchaseOrderView.Delivery.NONE;
        if (scaled > 0) return PurchaseOrderView.Delivery.OVER;
        if (scaled == 0) return PurchaseOrderView.Delivery.COMPLETE;
        return PurchaseOrderView.Delivery.PARTIAL;
    }

    /**
     * The order's state is the least advanced of its lines.
     *
     * <p>One line still outstanding makes the whole order outstanding, whatever
     * the others did — which is the only reading that keeps "open orders" a list
     * of things somebody still has to chase.
     */
    private PurchaseOrderView.Delivery deliveryOf(PurchaseOrder order,
                                                  Map<UUID, BigDecimal> receivedBase) {
        if (order.getLines().isEmpty()) return PurchaseOrderView.Delivery.NONE;

        boolean anyArrived = false;
        boolean anyOutstanding = false;
        boolean anyOver = false;

        for (PurchaseOrderLine line : order.getLines()) {
            BigDecimal received = receivedBase.getOrDefault(line.getProductId(), BigDecimal.ZERO);
            PurchaseOrderView.Delivery state = lineDelivery(line.quantityInBaseUnits(), received);
            switch (state) {
                case NONE -> anyOutstanding = true;
                case PARTIAL -> { anyArrived = true; anyOutstanding = true; }
                case COMPLETE -> anyArrived = true;
                case OVER -> { anyArrived = true; anyOver = true; }
            }
        }

        if (anyOutstanding) return anyArrived
                ? PurchaseOrderView.Delivery.PARTIAL : PurchaseOrderView.Delivery.NONE;
        return anyOver ? PurchaseOrderView.Delivery.OVER : PurchaseOrderView.Delivery.COMPLETE;
    }

    // --- internals ----------------------------------------------------------

    private void applyLines(PurchaseOrder order, PurchaseOrderRequest request) {
        for (PurchaseOrderRequest.Line line : request.lines()) {
            if (!products.existsById(line.productId())) throw new ProductNotFoundException(line.productId());
            order.addLine(new PurchaseOrderLine(line.productId(), line.purchaseUnit().trim(),
                    line.conversionFactor(), line.quantity(), line.unitCost()));
        }
    }

    private Supplier activeSupplier(UUID supplierId) {
        Supplier supplier = suppliers.findById(supplierId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such supplier"));
        if (!supplier.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "%s is retired. Restore the supplier before ordering from it."
                            .formatted(supplier.getName()));
        }
        return supplier;
    }

    private PurchaseOrder find(UUID id) {
        return orders.findWithLines(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No such purchase order"));
    }

    private long committed(PurchaseOrder order) {
        return order.getLines().stream()
                .mapToLong(line -> Money.ofMajor(line.lineTotal()).pesewas())
                .sum();
    }

    private Map<UUID, String> supplierNames(List<PurchaseOrder> rows) {
        Map<UUID, String> names = new LinkedHashMap<>();
        suppliers.findAllById(rows.stream().map(PurchaseOrder::getSupplierId).distinct().toList())
                .forEach(supplier -> names.put(supplier.getId(), supplier.getName()));
        return names;
    }

    private String supplierName(UUID supplierId) {
        return suppliers.findById(supplierId).map(Supplier::getName).orElse(null);
    }

    private PurchaseOrderStatus parseStatus(String status) {
        if (status == null || status.isBlank()) return null;
        try {
            return PurchaseOrderStatus.valueOf(status.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown order status: " + status);
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
