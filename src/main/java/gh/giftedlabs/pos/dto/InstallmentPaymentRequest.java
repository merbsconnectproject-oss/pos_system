package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.*;

import java.time.LocalDate;

/**
 * Taking a payment against a plan.
 *
 * <p>No installment number. A customer hands over money against the <em>plan</em>,
 * not against a row somebody chose in a dropdown, and the server applies it to
 * the oldest unpaid installment first. Letting the counter pick would let a
 * later installment be settled while an earlier one stayed open, which makes
 * "what is overdue" meaningless.
 */
public record InstallmentPaymentRequest(

        /** BR-11: pesewas. */
        @NotNull(message = "Enter the amount received")
        @Min(value = 1, message = "A payment has to be more than nothing")
        Long amountPesewas,

        @NotNull(message = "Enter the date the money was received")
        @PastOrPresent(message = "A payment cannot be dated in the future")
        LocalDate receivedOn,

        /**
         * The four the till takes. Matches {@code PaymentMethod} in the frontend
         * exactly — a fifth here would be a value no screen could ever send and
         * none could display.
         */
        @NotBlank(message = "Choose how it was paid")
        @Pattern(regexp = "CASH|CARD|MOBILE_MONEY|BANK_TRANSFER",
                message = "Choose how the payment was made")
        String paymentMethod,

        @Size(max = 80) String reference) {
}
