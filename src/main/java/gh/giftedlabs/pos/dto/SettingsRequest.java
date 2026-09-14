package gh.giftedlabs.pos.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.Map;

/**
 * A settings change — FR-SET-01, FR-SET-03, FR-SET-06.
 *
 * <p>Every field is sent every time: this is one form with a Save button, and
 * a partial update would make a field the user cleared indistinguishable from
 * one the client forgot to send.
 */
public record SettingsRequest(

        @NotBlank(message = "Enter the registered business name")
        @Size(max = 200) String companyName,

        @Size(max = 200) String tradingName,
        @Size(max = 60) String taxRegistrationNumber,
        @Size(max = 40) String phone,
        @Email(message = "Enter a valid email address") @Size(max = 320) String email,
        @Size(max = 240) String address,
        @Size(max = 500) String logoUrl,

        boolean taxEnabled,

        @NotNull @DecimalMin(value = "0", message = "A tax rate cannot be negative")
        @DecimalMax(value = "100", message = "A tax rate cannot exceed 100%")
        BigDecimal taxRatePercent,

        @NotBlank @Size(min = 3, max = 3) String currencyCode,
        @NotBlank @Size(max = 8) String currencySymbol,

        @NotNull @Pattern(regexp = "EXACT|TEN_PESEWAS|FIFTY_PESEWAS",
                message = "Choose a rounding rule")
        String cashRounding,

        @Size(max = 400) String receiptHeaderMessage,
        @Size(max = 400) String receiptFooterPolicy,

        @NotNull @Pattern(regexp = "80mm|58mm", message = "Choose a paper width")
        String receiptPrinterWidth,

        boolean autoPrintReceipt,
        boolean showCashierOnReceipt,

        /** FR-SET-03: a hex colour, validated here so no screen can be painted #NaN. */
        @NotNull @Pattern(regexp = "#[0-9A-Fa-f]{6}", message = "Enter a colour as #RRGGBB")
        String accentColor,

        @NotNull @Valid Thresholds thresholds,

        boolean enforceFloorPriceApproval,
        boolean enforceVoidApproval,
        boolean enforceBlindShiftCount) {

    public record Thresholds(

            @Min(value = 1, message = "The idle lock must be at least a minute")
            @Max(value = 480, message = "An idle lock beyond eight hours is no lock at all")
            int idleLockMinutes,

            @PositiveOrZero(message = "A threshold cannot be negative")
            long adjustmentApprovalPesewas,

            @PositiveOrZero(message = "A threshold cannot be negative")
            long cashVariancePesewas,

            /** FR-POS-10: role key to the largest discount percentage it may apply. */
            Map<String, BigDecimal> discountCeilingByRole) {
    }
}
