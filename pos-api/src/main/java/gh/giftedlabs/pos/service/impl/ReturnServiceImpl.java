package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.*;
import gh.giftedlabs.pos.entity.*;
import gh.giftedlabs.pos.exception.SaleException;
import gh.giftedlabs.pos.repository.*;
import gh.giftedlabs.pos.rules.*;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Goods coming back — FR returns, {@code sale.refund}.
 *
 * <p>Three rules carry this feature, and all three are about refusing to
 * recompute something that was already decided:
 *
 * <ol>
 *   <li><b>The refund is at the price paid.</b> Taken from the original sale
 *       line, discount included. A customer who bought at 20% off and is
 *       refunded at today's full price costs the shop the difference, on every
 *       return, with no report that would show it.</li>
 *   <li><b>The cost is the cost frozen on that line</b> (BR-5). Reversing at
 *       today's average cost would restate the profit of a sale made months ago
 *       every time stock is received at a new price.</li>
 *   <li><b>Nothing comes back twice.</b> What has already been returned against
 *       each line is the cap, read from the returns themselves rather than
 *       tracked on the sale.</li>
 * </ol>
 *
 * <p>An exchange is a return <em>and an ordinary sale</em>, in one transaction.
 * The replacement goods go through {@link SaleService} exactly as if they had
 * been bought: their own receipt number, their own stock movements, their own
 * frozen cost. Anything else would create a second, half-featured way to sell.
 */
@Service
public class ReturnServiceImpl implements ReturnService {

    private static final String SOURCE = "SALE_RETURN";

    private final SaleReturnRepository returns;
    private final SaleRepository sales;
    private final ProductRepository products;
    private final CustomerRepository customers;
    private final OutletRepository outlets;
    private final UserRepository users;
    private final InventoryService inventory;
    private final SaleService saleService;
    private final ShiftService shifts;
    private final UserService staff;
    private final AuditService audit;
    private final Clock clock;

    public ReturnServiceImpl(SaleReturnRepository returns, SaleRepository sales,
                             ProductRepository products, CustomerRepository customers,
                             OutletRepository outlets, UserRepository users, InventoryService inventory,
                             SaleService saleService, ShiftService shifts, UserService staff,
                             AuditService audit, Clock clock) {
        this.returns = returns;
        this.sales = sales;
        this.products = products;
        this.customers = customers;
        this.outlets = outlets;
        this.users = users;
        this.inventory = inventory;
        this.saleService = saleService;
        this.shifts = shifts;
        this.staff = staff;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public ReturnView.Returnable returnable(UUID saleId) {
        Sale sale = findSale(saleId);
        Map<UUID, BigDecimal> alreadyBack = returns.returnedQuantities(saleId);

        List<ReturnView.Returnable.ReturnableLine> lines = sale.getItems().stream()
                .map(item -> {
                    BigDecimal sold = item.getQuantityBase();
                    BigDecimal back = alreadyBack.getOrDefault(item.getId(), BigDecimal.ZERO);
                    return new ReturnView.Returnable.ReturnableLine(
                            item.getId(), item.getProductId(), productName(item.getProductId()),
                            sold, back, sold.subtract(back).max(BigDecimal.ZERO),
                            pricePaidPerBaseUnit(item));
                })
                .toList();

        return new ReturnView.Returnable(sale.getId(), sale.getReceiptNumber(), sale.isVoided(), lines);
    }

    @Override
    @Transactional
    public ReturnView process(ReturnRequest request, PosPrincipal actor, boolean mayOversell,
                              String clientIp) {
        Sale sale = findSale(request.originalSaleId());

        // BR-3: a void already reversed the whole sale. Returning against one
        // would write the reversal a second time and leave stock higher than it
        // has ever been.
        if (sale.isVoided()) throw SaleException.cannotReturnVoidedSale(sale.getReceiptNumber());

        SaleReturn.Kind kind = SaleReturn.Kind.valueOf(request.kind());
        if (kind == SaleReturn.Kind.EXCHANGE && request.exchangeSale() == null) {
            throw SaleException.exchangeNeedsReplacement();
        }

        // FR-USER-03: an id in a request body is a claim, not an authorisation.
        if (request.approvedBy() != null
                && !staff.holdsPermission(request.approvedBy(), Permission.SALE_REFUND)) {
            throw SaleException.approverCannotRefund();
        }

        Map<UUID, SaleItem> byLine = sale.getItems().stream()
                .collect(Collectors.toMap(SaleItem::getId, item -> item));
        Map<UUID, BigDecimal> alreadyBack = returns.returnedQuantities(sale.getId());

        SaleReturn document = new SaleReturn(nextNumber(sale.getOutletId()), sale.getId(),
                sale.getOutletId(), sale.getTerminalId(), kind, actor.userId(), clock.instant());
        document.setCustomerId(sale.getCustomerId());
        document.setApprovedBy(request.approvedBy());
        document.setNotes(blankToNull(request.notes()));

        long refundTotal = 0;

        for (ReturnRequest.Line line : request.items()) {
            SaleItem sold = byLine.get(line.saleItemId());
            if (sold == null) throw SaleException.lineNotOnSale(sale.getReceiptNumber());

            String name = productName(sold.getProductId());
            BigDecimal wanted = line.quantityBase();
            BigDecimal returnable = sold.getQuantityBase()
                    .subtract(alreadyBack.getOrDefault(sold.getId(), BigDecimal.ZERO));

            if (wanted.compareTo(returnable) > 0) {
                throw SaleException.tooMuchReturned(name, wanted, returnable.max(BigDecimal.ZERO));
            }
            // Two lines of the same item in one request must not each pass the
            // check independently and together exceed what was sold.
            alreadyBack.merge(sold.getId(), wanted, BigDecimal::add);

            BigDecimal pricePaid = pricePaidPerBaseUnit(sold);
            long lineRefund = pricePaid.multiply(wanted)
                    .setScale(2, RoundingMode.HALF_UP)
                    .movePointRight(2).longValueExact();

            ReturnDisposition disposition = ReturnDisposition.ofKey(line.disposition()).orElseThrow(
                    () -> new IllegalArgumentException("Unknown disposition: " + line.disposition()));

            SaleReturnItem item = new SaleReturnItem(sold.getId(), sold.getProductId(), name,
                    wanted, pricePaid, lineRefund, sold.getFrozenCostPrice(),
                    line.reason().trim(), disposition);
            item.setConditionNotes(blankToNull(line.conditionNotes()));
            document.addItem(item);

            refundTotal += lineRefund;
            writeMovements(document, item, disposition, actor, mayOversell, clientIp);
        }

        document.setRefundTotalPesewas(refundTotal);
        settle(document, request, kind, actor, mayOversell, clientIp);

        SaleReturn saved = returns.save(document);
        audit.record(actor.userId(), kind == SaleReturn.Kind.EXCHANGE ? "SALE_EXCHANGED" : "SALE_REFUNDED",
                "sale_return", saved.getId(), null, snapshot(saved, sale),
                saved.getOutletId(), saved.getTerminalId(), clientIp);

        return view(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public ReturnView get(UUID id) {
        return view(returns.findWithItems(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such return")));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReturnView> list(UUID outletId, int limit) {
        return returns.list(outletId, PageRequest.of(0, Math.clamp(limit, 1, 500)))
                .stream().map(this::view).toList();
    }

    // --- internals ---------------------------------------------------------

    /**
     * The stock story of one returned line.
     *
     * <p>Every disposition records the goods coming back in. All but a restock
     * then record them leaving again — two movements rather than none, because
     * the item physically returned and BR-2 makes the ledger the account of what
     * happened rather than only of what is sellable. It also puts a written-off
     * return on the damage report, which is where somebody notices a supplier
     * sending bad stock.
     */
    private void writeMovements(SaleReturn document, SaleReturnItem item,
                                ReturnDisposition disposition, PosPrincipal actor,
                                boolean mayOversell, String clientIp) {

        inventory.record(new MovementRequest(
                item.getProductId(), document.getOutletId(), MovementType.CUSTOMER_RETURN,
                item.getQuantityBase(), item.getFrozenCostPrice(),
                item.getReason(), "Returned on " + document.getReturnNumber(),
                SOURCE, document.getId()), actor, true, clientIp);

        if (!disposition.leavesAgain()) return;

        inventory.record(new MovementRequest(
                item.getProductId(), document.getOutletId(), disposition.outboundType(),
                item.getQuantityBase(), item.getFrozenCostPrice(),
                item.getReason(),
                disposition == ReturnDisposition.SUPPLIER_RMA
                        ? "Sent to supplier from " + document.getReturnNumber()
                        : "Written off from " + document.getReturnNumber(),
                SOURCE, document.getId()), actor, mayOversell, clientIp);
    }

    /**
     * Where the money goes.
     *
     * <p>A refund pays out what the goods were worth. An exchange sells the
     * replacements as an ordinary sale and settles the difference — positive
     * means the customer paid it, negative means the shop did.
     */
    private void settle(SaleReturn document, ReturnRequest request, SaleReturn.Kind kind,
                        PosPrincipal actor, boolean mayOversell, String clientIp) {

        if (kind == SaleReturn.Kind.REFUND) {
            if (request.refundMethod() == null || request.refundMethod().isBlank()) {
                throw SaleException.refundNeedsMethod();
            }
            document.setRefundMethod(request.refundMethod());
            document.setSettlementPesewas(-document.getRefundTotalPesewas());
            payOutCash(document, actor, clientIp);
            return;
        }

        // The replacement goods, sold exactly as anything else is.
        SaleView replacement = saleService.complete(request.exchangeSale(), actor, mayOversell, clientIp);
        document.setExchangeSaleId(replacement.id());

        long difference = replacement.total() - document.getRefundTotalPesewas();
        document.setSettlementPesewas(difference);

        // The returned goods are paid back whichever way the swap falls, and the
        // replacement sale took its own payment a moment ago. The drawer therefore
        // nets to the difference, which is what the customer actually handed over.
        document.setRefundMethod(defaulted(request.refundMethod()));
        payOutCash(document, actor, clientIp);
    }

    /**
     * BR-13 · BR-14: cash out of the drawer is a cash movement.
     *
     * <p>Without this the till is short at close by exactly the refunds given,
     * and a cashier is asked to explain a variance they did not cause.
     */
    private void payOutCash(SaleReturn document, PosPrincipal actor, String clientIp) {
        long cash = document.cashOutPesewas();
        if (cash <= 0) return;

        shifts.openShiftFor(actor.userId()).ifPresent(shiftId ->
                shifts.recordCash(shiftId, CashMovementType.PAYOUT, cash,
                        "Refund " + document.getReturnNumber(),
                        "Goods returned against " + document.getOriginalSaleId(),
                        actor, clientIp));
    }

    /**
     * {@code INC-R000001}. Not BR-6: that rule governs receipts, not credit notes.
     *
     * <p>The outlet code is part of the number, not decoration. Two shops each
     * counting from one would both produce R000001, and the numbers collide the
     * moment both shops' returns land in the owner's database — which is exactly
     * what the sync channel does.
     */
    private String nextNumber(UUID outletId) {
        String code = outlets.findById(outletId).map(Outlet::getCode).orElse("XXX");
        return "%s-R%06d".formatted(code, returns.nextReturnNumber(outletId));
    }

    /**
     * What the customer actually paid for one base unit, discount included.
     *
     * <p>From the line total rather than the unit price, because the discount was
     * applied to the line. Refunding at the undiscounted unit price is the
     * mistake this method exists to prevent.
     */
    private BigDecimal pricePaidPerBaseUnit(SaleItem item) {
        BigDecimal quantity = item.getQuantityBase();
        if (quantity.signum() == 0) return BigDecimal.ZERO;
        return BigDecimal.valueOf(item.getLineTotal())
                .movePointLeft(2)
                .divide(quantity, 4, RoundingMode.HALF_UP);
    }

    private Sale findSale(UUID saleId) {
        return sales.findById(saleId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such sale"));
    }

    private String productName(UUID productId) {
        return products.findById(productId).map(Product::getName).orElse("Unknown product");
    }

    private String defaulted(String method) {
        return method == null || method.isBlank() ? "CASH" : method;
    }

    private ReturnView view(SaleReturn document) {
        String originalReceipt = sales.findById(document.getOriginalSaleId())
                .map(Sale::getReceiptNumber).orElse(null);
        String exchangeReceipt = document.getExchangeSaleId() == null ? null
                : sales.findById(document.getExchangeSaleId()).map(Sale::getReceiptNumber).orElse(null);
        String customerName = document.getCustomerId() == null ? null
                : customers.findById(document.getCustomerId()).map(Customer::getName).orElse(null);
        String cashierName = users.findById(document.getCashierId())
                .map(User::getFullName).orElse(null);
        return ReturnView.of(document, originalReceipt, exchangeReceipt, customerName, cashierName);
    }

    /** BR-15. */
    private Map<String, Object> snapshot(SaleReturn document, Sale sale) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("returnNumber", document.getReturnNumber());
        state.put("againstReceipt", sale.getReceiptNumber());
        state.put("kind", document.getKind().name());
        state.put("refundTotalPesewas", document.getRefundTotalPesewas());
        state.put("settlementPesewas", document.getSettlementPesewas());
        if (document.getRefundMethod() != null) state.put("refundMethod", document.getRefundMethod());
        state.put("lines", document.getItems().size());
        state.put("dispositions", document.getItems().stream()
                .map(item -> item.getDisposition().name()).distinct().toList());
        if (document.getApprovedBy() != null) {
            state.put("approvedBy", document.getApprovedBy().toString());
        }
        return state;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
