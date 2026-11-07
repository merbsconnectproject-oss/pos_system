package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Recording or amending an operating expense.
 *
 * <p>The amount arrives in pesewas, like every amount on this API (BR-11). The
 * screen types "1,200.50" and multiplies; sending a decimal here and rounding
 * server-side would put a second rounding rule in the system, and the P&L has
 * to tie to the sales figures exactly.
 */
public record ExpenseRequest(

        /**
         * When the money was spent — not today by default.
         *
         * <p>Required, because an expense entered a week late and stamped with
         * today's date lands in the wrong month's P&L, and nobody would ever
         * notice.
         */
        @NotNull(message = "Enter the date the money was spent")
        @PastOrPresent(message = "An expense cannot be dated in the future")
        LocalDate spentOn,

        @NotBlank(message = "Choose a category")
        @Pattern(regexp = "RENT_LEASE|UTILITIES_POWER|STAFF_PAYROLL|DELIVERY_HAULAGE"
                + "|ADVERTISING_MARKETING|MAINTENANCE_REPAIRS|PACKAGING_BAGS"
                + "|TAXES_LEVIES_LICENSES|OFFICE_COMMUNICATION|MISCELLANEOUS",
                message = "Choose one of the listed expense categories")
        String category,

        @NotBlank(message = "Give the expense a title")
        @Size(max = 200) String title,

        @Size(max = 1000) String description,

        /** BR-11: pesewas. Zero is not an expense; a refund is not one either. */
        @NotNull(message = "Enter the amount")
        @Min(value = 1, message = "An expense has to be more than nothing")
        Long amountPesewas,

        /** Null means the business as a whole rather than one shop. */
        UUID outletId,

        @NotBlank(message = "Enter who was paid")
        @Size(max = 200) String payee,

        @NotBlank(message = "Choose how it was paid")
        @Pattern(regexp = "CASH_DRAWER|MOBILE_MONEY|BANK_TRANSFER|CHEQUE|CORPORATE_CARD",
                message = "Choose how the expense was paid")
        String paymentMethod,

        @Size(max = 80) String referenceNumber,

        boolean taxDeductible,

        /** PENDING is owed and not yet paid; the P&L keeps the two apart. */
        @NotBlank @Pattern(regexp = "PAID|PENDING", message = "An expense is either PAID or PENDING")
        String status) {
}
