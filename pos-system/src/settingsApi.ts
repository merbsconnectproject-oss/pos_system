import { csrfHeader, errorMessage, request } from './apiClient';
import type { GeneralSettings, UserRole } from './types';

/**
 * Business settings — FR-SET.
 *
 * The thresholds here are not decoration. FR-INV-06, FR-POS-10 and FR-CASH-06
 * are enforced by the server against these values, so what this screen saves
 * changes what the till actually does.
 *
 * There is no manager PIN on the wire. A single shared code makes every
 * approval it authorises anonymous — approvals are checked against each
 * approver's own PIN by `POST /api/auth/approve`, and a person sets their own
 * with {@link setOwnPin}.
 */
const toMajor = (pesewas: number | null | undefined) => (pesewas ?? 0) / 100;
const toPesewas = (major: number) => Math.round((major || 0) * 100);

export interface SettingsWire {
  companyName: string | null;
  tradingName: string | null;
  taxRegistrationNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  taxEnabled: boolean;
  taxRatePercent: number;
  currencyCode: string;
  currencySymbol: string;
  cashRounding: 'EXACT' | 'TEN_PESEWAS' | 'FIFTY_PESEWAS';
  receiptHeaderMessage: string | null;
  receiptFooterPolicy: string | null;
  receiptPrinterWidth: '80mm' | '58mm';
  autoPrintReceipt: boolean;
  showCashierOnReceipt: boolean;
  accentColor: string;
  fontFamily: GeneralSettings['fontFamily'];
  fontScalePercent: number;
  cloudSyncIntervalMinutes: number;
  thresholds: {
    idleLockMinutes: number;
    adjustmentApprovalPesewas: number;
    cashVariancePesewas: number;
    discountCeilingByRole: Record<string, number>;
  };
  enforceFloorPriceApproval: boolean;
  enforceVoidApproval: boolean;
  enforceBlindShiftCount: boolean;
  updatedAt: string;
}

/** The app calls it '0.10'; the server names the coin. */
const ROUNDING_IN: Record<SettingsWire['cashRounding'], GeneralSettings['cashRounding']> = {
  EXACT: 'exact',
  TEN_PESEWAS: '0.10',
  FIFTY_PESEWAS: '0.50',
};
const ROUNDING_OUT: Record<GeneralSettings['cashRounding'], SettingsWire['cashRounding']> = {
  exact: 'EXACT',
  '0.10': 'TEN_PESEWAS',
  '0.50': 'FIFTY_PESEWAS',
};

const ceilings = (byRole: Record<string, number>): Record<UserRole, number> => ({
  owner: byRole.owner ?? 0,
  manager: byRole.manager ?? 0,
  cashier: byRole.cashier ?? 0,
  storekeeper: byRole.storekeeper ?? 0,
});

export const toGeneralSettings = (wire: SettingsWire): GeneralSettings => ({
  companyName: wire.companyName ?? '',
  logoUrl: wire.logoUrl ?? null,
  taxRegistrationNumber: wire.taxRegistrationNumber ?? '',
  taxEnabled: wire.taxEnabled,
  taxRatePercent: Number(wire.taxRatePercent ?? 0),
  currencySymbol: wire.currencySymbol,
  currencyCode: wire.currencyCode,
  cashRounding: ROUNDING_IN[wire.cashRounding],
  // FR-USER-01: nothing on the record is a credential, and the field stays
  // empty rather than carrying a placeholder somebody might trust.
  managerPin: '',
  enforceFloorPricePin: wire.enforceFloorPriceApproval,
  enforceVoidPin: wire.enforceVoidApproval,
  enforceBlindShiftCount: wire.enforceBlindShiftCount,
  receiptPrinterWidth: wire.receiptPrinterWidth,
  receiptHeaderMessage: wire.receiptHeaderMessage ?? '',
  receiptFooterPolicy: wire.receiptFooterPolicy ?? '',
  autoPrintReceipt: wire.autoPrintReceipt,
  showCashierOnReceipt: wire.showCashierOnReceipt,
  accentColor: wire.accentColor,
  fontFamily: wire.fontFamily,
  fontScalePercent: wire.fontScalePercent,
  cloudSyncIntervalMinutes: wire.cloudSyncIntervalMinutes ?? 15,
  thresholds: {
    idleLockMinutes: wire.thresholds.idleLockMinutes,
    adjustmentApprovalValue: toMajor(wire.thresholds.adjustmentApprovalPesewas),
    cashVarianceExplain: toMajor(wire.thresholds.cashVariancePesewas),
    discountCeilingByRole: ceilings(wire.thresholds.discountCeilingByRole),
  },
});

const toWire = (settings: GeneralSettings) => ({
  companyName: settings.companyName,
  taxRegistrationNumber: settings.taxRegistrationNumber || null,
  taxEnabled: settings.taxEnabled,
  taxRatePercent: settings.taxRatePercent,
  currencyCode: settings.currencyCode,
  currencySymbol: settings.currencySymbol,
  cashRounding: ROUNDING_OUT[settings.cashRounding],
  receiptHeaderMessage: settings.receiptHeaderMessage || null,
  receiptFooterPolicy: settings.receiptFooterPolicy || null,
  receiptPrinterWidth: settings.receiptPrinterWidth,
  autoPrintReceipt: settings.autoPrintReceipt,
  showCashierOnReceipt: settings.showCashierOnReceipt,
  accentColor: settings.accentColor,
  fontFamily: settings.fontFamily,
  fontScalePercent: settings.fontScalePercent,
  cloudSyncIntervalMinutes: settings.cloudSyncIntervalMinutes,
  thresholds: {
    idleLockMinutes: settings.thresholds.idleLockMinutes,
    adjustmentApprovalPesewas: toPesewas(settings.thresholds.adjustmentApprovalValue),
    cashVariancePesewas: toPesewas(settings.thresholds.cashVarianceExplain),
    discountCeilingByRole: settings.thresholds.discountCeilingByRole,
  },
  enforceFloorPriceApproval: settings.enforceFloorPricePin,
  enforceVoidApproval: settings.enforceVoidPin,
  enforceBlindShiftCount: settings.enforceBlindShiftCount,
});

export const settingsApi = {
  load: () => request<SettingsWire>('/api/settings').then(toGeneralSettings),

  save: (settings: GeneralSettings) =>
    request<SettingsWire>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(toWire(settings)),
    }).then(toGeneralSettings),

  /**
   * FR-SET-01: upload the business logo.
   *
   * <p>The bytes, not a link to them. `logoUrl` used to be the only field, so
   * the shop's logo had to already live somewhere on the internet — on a
   * counter whose connection cannot be relied on to make a sale.
   *
   * <p>Multipart, and no `Content-Type` is set by hand: the browser has to add
   * the multipart boundary, and setting the header manually omits it.
   */
  uploadLogo: async (file: File) => {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/settings/logo', {
      method: 'POST',
      credentials: 'same-origin',
      headers: await csrfHeader(),
      body,
    });
    if (!response.ok) throw new Error(await errorMessage(response, 'The logo could not be saved.'));
    return toGeneralSettings(await response.json());
  },

  /** FR-SET-01: back to no logo on the receipt. */
  removeLogo: async () => {
    const response = await fetch('/api/settings/logo', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: await csrfHeader(),
    });
    if (!response.ok) throw new Error(await errorMessage(response, 'The logo could not be removed.'));
    return toGeneralSettings(await response.json());
  },

  saveAppearance: (settings: Pick<GeneralSettings, 'accentColor' | 'fontFamily' | 'fontScalePercent'>) =>
    request<SettingsWire>('/api/settings/appearance', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }).then(toGeneralSettings),

  /**
   * FR-AUTH-02: set your own approval PIN.
   *
   * The password is required because an unattended session would otherwise be
   * enough for a passer-by to mint an approval credential that outlives it.
   */
  setOwnPin: (currentPassword: string, pin: string) =>
    request<void>('/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, pin }),
    }),
};
