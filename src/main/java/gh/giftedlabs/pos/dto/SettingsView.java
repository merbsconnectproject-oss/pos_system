package gh.giftedlabs.pos.dto;

import gh.giftedlabs.pos.entity.BusinessSettings;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/**
 * Settings as the frontend's {@code GeneralSettings} expects them — FR-SET.
 *
 * <p>There is no manager PIN on this record and there is not meant to be. The
 * screen used to keep one shared four-digit code, which makes every approval
 * read "approved by whoever knew the PIN" — approvals are checked against each
 * approver's own PIN by {@code POST /api/auth/approve} instead.
 */
public record SettingsView(
        String companyName,
        String tradingName,
        String taxRegistrationNumber,
        String phone,
        String email,
        String address,
        String logoUrl,

        boolean taxEnabled,
        BigDecimal taxRatePercent,
        String currencyCode,
        String currencySymbol,
        String cashRounding,

        String receiptHeaderMessage,
        String receiptFooterPolicy,
        String receiptPrinterWidth,
        boolean autoPrintReceipt,
        boolean showCashierOnReceipt,

        String accentColor,
        String fontFamily,
        int fontScalePercent,

        Thresholds thresholds,

        boolean enforceFloorPriceApproval,
        boolean enforceVoidApproval,
        boolean enforceBlindShiftCount,

        Instant updatedAt) {

    /**
     * FR-SET-06. Amounts are pesewas on the wire like everywhere else; the
     * ceilings are percentages keyed by role key.
     */
    public record Thresholds(
            int idleLockMinutes,
            long adjustmentApprovalPesewas,
            long cashVariancePesewas,
            Map<String, BigDecimal> discountCeilingByRole) {
    }

    public static SettingsView of(BusinessSettings settings, Map<String, BigDecimal> ceilings) {
        return new SettingsView(
                settings.getCompanyName(),
                settings.getTradingName(),
                settings.getTaxRegistrationNumber(),
                settings.getPhone(),
                settings.getEmail(),
                settings.getAddress(),
                settings.getLogoUrl(),
                settings.isTaxEnabled(),
                settings.getTaxRatePercent(),
                settings.getCurrencyCode(),
                settings.getCurrencySymbol(),
                settings.getCashRounding().name(),
                settings.getReceiptHeaderMessage(),
                settings.getReceiptFooterPolicy(),
                settings.getReceiptPrinterWidth(),
                settings.isAutoPrintReceipt(),
                settings.isShowCashierOnReceipt(),
                settings.getAccentColor(),
                settings.getFontFamily().name(),
                settings.getFontScalePercent(),
                new Thresholds(settings.getIdleLockMinutes(),
                        settings.getAdjustmentApprovalPesewas(),
                        settings.getCashVariancePesewas(),
                        ceilings),
                settings.isEnforceFloorPriceApproval(),
                settings.isEnforceVoidApproval(),
                settings.isEnforceBlindShiftCount(),
                settings.getUpdatedAt());
    }
}
