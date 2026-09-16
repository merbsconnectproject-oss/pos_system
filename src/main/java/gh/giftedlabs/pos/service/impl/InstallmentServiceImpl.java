package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.InstallmentPaymentRequest;
import gh.giftedlabs.pos.dto.InstallmentPlanRequest;
import gh.giftedlabs.pos.dto.InstallmentPlanView;
import gh.giftedlabs.pos.entity.*;
import gh.giftedlabs.pos.exception.AccountingException;
import gh.giftedlabs.pos.exception.OutletNotFoundException;
import gh.giftedlabs.pos.repository.CustomerRepository;
import gh.giftedlabs.pos.repository.InstallmentPlanRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.rules.InstallmentFrequency;
import gh.giftedlabs.pos.rules.InstallmentSchedule;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.InstallmentService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Installment plans.
 *
 * <p>Two rules carry the feature. A payment goes to the <em>oldest</em> unpaid
 * installment first, so "what is overdue" stays a meaningful question; and the
 * outstanding balance is always recomputed from the schedule rather than stored,
 * so it cannot drift from the payments.
 */
@Service
public class InstallmentServiceImpl implements InstallmentService {

    private final InstallmentPlanRepository plans;
    private final CustomerRepository customers;
    private final OutletRepository outlets;
    private final AuditService audit;
    private final Clock clock;

    public InstallmentServiceImpl(InstallmentPlanRepository plans, CustomerRepository customers,
                                 OutletRepository outlets, AuditService audit, Clock clock) {
        this.plans = plans;
        this.customers = customers;
        this.outlets = outlets;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public InstallmentPlanView.Page list(UUID outletId, UUID customerId) {
        List<InstallmentPlan> rows = plans.list(outletId, customerId);
        LocalDate today = today();

        Map<UUID, Customer> customerById = customersFor(rows);
        Map<UUID, String> outletNames = outletNamesFor(rows);

        List<InstallmentPlanView> views = rows.stream()
                .map(plan -> view(plan, customerById.get(plan.getCustomerId()),
                        outletNames.get(plan.getOutletId()), today))
                .toList();

        // Only live debt counts towards what the book is owed. A completed plan
        // owes nothing and a written-off one is not going to be collected, so
        // including either would overstate what the shop can expect.
        long outstanding = views.stream()
                .filter(view -> "ACTIVE".equals(view.status()))
                .mapToLong(InstallmentPlanView::outstandingPesewas).sum();
        long overdue = views.stream()
                .filter(view -> "ACTIVE".equals(view.status()))
                .mapToLong(InstallmentPlanView::overduePesewas).sum();

        int active = (int) views.stream().filter(view -> "ACTIVE".equals(view.status())).count();
        int overdueCount = (int) views.stream()
                .filter(view -> "ACTIVE".equals(view.status()) && view.hasOverdue()).count();

        return new InstallmentPlanView.Page(views, outstanding, overdue, active, overdueCount);
    }

    @Override
    @Transactional(readOnly = true)
    public InstallmentPlanView get(UUID id) {
        InstallmentPlan plan = plans.findWithDetail(id).orElseThrow(AccountingException::planNotFound);
        return view(plan, customers.findById(plan.getCustomerId()).orElse(null),
                outletName(plan.getOutletId()), today());
    }

    @Override
    @Transactional
    public InstallmentPlanView create(InstallmentPlanRequest request, PosPrincipal actor, String clientIp) {
        Customer customer = customers.findById(request.customerId())
                .orElseThrow(() -> new IllegalArgumentException("That customer no longer exists"));
        if (!outlets.existsById(request.outletId())) {
            throw new OutletNotFoundException(request.outletId());
        }

        long total = request.totalPesewas();
        long down = request.downPaymentPesewas();
        if (down > total) throw AccountingException.downPaymentTooLarge(down, total);

        InstallmentFrequency frequency = InstallmentFrequency.ofKey(request.frequency())
                .orElseThrow(() -> new IllegalArgumentException("Unknown frequency: " + request.frequency()));

        // BR-11: the installments have to sum to the balance exactly. The rule
        // lives in InstallmentSchedule so it can be asserted without a database.
        List<InstallmentSchedule.Due> due = InstallmentSchedule.split(
                total - down, request.installmentCount(), request.startDate(), frequency);

        InstallmentPlan plan = new InstallmentPlan(nextPlanNumber(), customer.getId(),
                request.outletId(), total, down, frequency, request.installmentCount(),
                request.startDate(), actor.userId(), clock.instant());
        plan.setSaleId(request.saleId());
        plan.setNotes(request.notes() == null || request.notes().isBlank() ? null : request.notes().trim());

        due.forEach(item -> plan.addScheduleItem(
                new InstallmentScheduleItem(item.installmentNumber(), item.dueDate(), item.expectedPesewas())));

        if (request.items() != null) {
            request.items().forEach(line -> plan.addItem(new InstallmentPlanItem(
                    line.productId(), line.productName().trim(), line.quantity(),
                    line.unitPrice(), line.lineTotalPesewas())));
        }

        // A plan settled by its own down payment is COMPLETED on creation rather
        // than ACTIVE with nothing owing.
        plan.recomputeStatus();

        InstallmentPlan saved = plans.save(plan);
        audit.record(actor.userId(), "INSTALLMENT_PLAN_CREATED", "installment_plan", saved.getId(),
                null, snapshot(saved), saved.getOutletId(), null, clientIp);

        return view(saved, customer, outletName(saved.getOutletId()), today());
    }

    /**
     * Oldest installment first.
     *
     * <p>A payment spills forward across installments — GH₵200 against two
     * GH₵150 dues settles the first and puts 50 on the second — because that is
     * what handing over money against a debt means. Letting the counter choose
     * which row to credit would allow a later installment to be settled while an
     * earlier one stayed open, and then nothing could be said about what is late.
     */
    @Override
    @Transactional
    public InstallmentPlanView recordPayment(UUID id, InstallmentPaymentRequest request,
                                             PosPrincipal actor, String clientIp) {
        InstallmentPlan plan = plans.findWithDetail(id).orElseThrow(AccountingException::planNotFound);

        if (plan.getStatus() != InstallmentPlan.Status.ACTIVE) {
            throw AccountingException.planNotActive(plan.getStatus().name());
        }

        long outstanding = plan.outstandingPesewas();
        long amount = request.amountPesewas();
        if (amount > outstanding) throw AccountingException.overpayment(amount, outstanding);

        Map<String, Object> before = snapshot(plan);

        long left = amount;
        List<InstallmentScheduleItem> ordered = plan.getSchedule().stream()
                .sorted(Comparator.comparingInt(InstallmentScheduleItem::getInstallmentNumber))
                .toList();

        for (InstallmentScheduleItem item : ordered) {
            if (left <= 0) break;
            long wanted = item.remainingPesewas();
            if (wanted <= 0) continue;
            long applied = Math.min(left, wanted);
            item.apply(applied, request.receivedOn(), request.paymentMethod(), request.reference());
            left -= applied;
        }

        plan.recomputeStatus();
        plan.touch(clock.instant());

        audit.record(actor.userId(), "INSTALLMENT_PAYMENT_RECEIVED", "installment_plan", id,
                before, snapshot(plan), plan.getOutletId(), null, clientIp);

        return view(plan, customers.findById(plan.getCustomerId()).orElse(null),
                outletName(plan.getOutletId()), today());
    }

    @Override
    @Transactional
    public InstallmentPlanView setDefaulted(UUID id, boolean defaulted, String reason,
                                            PosPrincipal actor, String clientIp) {
        InstallmentPlan plan = plans.findWithDetail(id).orElseThrow(AccountingException::planNotFound);
        Map<String, Object> before = snapshot(plan);

        if (defaulted) plan.markDefaulted(); else plan.reinstate();
        plan.touch(clock.instant());

        Map<String, Object> after = new LinkedHashMap<>(snapshot(plan));
        if (reason != null && !reason.isBlank()) after.put("reason", reason.trim());

        audit.record(actor.userId(),
                defaulted ? "INSTALLMENT_PLAN_DEFAULTED" : "INSTALLMENT_PLAN_REINSTATED",
                "installment_plan", id, before, after, plan.getOutletId(), null, clientIp);

        return view(plan, customers.findById(plan.getCustomerId()).orElse(null),
                outletName(plan.getOutletId()), today());
    }

    // --- internals ---------------------------------------------------------

    /** {@code INST-2026-000123} — readable, and unique without a scan. */
    private String nextPlanNumber() {
        return "INST-%d-%06d".formatted(today().getYear(), plans.nextPlanNumber());
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    private InstallmentPlanView view(InstallmentPlan plan, Customer customer, String outletName,
                                     LocalDate today) {
        return InstallmentPlanView.of(plan,
                customer == null ? null : customer.getName(),
                customer == null ? null : customer.getPhone(),
                outletName, today);
    }

    private String outletName(UUID outletId) {
        return outlets.findById(outletId).map(outlet -> outlet.getName()).orElse(null);
    }

    private Map<UUID, Customer> customersFor(List<InstallmentPlan> rows) {
        Set<UUID> ids = rows.stream().map(InstallmentPlan::getCustomerId).collect(Collectors.toSet());
        if (ids.isEmpty()) return Map.of();
        return customers.findAllById(ids).stream()
                .collect(Collectors.toMap(Customer::getId, customer -> customer));
    }

    private Map<UUID, String> outletNamesFor(List<InstallmentPlan> rows) {
        Set<UUID> ids = rows.stream().map(InstallmentPlan::getOutletId).collect(Collectors.toSet());
        if (ids.isEmpty()) return Map.of();
        return outlets.findAllById(ids).stream()
                .collect(Collectors.toMap(outlet -> outlet.getId(), outlet -> outlet.getName()));
    }

    /** BR-15. The balance is in here because it is what changed. */
    private Map<String, Object> snapshot(InstallmentPlan plan) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("planNumber", plan.getPlanNumber());
        state.put("totalPesewas", plan.getTotalPesewas());
        state.put("downPaymentPesewas", plan.getDownPaymentPesewas());
        state.put("paidPesewas", plan.paidPesewas());
        state.put("outstandingPesewas", plan.outstandingPesewas());
        state.put("status", plan.getStatus().name());
        state.put("installmentCount", plan.getInstallmentCount());
        state.put("frequency", plan.getFrequency().name());
        return state;
    }
}
