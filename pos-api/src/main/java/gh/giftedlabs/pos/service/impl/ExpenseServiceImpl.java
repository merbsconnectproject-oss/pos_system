package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.ExpenseRequest;
import gh.giftedlabs.pos.dto.ExpenseView;
import gh.giftedlabs.pos.entity.Expense;
import gh.giftedlabs.pos.exception.AccountingException;
import gh.giftedlabs.pos.exception.OutletNotFoundException;
import gh.giftedlabs.pos.repository.ExpenseRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.ExpenseCategory;
import gh.giftedlabs.pos.rules.ExpensePaymentMethod;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.ExpenseService;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Operating expenses.
 *
 * <p>Every figure here is summed by the database over the period asked for. The
 * screen this replaces built its P&L from a React array, so the net profit an
 * owner read was a statement about whatever happened to be in the browser —
 * and it reset to nothing on refresh.
 */
@Service
public class ExpenseServiceImpl implements ExpenseService {

    private final ExpenseRepository expenses;
    private final OutletRepository outlets;
    private final UserRepository users;
    private final AuditService audit;
    private final Clock clock;

    public ExpenseServiceImpl(ExpenseRepository expenses, OutletRepository outlets,
                              UserRepository users, AuditService audit, Clock clock) {
        this.expenses = expenses;
        this.outlets = outlets;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public ExpenseView.Page list(LocalDate from, LocalDate to, UUID outletId, int limit) {
        List<Expense> rows = expenses.list(from, to, outletId,
                PageRequest.of(0, Math.clamp(limit, 1, 1000)));

        // One lookup for the whole page rather than one per row. An expense list
        // is short, but the same N+1 on the sales screen was measurable.
        Map<UUID, String> outletNames = outletNames(rows);
        Map<UUID, String> userNames = userNames(rows);

        List<ExpenseView> views = rows.stream()
                .map(row -> ExpenseView.of(row,
                        row.getOutletId() == null ? null : outletNames.get(row.getOutletId()),
                        userNames.get(row.getRecordedBy())))
                .toList();

        long paid = rows.stream().filter(e -> "PAID".equals(e.getStatus()))
                .mapToLong(Expense::getAmountPesewas).sum();
        long pending = rows.stream().filter(e -> "PENDING".equals(e.getStatus()))
                .mapToLong(Expense::getAmountPesewas).sum();
        long deductible = rows.stream().filter(Expense::isTaxDeductible)
                .mapToLong(Expense::getAmountPesewas).sum();

        // PAID only. A category total that included unpaid invoices would not
        // reconcile against the money that actually left the business.
        Map<String, Long> byCategory = rows.stream()
                .filter(e -> "PAID".equals(e.getStatus()))
                .collect(Collectors.groupingBy(e -> e.getCategory().name(),
                        TreeMap::new, Collectors.summingLong(Expense::getAmountPesewas)));

        return new ExpenseView.Page(views, paid, pending, deductible, byCategory);
    }

    @Override
    @Transactional
    public ExpenseView record(ExpenseRequest request, PosPrincipal actor, String clientIp) {
        UUID outletId = resolveOutlet(request.outletId());

        Expense expense = new Expense(
                request.spentOn(),
                ExpenseCategory.ofKey(request.category()).orElseThrow(
                        () -> new IllegalArgumentException("Unknown expense category: " + request.category())),
                request.title().trim(),
                request.amountPesewas(),
                outletId,
                request.payee().trim(),
                ExpensePaymentMethod.ofKey(request.paymentMethod()).orElseThrow(
                        () -> new IllegalArgumentException("Unknown payment method: " + request.paymentMethod())),
                actor.userId(),
                clock.instant());
        applyDetails(request, expense);

        Expense saved = expenses.save(expense);
        audit.record(actor.userId(), "EXPENSE_RECORDED", "expense", saved.getId(), null,
                snapshot(saved), outletId, null, clientIp);

        return view(saved);
    }

    @Override
    @Transactional
    public ExpenseView update(UUID id, ExpenseRequest request, PosPrincipal actor, String clientIp) {
        Expense expense = find(id);
        if (expense.isVoided()) throw AccountingException.expenseAlreadyVoided();

        Map<String, Object> before = snapshot(expense);

        expense.setSpentOn(request.spentOn());
        expense.setCategory(ExpenseCategory.ofKey(request.category()).orElseThrow(
                () -> new IllegalArgumentException("Unknown expense category: " + request.category())));
        expense.setTitle(request.title().trim());
        expense.setAmountPesewas(request.amountPesewas());
        expense.setOutletId(resolveOutlet(request.outletId()));
        expense.setPayee(request.payee().trim());
        expense.setPaymentMethod(ExpensePaymentMethod.ofKey(request.paymentMethod()).orElseThrow(
                () -> new IllegalArgumentException("Unknown payment method: " + request.paymentMethod())));
        applyDetails(request, expense);
        expense.touch(clock.instant());

        // The before/after pair is the point. An expense amount changing is a
        // change to a month's net profit, and BR-15 wants both figures.
        audit.record(actor.userId(), "EXPENSE_UPDATED", "expense", id, before,
                snapshot(expense), expense.getOutletId(), null, clientIp);

        return view(expense);
    }

    @Override
    @Transactional
    public void voidExpense(UUID id, String reason, PosPrincipal actor, String clientIp) {
        Expense expense = find(id);
        if (expense.isVoided()) throw AccountingException.expenseAlreadyVoided();

        Map<String, Object> before = snapshot(expense);
        expense.voidExpense(actor.userId(), reason == null || reason.isBlank() ? null : reason.trim(),
                clock.instant());

        audit.record(actor.userId(), "EXPENSE_VOIDED", "expense", id, before,
                snapshot(expense), expense.getOutletId(), null, clientIp);
    }

    // --- internals ---------------------------------------------------------

    private void applyDetails(ExpenseRequest request, Expense expense) {
        expense.setDescription(blankToNull(request.description()));
        expense.setReferenceNumber(blankToNull(request.referenceNumber()));
        expense.setTaxDeductible(request.taxDeductible());
        expense.setStatus(request.status());
    }

    /** Null stays null — it means the business as a whole, not a missing branch. */
    private UUID resolveOutlet(UUID outletId) {
        if (outletId == null) return null;
        if (!outlets.existsById(outletId)) throw new OutletNotFoundException(outletId);
        return outletId;
    }

    private Expense find(UUID id) {
        return expenses.findById(id).orElseThrow(AccountingException::expenseNotFound);
    }

    private ExpenseView view(Expense expense) {
        String outletName = expense.getOutletId() == null ? null
                : outlets.findById(expense.getOutletId()).map(o -> o.getName()).orElse(null);
        String userName = users.findById(expense.getRecordedBy())
                .map(u -> u.getFullName()).orElse(null);
        return ExpenseView.of(expense, outletName, userName);
    }

    private Map<UUID, String> outletNames(List<Expense> rows) {
        Set<UUID> ids = rows.stream().map(Expense::getOutletId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) return Map.of();
        return outlets.findAllById(ids).stream()
                .collect(Collectors.toMap(o -> o.getId(), o -> o.getName()));
    }

    private Map<UUID, String> userNames(List<Expense> rows) {
        Set<UUID> ids = rows.stream().map(Expense::getRecordedBy)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) return Map.of();
        return users.findAllById(ids).stream()
                .collect(Collectors.toMap(u -> u.getId(), u -> u.getFullName(),
                        (first, second) -> first));
    }

    /** BR-15: what the audit log records about an expense. */
    private Map<String, Object> snapshot(Expense expense) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("spentOn", expense.getSpentOn().toString());
        state.put("category", expense.getCategory().name());
        state.put("title", expense.getTitle());
        state.put("amountPesewas", expense.getAmountPesewas());
        state.put("payee", expense.getPayee());
        state.put("paymentMethod", expense.getPaymentMethod().name());
        state.put("status", expense.getStatus());
        state.put("taxDeductible", expense.isTaxDeductible());
        if (expense.getOutletId() != null) state.put("outletId", expense.getOutletId().toString());
        if (expense.getReferenceNumber() != null) state.put("reference", expense.getReferenceNumber());
        if (expense.isVoided()) {
            state.put("voided", true);
            if (expense.getVoidReason() != null) state.put("voidReason", expense.getVoidReason());
        }
        return state;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
