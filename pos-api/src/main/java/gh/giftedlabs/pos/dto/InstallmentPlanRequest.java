package gh.giftedlabs.pos.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Agreeing an installment plan.
 *
 * <p>The total is sent rather than derived from the lines. The shop may agree a
 * figure that is not the arithmetic sum — a rounded-down deal on a big order is
 * normal — and recomputing it here would silently overwrite what was actually
 * agreed with the customer.
 */
public record InstallmentPlanRequest(

        @NotNull(message = "Choose the customer this plan is for")
        UUID customerId,

        @NotNull(message = "A plan belongs to the branch that released the goods")
        UUID outletId,

        /** Set when the goods went out against a completed sale. */
        UUID saleId,

        /** BR-11: pesewas. */
        @NotNull(message = "Enter the total being spread")
        @Min(value = 1, message = "A plan has to be for more than nothing")
        Long totalPesewas,

        @NotNull @Min(value = 0, message = "A down payment cannot be negative")
        Long downPaymentPesewas,

        @NotBlank @Pattern(regexp = "WEEKLY|BIWEEKLY|MONTHLY|weekly|biweekly|monthly",
                message = "Choose weekly, biweekly or monthly")
        String frequency,

        @NotNull @Min(value = 1, message = "A plan needs at least one installment")
        @Max(value = 60, message = "A plan cannot run past 60 installments")
        Integer installmentCount,

        @NotNull(message = "Enter the date the first installment falls due")
        LocalDate startDate,

        @Size(max = 1000) String notes,

        @Valid List<Line> items) {

    /** What was bought, as agreed. Frozen onto the plan. */
    public record Line(
            UUID productId,
            @NotBlank @Size(max = 300) String productName,
            @NotNull @DecimalMin(value = "0.001", message = "A line needs a quantity") BigDecimal quantity,
            @NotNull @DecimalMin(value = "0") BigDecimal unitPrice,
            @NotNull @Min(0) Long lineTotalPesewas) {
    }
}
