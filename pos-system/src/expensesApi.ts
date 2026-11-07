import { request } from './apiClient';
import type { Expense, ExpenseCategory, OutletId } from './types';

/**
 * Operating expenses — `expense.view` to read, `expense.manage` to write.
 *
 * Before this existed an expense lived in a React `useState` and nowhere else:
 * it appeared on the screen, survived until a refresh, and took the P&L computed
 * from it. Everything here is the server's, so a recorded cost is still there
 * tomorrow and the same figure on every machine.
 */
const CATEGORY_TO_WIRE: Record<ExpenseCategory, string> = {
  'Rent & Lease': 'RENT_LEASE',
  'Utilities & Power': 'UTILITIES_POWER',
  'Staff & Payroll': 'STAFF_PAYROLL',
  'Delivery & Haulage': 'DELIVERY_HAULAGE',
  'Advertising & Marketing': 'ADVERTISING_MARKETING',
  'Maintenance & Repairs': 'MAINTENANCE_REPAIRS',
  'Packaging & Bags': 'PACKAGING_BAGS',
  'Taxes, Levies & Licenses': 'TAXES_LEVIES_LICENSES',
  'Office & Communication': 'OFFICE_COMMUNICATION',
  Miscellaneous: 'MISCELLANEOUS',
};

const CATEGORY_FROM_WIRE = Object.fromEntries(
  Object.entries(CATEGORY_TO_WIRE).map(([label, key]) => [key, label as ExpenseCategory]),
) as Record<string, ExpenseCategory>;

const METHOD_TO_WIRE: Record<Expense['paymentMethod'], string> = {
  'Cash (Drawer)': 'CASH_DRAWER',
  'Mobile Money': 'MOBILE_MONEY',
  'Bank Transfer': 'BANK_TRANSFER',
  Cheque: 'CHEQUE',
  'Corporate Card': 'CORPORATE_CARD',
};

const METHOD_FROM_WIRE = Object.fromEntries(
  Object.entries(METHOD_TO_WIRE).map(([label, key]) => [key, label as Expense['paymentMethod']]),
) as Record<string, Expense['paymentMethod']>;

export interface ExpenseWire {
  id: string;
  spentOn: string;
  category: string;
  categoryLabel: string;
  title: string;
  description: string | null;
  amountPesewas: number;
  outletId: string | null;
  outletName: string | null;
  payee: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  referenceNumber: string | null;
  taxDeductible: boolean;
  status: 'PAID' | 'PENDING';
  recordedBy: string;
  recordedByName: string | null;
  createdAt: string;
}

/** Totals come from the server, over the whole period rather than the page. */
export interface ExpensePageWire {
  expenses: ExpenseWire[];
  paidPesewas: number;
  pendingPesewas: number;
  taxDeductiblePesewas: number;
  byCategoryPesewas: Record<string, number>;
}

const toExpense = (wire: ExpenseWire): Expense => ({
  id: wire.id,
  date: wire.spentOn,
  category: CATEGORY_FROM_WIRE[wire.category] ?? 'Miscellaneous',
  title: wire.title,
  description: wire.description ?? undefined,
  // BR-11: pesewas on the wire, major units on the screen.
  amount: wire.amountPesewas / 100,
  // A cost carried by the business as a whole has no branch; the screen's
  // filter treats that as every branch rather than none.
  outletId: (wire.outletId ?? 'all-outlets') as OutletId,
  outletName: wire.outletName ?? 'All Outlets',
  payee: wire.payee,
  paymentMethod: METHOD_FROM_WIRE[wire.paymentMethod] ?? 'Cash (Drawer)',
  referenceNumber: wire.referenceNumber ?? undefined,
  taxDeductible: wire.taxDeductible,
  recordedBy: wire.recordedByName ?? 'Unknown',
  status: wire.status,
});

const toWire = (expense: Expense) => ({
  spentOn: expense.date.slice(0, 10),
  category: CATEGORY_TO_WIRE[expense.category] ?? 'MISCELLANEOUS',
  title: expense.title,
  description: expense.description || null,
  // Rounded once, here. Sending a decimal and letting the server round would
  // put a second rounding rule in the system, and the P&L has to tie to the
  // sales figures exactly.
  amountPesewas: Math.round((expense.amount || 0) * 100),
  outletId: expense.outletId === 'all-outlets' ? null : expense.outletId,
  payee: expense.payee,
  paymentMethod: METHOD_TO_WIRE[expense.paymentMethod] ?? 'CASH_DRAWER',
  referenceNumber: expense.referenceNumber || null,
  taxDeductible: expense.taxDeductible,
  status: expense.status,
});

export interface ExpenseTotals {
  paid: number;
  pending: number;
  taxDeductible: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
}

export interface ExpenseList {
  expenses: Expense[];
  totals: ExpenseTotals;
}

const toList = (page: ExpensePageWire): ExpenseList => ({
  expenses: page.expenses.map(toExpense),
  totals: {
    paid: page.paidPesewas / 100,
    pending: page.pendingPesewas / 100,
    taxDeductible: page.taxDeductiblePesewas / 100,
    byCategory: Object.fromEntries(
      Object.entries(page.byCategoryPesewas).map(([key, pesewas]) => [
        CATEGORY_FROM_WIRE[key] ?? 'Miscellaneous',
        pesewas / 100,
      ]),
    ),
  },
});

export const expensesApi = {
  /** @param outletId omit for the whole business */
  list: (outletId?: string, from?: string, to?: string) => {
    const query = new URLSearchParams();
    if (outletId && outletId !== 'all-outlets') query.set('outletId', outletId);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const suffix = query.toString() ? `?${query}` : '';
    return request<ExpensePageWire>(`/api/expenses${suffix}`).then(toList);
  },

  record: (expense: Expense) =>
    request<ExpenseWire>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(toWire(expense)),
    }).then(toExpense),

  update: (id: string, expense: Expense) =>
    request<ExpenseWire>(`/api/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(toWire(expense)),
    }).then(toExpense),

  /**
   * Removes it from the figures, not from the record.
   *
   * A P&L somebody filed last month has to keep reproducing, so the server
   * voids the row rather than deleting it.
   */
  remove: (id: string, reason?: string) =>
    request<void>(`/api/expenses/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, {
      method: 'DELETE',
    }),
};
