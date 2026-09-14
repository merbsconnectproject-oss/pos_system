package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

/**
 * Creating or editing a customer — FR-CUST-02, FR-CUST-03.
 *
 * <p>Only a name and a number are required. A counter serving somebody at the
 * till has the number in front of them and rarely anything else, and a form
 * that demands an address is a form that gets a made-up one.
 */
public record CustomerRequest(

        @NotBlank(message = "Enter the customer's name")
        @Size(max = 200) String name,

        @NotBlank(message = "Enter a phone number — it is how they are found again")
        @Size(max = 40) String phone,

        @Email(message = "Enter a valid email address") @Size(max = 320) String email,
        @Size(max = 240) String address,

        /** FR-CUST-04: retail, electrician, contractor or company. */
        @NotBlank(message = "Choose a customer type")
        @Pattern(regexp = "retail|electrician|contractor|company",
                message = "Choose retail, electrician, contractor or company")
        String type,

        /**
         * FR-PRICE-05: their standing discount.
         *
         * <p>Null means "whatever this type starts on" — which is not the same
         * as zero. A contractor saved with no rate should get the contractor
         * rate, not lose it because the field was left alone.
         */
        @DecimalMin(value = "0", message = "A discount cannot be negative")
        @DecimalMax(value = "100", message = "A discount cannot exceed 100%")
        BigDecimal discountRate,

        @Size(max = 1000) String notes) {
}
