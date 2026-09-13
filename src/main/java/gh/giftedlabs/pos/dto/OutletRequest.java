package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Creating or editing a branch — FR-OUT-02 · `K-04`.
 *
 * <p>The pattern on {@code code} is BR-6's, not a style preference: the value
 * becomes the {@code {OUTLET}} segment of every receipt this branch prints, so
 * a hyphen in it produces {@code RAD-01-01-004312} — four segments, terminal
 * twice — and a number that cannot be parsed back.
 */
public record OutletRequest(

        @NotBlank(message = "Enter a receipt code")
        @Pattern(regexp = "[A-Za-z0-9]{2,6}",
                message = "Use 2-6 letters or digits and no hyphen, as in INC")
        String code,

        @NotBlank(message = "Enter the branch name")
        @Size(max = 120)
        String name,

        @Size(max = 120) String tradingName,

        @NotBlank(message = "Enter the town")
        @Size(max = 120)
        String town,

        @Size(max = 240) String address,
        @Size(max = 40) String phone,
        @Size(max = 120) String managerName,
        @Size(max = 400) String receiptFooter,
        @Size(max = 500) String logoUrl) {
}
