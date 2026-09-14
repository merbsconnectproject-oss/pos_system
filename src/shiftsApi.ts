import { request } from './apiClient';
import type { PaymentMethod, ShiftInfo, ShiftRecord } from './types';

/**
 * Shifts and the cash drawer — FR-CASH, BR-14.
 *
 * An open shift deliberately carries no expectation. FR-CASH-04 makes the close
 * blind, and expected cash, takings and the sale total each give it away — cash
 * takings plus the float *is* the expectation. The server withholds them until
 * the count has been submitted, so there is nothing here to hide in the UI.
 */
const toMajor = (pesewas: number | null | undefined) => (pesewas ?? 0) / 100;
const toPesewas = (major: number) => Math.round(major * 100);

export type CashMovementKind = 'FLOAT_IN' | 'PAYOUT' | 'DROP' | 'CORRECTION';

export interface ShiftWire {
  id: string;
  outletId: string;
  terminalId: string;
  cashierId: string;
  cashierName: string;
  openingFloat: number;
  openedAt: string;
  status: 'OPEN' | 'CLOSED';
  countedCash?: number | null;
  expectedCash?: number | null;
  variance?: number | null;
  varianceNote?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  saleCount?: number | null;
  saleTotal?: number | null;
  takingsByMethod: Partial<Record<PaymentMethod, number>>;
  cashMovements: {
    id: string; type: CashMovementKind; amount: number;
    reason: string; note?: string | null; actor?: string | null; at: string;
  }[];
}

const stamp = (iso: string) => {
  const at = new Date(iso);
  return `${at.toLocaleDateString('en-GB')} ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * The app's `ShiftInfo` carries `expectedCash` as a number. While a shift is
 * open the server sends none, and zero is the honest stand-in — the screen
 * must not show a figure the cashier could count backwards from.
 */
export const toShiftInfo = (wire: ShiftWire): ShiftInfo => ({
  id: wire.id,
  outletId: wire.outletId,
  terminalId: wire.terminalId,
  isOpen: wire.status === 'OPEN',
  openedAt: stamp(wire.openedAt),
  cashier: wire.cashierName,
  openingFloat: toMajor(wire.openingFloat),
  expectedCash: toMajor(wire.expectedCash),
  countedCash: wire.countedCash == null ? undefined : toMajor(wire.countedCash),
  variance: wire.variance == null ? undefined : toMajor(wire.variance),
  varianceNote: wire.varianceNote || undefined,
});

export const toShiftRecord = (wire: ShiftWire, outletName: string): ShiftRecord => ({
  id: wire.id,
  outletId: wire.outletId,
  outletName,
  terminalId: wire.terminalId,
  cashier: wire.cashierName,
  openingFloat: toMajor(wire.openingFloat),
  openedAt: stamp(wire.openedAt),
  closedAt: wire.closedAt ? stamp(wire.closedAt) : undefined,
  salesTotal: toMajor(wire.saleTotal),
  takingsByMethod: Object.fromEntries(
    Object.entries(wire.takingsByMethod).map(([method, amount]) => [method, toMajor(amount)]),
  ) as Partial<Record<PaymentMethod, number>>,
  expectedCash: toMajor(wire.expectedCash),
  countedCash: wire.countedCash == null ? undefined : toMajor(wire.countedCash),
  variance: wire.variance == null ? undefined : toMajor(wire.variance),
  varianceNote: wire.varianceNote || undefined,
  status: wire.status === 'OPEN' ? 'open' : 'closed',
});

export const shiftsApi = {
  /** The caller's own open shift. 204 — and so `null` — when they have none. */
  current: () => request<ShiftWire | undefined>('/api/shifts/current')
    .then((wire) => wire ?? null),

  recent: (outletId?: string, limit = 50) => {
    const parameters = new URLSearchParams({ limit: String(limit) });
    if (outletId) parameters.set('outletId', outletId);
    return request<ShiftWire[]>(`/api/shifts?${parameters}`);
  },

  /** FR-CASH-01 · BR-13. */
  open: (terminalId: string, openingFloat: number) =>
    request<ShiftWire>('/api/shifts', {
      method: 'POST',
      body: JSON.stringify({ terminalId, openingFloat: toPesewas(openingFloat) }),
    }),

  /** FR-CASH-04: only the count goes up; the expectation comes back. */
  close: (shiftId: string, countedCash: number, note?: string) =>
    request<ShiftWire>(`/api/shifts/${encodeURIComponent(shiftId)}/close`, {
      method: 'POST',
      body: JSON.stringify({ countedCash: toPesewas(countedCash), note }),
    }),

  /** FR-CASH-03. */
  recordCash: (shiftId: string, type: CashMovementKind, amount: number, reason: string, note?: string) =>
    request<ShiftWire>(`/api/shifts/${encodeURIComponent(shiftId)}/cash`, {
      method: 'POST',
      body: JSON.stringify({ type, amount: toPesewas(Math.abs(amount)), reason, note }),
    }),
};
