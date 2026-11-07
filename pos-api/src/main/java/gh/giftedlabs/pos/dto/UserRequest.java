package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.*;

import java.util.List;
import java.util.UUID;

/**
 * Creating or editing a staff account — FR-USER-01, FR-USER-04.
 *
 * <p>{@code password} and {@code pin} are write-only and optional on edit:
 * omitting them leaves what is already set, so saving a phone number does not
 * silently clear someone's PIN.
 */
public record UserRequest(

        @NotBlank(message = "Enter a username")
        @Pattern(regexp = "[a-zA-Z0-9._-]{3,40}",
                message = "A username is 3-40 letters, digits, dot, dash or underscore")
        String username,

        @NotBlank(message = "Enter the person's full name") @Size(max = 120) String fullName,

        @Email(message = "Enter a valid email") @Size(max = 320) String email,
        @Size(max = 40) String phone,

        /** Required on create; leave blank on edit to keep the current one. */
        @Size(min = 8, max = 256, message = "A password needs at least 8 characters") String password,

        /** FR-AUTH-02: 4-6 digits, for counter approvals and unlocking. */
        @Pattern(regexp = "\\d{4,6}", message = "A PIN is 4 to 6 digits") String pin,

        @NotEmpty(message = "Give the person at least one role") List<String> roles,

        @NotEmpty(message = "Assign the person to at least one branch") List<UUID> outletIds) {
}
