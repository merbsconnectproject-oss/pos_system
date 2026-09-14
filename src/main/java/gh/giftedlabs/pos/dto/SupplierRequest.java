package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/** FR-SUP-01. */
public record SupplierRequest(
        @NotBlank(message = "Enter the supplier name") @Size(max = 200) String name,
        @Size(max = 120) String contactPerson,
        @Size(max = 40) String phone,
        @Email(message = "Enter a valid email") @Size(max = 320) String email,
        @Size(max = 300) String address,
        @Size(max = 60) String paymentTerms,
        @Size(max = 1000) String notes,
        @Size(max = 120) String categorySupplied,
        /** Null means the supplier serves every branch. */
        UUID outletId) {
}
