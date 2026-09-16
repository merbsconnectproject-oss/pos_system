package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.Expense;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.Map;

/**
 * An expense as the screen reads it.
 *
 * <p>The category and payment method carry both the key and the label, so the
 * screen renders what an owner recognises without keeping its own translation
 * table that can drift from the server's.
 */
public record ExpenseView(
        UUID id,
        LocalDate spentOn,
        String category,
        String categoryLabel,
        String title,
        String description,
        long amountPesewas,
        UUID outletId,
        String outletName,
        String payee,
        String paymentMethod,
        String paymentMethodLabel,
        String referenceNumber,
        boolean taxDeductible,
        String status,
        UUID recordedBy,
        String recordedByName,
        Instant createdAt) {

    public static ExpenseView of(Expense expense, String outletName, String recordedByName) {
        return new ExpenseView(
                expense.getId(),
                expense.getSpentOn(),
                expense.getCategory().name(),
                expense.getCategory().label(),
                expense.getTitle(),
                expense.getDescription(),
                expense.getAmountPesewas(),
                expense.getOutletId(),
                outletName,
                expense.getPayee(),
                expense.getPaymentMethod().name(),
                expense.getPaymentMethod().label(),
                expense.getReferenceNumber(),
                expense.isTaxDeductible(),
                expense.getStatus(),
                expense.getRecordedBy(),
                recordedByName,
                expense.getCreatedAt());
    }

    /**
     * The list plus the totals the screen shows above it.
     *
     * <p>Totalled by the database over the period rather than by the browser over
     * the page it happens to have, which is the bug this whole module replaces:
     * an expense total computed from a list that only held what had been loaded.
     *
     * @param paidPesewas    money actually gone
     * @param pendingPesewas committed and not yet paid — counted apart, because
     *                       treating an unpaid invoice as spent overstates the
     *                       month and then double-counts it when it is paid
     */
    public record Page(
            List<ExpenseView> expenses,
            long paidPesewas,
            long pendingPesewas,
            long taxDeductiblePesewas,
            Map<String, Long> byCategoryPesewas) {
    }
}
