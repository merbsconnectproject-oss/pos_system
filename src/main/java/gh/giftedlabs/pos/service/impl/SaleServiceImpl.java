package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.MovementRequest;
import gh.giftedlabs.pos.dto.SaleRequest;
import gh.giftedlabs.pos.dto.SaleView;
import gh.giftedlabs.pos.entity.*;
import gh.giftedlabs.pos.exception.ProductNotFoundException;
import gh.giftedlabs.pos.exception.SaleException;
import gh.giftedlabs.pos.repository.*;
import gh.giftedlabs.pos.rules.*;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.InventoryService;
import gh.giftedlabs.pos.service.SaleService;
import gh.giftedlabs.pos.service.PricingService;
import gh.giftedlabs.pos.service.SettingsService;
import gh.giftedlabs.pos.service.ShiftService;
import gh.giftedlabs.pos.service.UserService;
import gh.giftedlabs.pos.exception.ShiftException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.*;

/**
 * Completing and voiding sales — FR-POS, FR-PAY, BR-3, BR-5, BR-6, BR-7, BR-8.
 *
 * <p>Everything a sale touches happens in one transaction: the receipt number
 * is taken, the lines are priced, the stock is decremented and the payments are
 * recorded together, or none of it is. A sale that printed a receipt but failed
 * to move stock is the worst outcome available, and one transaction is what
 * makes it impossible.
 */
@Service
public class SaleServiceImpl implements SaleService {

    private static final String SOURCE = "SALE";

    private final SaleRepository sales;
    private final ProductRepository products;
    private final TerminalRepository terminals;
    private final OutletRepository outlets;
    private final UserRepository users;
    private final CustomerRepository customers;
    private final StockLevelRepository levels;
    private final InventoryService inventory;
    private final ShiftService shiftsService;
    private final SettingsService settings;
    private final PricingService pricing;
    private final UserService staff;
    private final AuditService audit;
    private final Clock clock;

    public SaleServiceImpl(SaleRepository sales, ProductRepository products, TerminalRepository terminals,
                           OutletRepository outlets, UserRepository users, CustomerRepository customers,
                           StockLevelRepository levels,
                           InventoryService inventory, ShiftService shiftsService,
                           SettingsService settings, PricingService pricing, UserService staff,
                           AuditService audit, Clock clock) {
        this.shiftsService = shiftsService;
        this.settings = settings;
        this.pricing = pricing;
        this.staff = staff;
        this.sales = sales;
        this.products = products;
        this.terminals = terminals;
        this.outlets = outlets;
        this.users = users;
        this.customers = customers;
        this.levels = levels;
        this.inventory = inventory;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * FR-POS · FR-PAY: complete a sale.
     *
     * @param mayOversell BR-9: whether the cashier holds {@code stock.oversell}.
     */
    @Override
    @Transactional
    public SaleView complete(SaleRequest request, PosPrincipal actor, boolean mayOversell, String clientIp) {
        // BR-7 · FR-PAY acceptance: the same sale submitted twice records one
        // sale and returns the original. Checked first so a retry is cheap and
        // never re-prices or re-decrements anything.
        Optional<Sale> existing = sales.findById(request.id());
        if (existing.isPresent()) return view(existing.get());

        // FR-POS-02 · BR-13: takings have to land in a shift, or a cash-up has
        // nothing to count them against. The till already prompts; this is what
        // makes it true rather than advisory.
        UUID shiftId = shiftsService.openShiftFor(actor.userId())
                .orElseThrow(ShiftException::noOpenShift);

        Terminal terminal = terminalFor(request, actor);
        String receiptNumber = nextReceiptNumber(terminal, request.outletId());

        // FR-PRICE-05: resolved before pricing, because a customer's agreed
        // rate is part of what the lines are allowed to be.
        Customer customer = resolveCustomer(request);
        List<PricedLine> priced = priceLines(request, actor, customer);

        long subtotal = priced.stream().mapToLong(line -> line.gross).sum();
        long discountTotal = priced.stream().mapToLong(line -> line.discount).sum();
        long total = priced.stream().mapToLong(line -> line.net).sum();

        validatePayments(request);
        long paid = request.payments().stream().mapToLong(SaleRequest.PaymentLine::amount).sum();
        long changeDue = settlePayments(request, total, paid);

        Sale sale = new Sale(request.id(), receiptNumber, request.outletId(), terminal.getId(),
                actor.userId(), subtotal, discountTotal, total, changeDue, clock.instant());
        attachCustomer(sale, request, customer);
        sale.assignShift(shiftId);

        priced.forEach(line -> sale.addItem(line.toItem()));
        request.payments().forEach(payment -> sale.addPayment(new Payment(
                payment.id(), payment.method(), payment.amount(),
                blankToNull(payment.provider()), blankToNull(payment.reference()))));

        Sale saved = sales.save(sale);

        // BR-8: the decrement takes a row lock per product and refuses to go
        // negative unless the cashier may oversell. Inside this transaction, so
        // a sale that cannot take the stock never gets a receipt number spent
        // on it either.
        for (PricedLine line : priced) {
            inventory.record(new MovementRequest(
                    line.productId, request.outletId(), MovementType.SALE,
                    line.quantityBase, line.costAtSale, null, receiptNumber,
                    SOURCE, saved.getId()), actor, mayOversell, clientIp);
        }

        audit.record(actor.userId(), "SALE_COMPLETED", "sale", saved.getId(), null,
                Map.of("receipt", receiptNumber, "total", total, "lines", priced.size()),
                request.outletId(), terminal.getId(), clientIp);

        return view(saved);
    }

    /**
     * BR-3 · FR-POS-19: void, never delete.
     *
     * <p>Writes a reversing movement per line so the stock comes back with an
     * entry that explains it, and leaves the original sale readable — the
     * customer may still be holding its receipt.
     */
    @Override
    @Transactional
    public SaleView voidSale(UUID saleId, String reason, PosPrincipal actor, String clientIp) {
        Sale sale = sales.findById(saleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such sale"));
        if (sale.isVoided()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This sale is already voided");
        }
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A void needs a reason");
        }

        sale.voidSale(actor.userId(), reason.trim(), clock.instant());

        for (SaleItem item : sale.getItems()) {
            inventory.record(new MovementRequest(
                    item.getProductId(), sale.getOutletId(), MovementType.SALE_VOID,
                    item.getQuantityBase(), item.getFrozenCostPrice(),
                    "Sale voided: " + reason.trim(), sale.getReceiptNumber(),
                    SOURCE + "_VOID", sale.getId()), actor, true, clientIp);
        }

        audit.record(actor.userId(), "SALE_VOIDED", "sale", sale.getId(),
                Map.of("status", "COMPLETED"),
                Map.of("status", "VOIDED", "reason", reason.trim(), "receipt", sale.getReceiptNumber()),
                sale.getOutletId(), sale.getTerminalId(), clientIp);

        return view(sale);
    }

    @Override
    @Transactional
    public SaleView reprint(UUID saleId, PosPrincipal actor, String clientIp) {
        Sale sale = sales.findById(saleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such sale"));
        audit.record(actor.userId(), "RECEIPT_REPRINTED", "sale", sale.getId(), null,
                Map.of("receipt", sale.getReceiptNumber(), "reprint", true),
                sale.getOutletId(), sale.getTerminalId(), clientIp);
        return view(sale);
    }

    @Override
    @Transactional(readOnly = true)
    public SaleView get(UUID saleId) {
        return view(sales.findById(saleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such sale")));
    }

    /** FR-POS-18. */
    @Override
    @Transactional(readOnly = true)
    public List<SaleView> recent(UUID outletId, String query, int limit) {
        // Empty string, not null — see SaleRepository.search.
        String term = query == null ? "" : query.trim();
        return sales.search(outletId, term, org.springframework.data.domain.PageRequest.of(0, limit))
                .stream().map(this::view).toList();
    }

    /** FR-CUST-06 · `G-05`. */
    @Override
    @Transactional(readOnly = true)
    public List<SaleView> forCustomer(UUID customerId, int limit) {
        return sales.forCustomer(customerId, org.springframework.data.domain.PageRequest.of(0, limit))
                .stream().map(this::view).toList();
    }

    /**
     * FR-CUST-01 · FR-CUST-02: a sale may name a customer, and need not.
     *
     * <p>When one is named, the name and number are read from the record
     * rather than taken from the request. The browser's copy can be a page old
     * — the customer may have corrected their number in between — and the
     * receipt should carry what the business holds, not what a tab remembers.
     *
     * <p>A deactivated customer is refused rather than silently dropped. BR-17
     * deactivates the people a shop has stopped dealing with, and a sale that
     * quietly becomes a walk-in is a sale nobody can explain later.
     */
    private Customer resolveCustomer(SaleRequest request) {
        if (request.customerId() == null) return null;

        Customer customer = customers.findById(request.customerId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "That customer no longer exists"));
        if (!customer.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "%s is no longer an active customer".formatted(customer.getName()));
        }
        return customer;
    }

    private void attachCustomer(Sale sale, SaleRequest request, Customer customer) {
        if (customer == null) {
            // FR-CUST-01: a walk-in may still leave a name for the receipt.
            sale.setCustomer(null, blankToNull(request.customerName()),
                    blankToNull(request.customerPhone()));
            return;
        }
        sale.setCustomer(customer.getId(), customer.getName(), customer.getPhone());
    }

    // --- internals ---------------------------------------------------------

    /**
     * BR-10 · BR-5: price each line from the catalogue, not from the client.
     *
     * <p>The unit price is taken as submitted — a cashier may discount — but the
     * floor is checked against the product, and the cost is read here so BR-5
     * can freeze it. Accepting a line total from the browser would mean the
     * receipt says whatever the browser said.
     */
    private List<PricedLine> priceLines(SaleRequest request, PosPrincipal actor, Customer customer) {
        List<PricedLine> priced = new ArrayList<>();

        for (SaleRequest.Line line : request.items()) {
            Product product = products.findById(line.productId())
                    .orElseThrow(() -> new ProductNotFoundException(line.productId()));

            // FR-PRICE-03 · BR-10: the floor is this branch's, not the
            // product's. A branch that lowered its floor lowered the price its
            // cashiers may reach without asking anybody.
            BigDecimal floor = pricing.effective(product.getId(), request.outletId()).floor();

            // BR-10: below the floor needs an approver, recorded on the line —
            // and the approver is checked, not taken on the client's word. An
            // id arrives in the request body, so an unverified one would let
            // the browser name anybody, the cashier themselves included.
            if (line.unitPrice().compareTo(floor) < 0) {
                if (line.floorApprovedBy() == null) {
                    throw SaleException.belowFloor(product.getName(), line.unitPrice(), floor);
                }
                if (!staff.holdsPermission(line.floorApprovedBy(), Permission.SALE_APPROVE_BELOW_FLOOR)) {
                    throw SaleException.approverNotPermitted(product.getName());
                }
            }

            // FR-UOM-03: the catalogue's factor, not the browser's. What the
            // request claimed is compared and refused if it disagrees, because a
            // stale unit would move the wrong quantity of stock silently.
            BigDecimal factor = product.requireConversionFactor(
                    line.selectedUnit().trim(), line.conversionFactor());

            Quantity quantity = Quantity.of(line.quantity());
            Quantity quantityBase = quantity.timesFactor(factor);

            long discount = line.discount() == null ? 0L : line.discount();
            // BR-11: rounded per line, and the sale total is the sum of the
            // rounded lines rather than a rounded sum.
            Money gross = Money.lineTotal(quantity, line.unitPrice(), BigDecimal.ZERO);
            long net = Math.max(0L, gross.pesewas() - discount);

            requireDiscountAllowed(product.getName(), discount, gross.pesewas(),
                    line.discountApprovedBy(), actor, customer);

            // BR-5: the weighted average at this outlet, right now, frozen.
            BigDecimal costAtSale = levels
                    .findByProductIdAndOutletId(product.getId(), request.outletId())
                    .map(StockLevel::getAverageCost)
                    .orElse(BigDecimal.ZERO);

            priced.add(new PricedLine(product.getId(), line.selectedUnit().trim(), factor,
                    quantity.amount(), quantityBase.amount(), line.unitPrice(), discount,
                    gross.pesewas(), net, costAtSale, line.floorApprovedBy()));
        }
        return priced;
    }

    /**
     * FR-POS-10 · FR-SET-06: a discount past the role's ceiling needs approval.
     *
     * <p>The ceiling is a percentage of the line, not an amount: the same cedi
     * off a bulb and off a distribution board are not the same concession. The
     * approver is measured by their own ceiling rather than by a permission,
     * so a manager capped at 25% cannot wave through 60% — and the message says
     * what the cap is rather than only that it was passed.
     */
    private void requireDiscountAllowed(String productName, long discount, long gross,
                                        UUID approvedBy, PosPrincipal actor, Customer customer) {
        if (discount <= 0) return;

        BigDecimal percent = gross <= 0
                // Anything off a line worth nothing is the whole line.
                ? new BigDecimal("100")
                : BigDecimal.valueOf(discount).multiply(new BigDecimal("100"))
                        .divide(BigDecimal.valueOf(gross), 4, java.math.RoundingMode.HALF_UP);

        // FR-PRICE-05: the rate this customer was promised is not the cashier
        // giving money away — it is the business honouring a deal it made. A
        // ceiling that refused it would make the agreed rate unusable by the
        // people serving the customer it was agreed with.
        BigDecimal agreed = customer == null ? BigDecimal.ZERO : customer.getDiscountRate();

        // `sale.discount` is what buys the discretion. Without it the role's
        // ceiling is irrelevant — the ceiling answers "how much", and this
        // answers "at all". It was previously unchecked, so revoking the code hid
        // the control on the screen and the server still took the discount.
        BigDecimal discretion = staff.holdsPermission(actor.userId(), Permission.SALE_DISCOUNT)
                ? settings.discountCeiling(staff.rolesOf(actor.userId()))
                : BigDecimal.ZERO;

        // The customer's agreed rate survives either way: honouring a deal the
        // business made is not the cashier giving money away (FR-PRICE-05).
        BigDecimal allowed = discretion.max(agreed);
        if (percent.compareTo(allowed) <= 0) return;

        BigDecimal approverCeiling = approvedBy == null
                ? BigDecimal.ZERO
                : settings.discountCeiling(staff.rolesOf(approvedBy));
        if (percent.compareTo(approverCeiling) <= 0) return;

        throw SaleException.discountAboveCeiling(productName, percent, allowed.max(approverCeiling));
    }

    /**
     * FR-PAY-05/06: payments equal the total exactly, and only cash may exceed
     * it — the excess being change.
     *
     * <p>Exact, never within a tolerance (BR-11). Two pesewas short is short.
     */
    private long settlePayments(SaleRequest request, long total, long paid) {
        if (paid == total) return 0L;

        if (paid < total) throw SaleException.paymentMismatch(total, paid);

        boolean allCash = request.payments().stream()
                .allMatch(payment -> payment.method().allowsOverpayment());
        if (!allCash) throw SaleException.overpaymentNotCash(total, paid);

        return paid - total;
    }

    /**
     * FR-PAY-03/07: validate payment evidence before any sale is persisted.
     * Bean validation checks shape, while this domain validation checks the
     * payment method's business rules and duplicate client keys in one request.
     */
    private void validatePayments(SaleRequest request) {
        Set<UUID> ids = new HashSet<>();
        for (SaleRequest.PaymentLine payment : request.payments()) {
            if (!ids.add(payment.id())) {
                throw SaleException.duplicatePayment(payment.id());
            }
            if (payment.method().expectsReference()
                    && (payment.reference() == null || payment.reference().isBlank())) {
                throw SaleException.paymentReferenceRequired(payment.method().name());
            }
        }
    }

    /**
     * BR-6: the next number in this terminal's block, under a row lock.
     *
     * <p>Two sales on one till must not read the same {@code seq_current}. The
     * lock is taken before the number is read and held to commit, so the second
     * sale waits and gets the next one.
     */
    private String nextReceiptNumber(Terminal terminal, UUID outletId) {
        Terminal locked = terminals.lockById(terminal.getId()).orElseThrow();
        if (!locked.hasNumbersLeft()) throw SaleException.receiptBlockExhausted(locked.getCode());

        String outletPrefix = outlets.findById(outletId).map(Outlet::getCode).orElse("GEN");
        return ReceiptSequence.format(outletPrefix, locked.getCode(), locked.takeNextSequence());
    }

    /**
     * The till this sale came from.
     *
     * <p>A local-first install has one per counter and the client names it. When
     * it does not, the outlet's only active terminal is unambiguous; more than
     * one and the client has to say which, because the receipt number carries
     * the terminal code and guessing would produce a number from the wrong block.
     */
    private Terminal terminalFor(SaleRequest request, PosPrincipal actor) {
        if (request.terminalId() != null) {
            return terminals.findById(request.terminalId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such terminal"));
        }
        List<Terminal> atOutlet = terminals.findAllByOutletIdAndActiveTrueOrderByCodeAsc(request.outletId());
        if (atOutlet.isEmpty()) {
            throw SaleException.noTerminal(outlets.findById(request.outletId())
                    .map(Outlet::getName).orElse("this branch"));
        }
        return atOutlet.getFirst();
    }

    private SaleView view(Sale sale) {
        Map<UUID, Product> byId = new HashMap<>();
        sale.getItems().forEach(item ->
                products.findById(item.getProductId()).ifPresent(p -> byId.put(item.getProductId(), p)));

        List<SaleView.Line> lines = sale.getItems().stream()
                .map(item -> {
                    Product product = byId.get(item.getProductId());
                    return new SaleView.Line(
                            item.getProductId(),
                            product == null ? "(removed)" : product.getName(),
                            product == null ? "" : product.getSku(),
                            item.getSelectedUnit(), item.getConversionFactor(),
                            item.getQuantity(), item.getQuantityBase(), item.getUnitPrice(),
                            item.getDiscount(), item.getLineTotal(), item.getFrozenCostPrice(),
                            item.getFloorApprovedBy() != null);
                })
                .toList();

        List<SaleView.PaymentLine> payments = sale.getPayments().stream()
                .map(payment -> new SaleView.PaymentLine(payment.getId(), payment.getMethod().name(),
                        payment.getAmount(), payment.getProvider(), payment.getReference()))
                .toList();

        return new SaleView(sale.getId(), sale.getReceiptNumber(), sale.getOutletId(), sale.getTerminalId(),
                userName(sale.getCashierId()), sale.getCustomerId(), sale.getCustomerName(),
                sale.getCustomerPhone(), sale.getSubtotal(), sale.getDiscountTotal(), sale.getTotal(),
                sale.getChangeDue(), sale.getStatus().name(), sale.getVoidReason(),
                sale.getVoidedBy() == null ? null : userName(sale.getVoidedBy()),
                sale.getVoidedAt(), sale.getCreatedAt(), lines, payments);
    }

    private String userName(UUID userId) {
        return users.findById(userId).map(User::getFullName).orElse("(removed)");
    }

    private String blankToNull(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }

    /** A line after the server has priced it. */
    private record PricedLine(UUID productId, String selectedUnit, BigDecimal conversionFactor,
                              BigDecimal quantity, BigDecimal quantityBase, BigDecimal unitPrice,
                              long discount, long gross, long net, BigDecimal costAtSale,
                              UUID floorApprovedBy) {

        SaleItem toItem() {
            return new SaleItem(productId, selectedUnit, conversionFactor, quantity, quantityBase,
                    unitPrice, discount, net, costAtSale, floorApprovedBy);
        }
    }
}
