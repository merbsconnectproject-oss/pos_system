package gh.giftedlabs.pos.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** The subset a holder of settings.appearance may change — FR-SET-03. */
public record AppearanceSettingsRequest(
        @NotNull @Pattern(regexp = "#[0-9A-Fa-f]{6}", message = "Enter a colour as #RRGGBB")
        String accentColor,

        @NotNull @Pattern(regexp = "JAKARTA|SYSTEM|ARIAL|VERDANA|GEORGIA",
                message = "Choose one of the available fonts")
        String fontFamily,

        @Min(value = 90, message = "Font size cannot be below 90%")
        @Max(value = 130, message = "Font size cannot exceed 130%")
        int fontScalePercent) {
}
