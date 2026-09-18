import { DEFAULT_ACCENT } from './accent';
import type { GeneralSettings } from './types';

/**
 * Safe application defaults used before authenticated settings are available.
 *
 * These values contain no business identity or records. The authenticated app
 * remains behind the workspace loading gate until the server settings arrive;
 * this object only gives the sign-in and loading screens stable presentation.
 */
export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  companyName: '',
  taxRegistrationNumber: '',
  taxEnabled: false,
  taxRatePercent: 0,
  currencySymbol: 'GH₵',
  currencyCode: 'GHS',
  cashRounding: 'exact',
  managerPin: '',
  enforceFloorPricePin: true,
  enforceVoidPin: true,
  enforceBlindShiftCount: true,
  receiptPrinterWidth: '80mm',
  receiptHeaderMessage: '',
  receiptFooterPolicy: '',
  autoPrintReceipt: true,
  showCashierOnReceipt: true,
  accentColor: DEFAULT_ACCENT,
  fontFamily: 'JAKARTA',
  fontScalePercent: 100,
  cloudSyncIntervalMinutes: 15,
  thresholds: {
    idleLockMinutes: 10,
    adjustmentApprovalValue: 500,
    cashVarianceExplain: 20,
    discountCeilingByRole: {
      owner: 100,
      manager: 25,
      cashier: 10,
      storekeeper: 0,
    },
  },
};
