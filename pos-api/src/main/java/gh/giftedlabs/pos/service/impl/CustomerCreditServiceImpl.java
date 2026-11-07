package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.CustomerStatement;
import gh.giftedlabs.pos.entity.Customer;
import gh.giftedlabs.pos.entity.InstallmentPlan;
import gh.giftedlabs.pos.entity.InstallmentScheduleItem;
import gh.giftedlabs.pos.repository.CustomerRepository;
import gh.giftedlabs.pos.repository.InstallmentPlanRepository;
import gh.giftedlabs.pos.service.CustomerCreditService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * FR-CUST-07: credit limits, balances, ageing and statements.
 *
 * <p>Everything here is derived from the installment plans. Nothing about a
 * customer's balance is stored, and that is the design rather than an omission:
 * a stored balance is a second record of money the plans already describe, and
 * the first payment posted outside whichever path maintained it would put the
 * two out of step — with a shop refusing credit to somebody who had paid, or
 * extending it to somebody who had not. The same reasoning that keeps received
 * quantity off a purchase order.
 */
@Service
public class CustomerCreditServiceImpl implements CustomerCreditService {

    /** Africa/Accra, like every other date this application reasons about. */
    private static final ZoneId ZONE = ZoneId.of("Africa/Accra");

    private final CustomerRepository customers;
    private final InstallmentPlanRepository plans;
    private final Clock clock;

    public CustomerCreditServiceImpl(CustomerRepository customers,
                                     InstallmentPlanRepository plans,
                                     Clock clock) {
        this.customers = customers;
        this.plans = plans;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public CustomerStatement statement(UUID customerId) {
        Customer customer = customers.findById(customerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such customer"));

        LocalDate today = LocalDate.now(clock.withZone(ZONE));
        List<InstallmentPlan> open = plans.list(null, customerId).stream()
                .filter(plan -> plan.getStatus() != InstallmentPlan.Status.COMPLETED)
                .toList();

        long current = 0;
        long upTo30 = 0;
        long upTo60 = 0;
        long over60 = 0;

        List<CustomerStatement.PlanLine> lines = new java.util.ArrayList<>();
        for (InstallmentPlan plan : open) {
            long paid = plan.getSchedule().stream()
                    .mapToLong(InstallmentScheduleItem::getPaidPesewas).sum()
                    + plan.getDownPaymentPesewas();
            long outstanding = Math.max(0L, plan.getTotalPesewas() - paid);

            // A plan is as late as its *earliest* arrears, not its most recent.
            LocalDate oldestDue = plan.getSchedule().stream()
                    .filter(item -> item.getStatus() != InstallmentScheduleItem.Status.PAID)
                    .map(InstallmentScheduleItem::getDueDate)
                    .min(LocalDate::compareTo)
                    .orElse(null);

            int daysLate = oldestDue == null || !oldestDue.isBefore(today)
                    ? 0
                    : (int) ChronoUnit.DAYS.between(oldestDue, today);

            if (daysLate <= 0) current += outstanding;
            else if (daysLate <= 30) upTo30 += outstanding;
            else if (daysLate <= 60) upTo60 += outstanding;
            else over60 += outstanding;

            lines.add(new CustomerStatement.PlanLine(
                    plan.getId(), plan.getPlanNumber(), plan.getStatus().name(),
                    major(plan.getTotalPesewas()), major(paid), major(outstanding),
                    oldestDue, daysLate, plan.getCreatedAt()));
        }

        long balance = current + upTo30 + upTo60 + over60;
        BigDecimal limit = customer.getCreditLimit();
        BigDecimal owed = major(balance);
        BigDecimal available = limit.subtract(owed).max(BigDecimal.ZERO);

        return new CustomerStatement(
                customer.getId(), customer.getName(), customer.getPhone(),
                limit, owed, available, owed.compareTo(limit) > 0,
                new CustomerStatement.Ageing(
                        major(current), major(upTo30), major(upTo60), major(over60)),
                lines, clock.instant());
    }

    /**
     * BR-16-style enforcement for money rather than rights: the ceiling is
     * checked against what is owed *now*, at the moment the plan is written.
     *
     * <p>Called inside the caller's transaction on purpose. Checking the
     * balance and then writing the plan in two transactions is exactly how two
     * plans raised at the same moment both pass a limit that only one of them
     * fits under.
     */
    @Override
    @Transactional(readOnly = true)
    public void requireWithinLimit(UUID customerId, long additionalPesewas) {
        if (additionalPesewas <= 0) return;

        Customer customer = customers.findById(customerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such customer"));

        BigDecimal limit = customer.getCreditLimit();
        if (limit.signum() <= 0) {
            // No limit set, so nothing to enforce.
            //
            // The other reading — zero means no credit — is the commercially
            // safer one and is wrong here. The column defaults to zero, so on
            // the upgrade that adds it every existing customer would have a
            // zero limit, and a shop that has been running installment plans
            // for months would be unable to create one until somebody set a
            // limit for each customer by hand. A new control must not retire a
            // working feature.
            //
            // A limit therefore does its job from the moment an owner sets one,
            // which is what setting one means.
            return;
        }

        BigDecimal balance = statement(customerId).balance();
        BigDecimal wouldOwe = balance.add(major(additionalPesewas));
        if (wouldOwe.compareTo(limit) > 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    ("%s would owe GH₵%s against a GH₵%s limit. "
                            + "Take a larger deposit, or raise the limit.")
                            .formatted(customer.getName(),
                                    wouldOwe.toPlainString(), limit.toPlainString()));
        }
    }

    private BigDecimal major(long pesewas) {
        return BigDecimal.valueOf(pesewas).movePointLeft(2).setScale(2, java.math.RoundingMode.HALF_UP);
    }
}
