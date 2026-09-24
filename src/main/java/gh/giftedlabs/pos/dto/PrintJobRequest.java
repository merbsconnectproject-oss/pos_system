package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Raw ESC/POS already rendered by the receipt service. */
public record PrintJobRequest(
        @NotBlank @Size(max = 100) String receiptNumber,
        @NotBlank @Size(max = 1_400_000) String payload) {
}
