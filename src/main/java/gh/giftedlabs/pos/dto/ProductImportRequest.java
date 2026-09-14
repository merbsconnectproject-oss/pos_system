package gh.giftedlabs.pos.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Mapped, previewed catalogue rows ready for the authoritative commit — FR-PROD-10. */
public record ProductImportRequest(
        @NotEmpty(message = "Choose at least one valid row")
        @Size(max = 5000, message = "Import at most 5,000 products at once")
        List<@Valid ProductRequest> products) {
}
