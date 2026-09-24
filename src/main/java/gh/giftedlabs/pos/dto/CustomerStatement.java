package gh.giftedlabs.pos.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * FR-CUST-07: what a customer owes, how old it is, and what they have paid.
 *
 * <p>Every figure is summed on read from the customer's installment plans.
 * There is no stored balance, deliberately: a second record of the same money
 * would only have to disagree once for the shop to refuse credit to somebody
 * who had already paid, or extend it to somebody who had not.
 *
 * @param creditLimit  the ceiling the owner set. Zero means no credit.
 * @param balance      still owed across plans that are not completed
 * @param available    limit less balance, floored at zero — what a new plan may
 *                     be worth today
 * @param overLimit    true when the balance already exceeds the limit, which can
 *                     happen after a limit is lowered rather than only by a sale
 */
public record CustomerStatement(
        UUID customerId,
        String customerName,
        String customerPhone,
        BigDecimal creditLimit,
        BigDecimal balance,
        BigDecimal available,
        boolean overLimit,
        /** FR-CUST-07: the balance split by how late its oldest unpaid instalment is. */
        Ageing ageing,
        List<PlanLine> plans,
        Instant asOf) {

    /**
     * The ageing buckets a shop chases by.
     *
     * <p>A plan sits in exactly one bucket, decided by its <em>oldest</em>
     * unpaid instalment — a plan is as late as its earliest arrears, not its
     * most recent one.
     */
    public record Ageing(
            BigDecimal current,
            BigDecimal upTo30Days,
            BigDecimal upTo60Days,
            BigDecimal over60Days) {
    }

    /** One plan on the statement. */
    public record PlanLine(
            UUID planId,
            String planNumber,
            String status,
            BigDecimal total,
            BigDecimal paid,
            BigDecimal outstanding,
            /** Null when nothing is unpaid — a completed plan is not overdue. */
            LocalDate oldestUnpaidDue,
            int daysLate,
            Instant createdAt) {
    }
}
