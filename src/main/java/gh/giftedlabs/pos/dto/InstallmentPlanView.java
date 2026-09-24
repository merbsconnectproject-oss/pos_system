package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.InstallmentPlan;
import gh.giftedlabs.pos.entity.InstallmentPlanItem;
import gh.giftedlabs.pos.entity.InstallmentScheduleItem;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * A plan as the counter reads it.
 *
 * <p>{@code outstandingPesewas} and every {@code OVERDUE} come from the server.
 * They are the two figures a shop makes decisions on, and a browser computing
 * them from a partially loaded list is how the screen this replaces managed to
 * show a customer owing nothing.
 */
public record InstallmentPlanView(
        UUID id,
        String planNumber,
        UUID customerId,
        String customerName,
        String customerPhone,
        UUID outletId,
        String outletName,
        UUID saleId,
        long totalPesewas,
        long downPaymentPesewas,
        long paidPesewas,
        long outstandingPesewas,
        String frequency,
        int installmentCount,
        LocalDate startDate,
        String status,
        boolean hasOverdue,
        long overduePesewas,
        LocalDate nextDueDate,
        String notes,
        Instant createdAt,
        List<Line> items,
        List<Installment> schedule,
        List<Payment> payments) {

    public record Line(
            UUID productId,
            String productName,
            BigDecimal quantity,
            BigDecimal unitPrice,
            long lineTotalPesewas) {

        static Line of(InstallmentPlanItem item) {
            return new Line(item.getProductId(), item.getProductName(), item.getQuantity(),
                    item.getUnitPrice(), item.getLineTotalPesewas());
        }
    }

    /** {@code overdue} is today against the due date, computed on every read. */
    public record Installment(
            int installmentNumber,
            LocalDate dueDate,
            long expectedPesewas,
            long paidPesewas,
            long remainingPesewas,
            LocalDate paidOn,
            String paymentMethod,
            String reference,
            String status,
            boolean overdue) {

        static Installment of(InstallmentScheduleItem item, LocalDate today) {
            return new Installment(item.getInstallmentNumber(), item.getDueDate(),
                    item.getExpectedPesewas(), item.getPaidPesewas(), item.remainingPesewas(),
                    item.getPaidOn(), item.getPaymentMethod(), item.getReference(),
                    item.getStatus().name(), item.isOverdue(today));
        }
    }

    /** One collection event; unlike a schedule total, this can be receipted again. */
    public record Payment(
            UUID id,
            String receiptNumber,
            long amountPesewas,
            long balanceAfterPesewas,
            LocalDate receivedOn,
            String paymentMethod,
            String reference,
            String cashierName,
            Instant createdAt) {

        static Payment of(gh.giftedlabs.pos.entity.InstallmentPayment payment) {
            return new Payment(payment.getId(), payment.getReceiptNumber(),
                    payment.getAmountPesewas(), payment.getBalanceAfterPesewas(),
                    payment.getReceivedOn(), payment.getPaymentMethod(), payment.getReference(),
                    payment.getCashierName(), payment.getCreatedAt());
        }
    }

    public static InstallmentPlanView of(InstallmentPlan plan, String customerName,
                                         String customerPhone, String outletName, LocalDate today) {
        List<Installment> schedule = plan.getSchedule().stream()
                .sorted(java.util.Comparator.comparingInt(InstallmentScheduleItem::getInstallmentNumber))
                .map(item -> Installment.of(item, today))
                .toList();

        long overdue = schedule.stream().filter(Installment::overdue)
                .mapToLong(Installment::remainingPesewas).sum();

        // The next thing the customer owes. Absent once the plan is settled.
        LocalDate nextDue = schedule.stream()
                .filter(item -> !"PAID".equals(item.status()))
                .map(Installment::dueDate)
                .findFirst().orElse(null);

        return new InstallmentPlanView(
                plan.getId(), plan.getPlanNumber(), plan.getCustomerId(), customerName, customerPhone,
                plan.getOutletId(), outletName, plan.getSaleId(),
                plan.getTotalPesewas(), plan.getDownPaymentPesewas(), plan.paidPesewas(),
                plan.outstandingPesewas(), plan.getFrequency().name(), plan.getInstallmentCount(),
                plan.getStartDate(), plan.getStatus().name(), overdue > 0, overdue, nextDue,
                plan.getNotes(), plan.getCreatedAt(),
                plan.getItems().stream().map(Line::of).toList(),
                schedule,
                plan.getPayments().stream()
                        .sorted(java.util.Comparator.comparing(
                                gh.giftedlabs.pos.entity.InstallmentPayment::getCreatedAt).reversed())
                        .map(Payment::of).toList());
    }

    /**
     * The list plus what the whole book is owed.
     *
     * @param outstandingPesewas across every active plan — the figure an owner
     *                           wants when deciding whether to let more goods go
     */
    public record Page(
            List<InstallmentPlanView> plans,
            long outstandingPesewas,
            long overduePesewas,
            int activeCount,
            int overdueCount) {
    }
}
