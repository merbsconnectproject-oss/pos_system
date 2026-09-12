package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * A sign-in attempt — FR-AUTH-01, FR-AUTH-03.
 *
 * @param identifier username or email; FR-AUTH-01 accepts either
 * @param password   plain text, over TLS, never logged
 * @param outletId   optional. A user assigned to one outlet is placed there
 *                   automatically, so the client may omit this and follow up
 *                   with a selection if the response asks for one
 */
public record SignInRequest(

        @NotBlank(message = "Enter your username or email")
        @Size(max = 320)
        String identifier,

        @NotBlank(message = "Enter your password")
        @Size(max = 256)
        String password,

        UUID outletId) {

    /** Never let a password reach a log or an error payload. */
    @Override
    public String toString() {
        return "SignInRequest[identifier=%s, outletId=%s]".formatted(identifier, outletId);
    }
}
