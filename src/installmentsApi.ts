import { request } from './apiClient';
import type {
  CustomerInstallmentPlan,
  InstallmentScheduleItem,
  OutletId,
  PaymentMethod,
} from './types';

/**
 * Customer installment plans — `customer.credit`.
 *
 * A plan is a debt, and this used to live in browser state. A shop that
 * refreshed the page lost the schedule while the customer kept the goods.
 *
 * The balance and every OVERDUE flag come from the server. They are the two
 * figures the counter makes decisions on, and a browser computing them from a
 * partially loaded list is how the old screen managed to show a customer owing
 * nothing.
 */
const FREQUENCY_FROM_WIRE: Record<string, CustomerInstallmentPlan['frequency']> = {
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
};

// The four the till takes, both directions. Kept as a pair of maps rather than
// upper-casing the key, because 'momo' and 'transfer' are not the server's names
// for those methods.
const METHOD_FROM_WIRE: Record<string, PaymentMethod> = {
  CASH: 'cash',
  CARD: 'card',
  MOBILE_MONEY: 'momo',
  BANK_TRANSFER: 'transfer',
};

const METHOD_TO_WIRE: Record<PaymentMethod, string> = {
  cash: 'CASH',
  card: 'CARD',
  momo: 'MOBILE_MONEY',
  transfer: 'BANK_TRANSFER',
};

interface InstallmentWire {
  installmentNumber: number;
  dueDate: string;
  expectedPesewas: number;
  paidPesewas: number;
  remainingPesewas: number;
  paidOn: string | null;
  paymentMethod: string | null;
  reference: string | null;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  /** Computed by the server from today's date, never stored. */
  overdue: boolean;
}

export interface InstallmentPlanWire {
  id: string;
  planNumber: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  outletId: string;
  outletName: string | null;
  saleId: string | null;
  totalPesewas: number;
  downPaymentPesewas: number;
  paidPesewas: number;
  outstandingPesewas: number;
  frequency: string;
  installmentCount: number;
  startDate: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  hasOverdue: boolean;
  overduePesewas: number;
  nextDueDate: string | null;
  notes: string | null;
  createdAt: string;
  items: {
    productId: string | null;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotalPesewas: number;
  }[];
  schedule: InstallmentWire[];
}

export interface InstallmentPageWire {
  plans: InstallmentPlanWire[];
  outstandingPesewas: number;
  overduePesewas: number;
  activeCount: number;
  overdueCount: number;
}

const toScheduleItem = (wire: InstallmentWire): InstallmentScheduleItem => ({
  installmentNumber: wire.installmentNumber,
  dueDate: wire.dueDate,
  expectedAmount: wire.expectedPesewas / 100,
  paidAmount: wire.paidPesewas / 100,
  paidDate: wire.paidOn ?? undefined,
  paymentMethod: wire.paymentMethod ? METHOD_FROM_WIRE[wire.paymentMethod] : undefined,
  reference: wire.reference ?? undefined,
  // OVERDUE is the server's answer, not a fourth stored state. The app's type
  // carries it in the same field, so the screen keeps colouring rows the way
  // it already did.
  status: wire.overdue && wire.status !== 'PAID' ? 'OVERDUE' : wire.status,
});

export const toPlan = (wire: InstallmentPlanWire): CustomerInstallmentPlan => ({
  id: wire.id,
  planNumber: wire.planNumber,
  customerId: wire.customerId,
  customerName: wire.customerName ?? 'Unknown customer',
  customerPhone: wire.customerPhone ?? '',
  // The tier lives on the customer record; the plan does not freeze it, because
  // a contractor who becomes a company still owes the same money.
  customerTier: 'retail',
  outletId: wire.outletId as OutletId,
  outletName: wire.outletName ?? '',
  saleId: wire.saleId ?? undefined,
  items: wire.items.map((line) => ({
    productId: line.productId ?? '',
    productName: line.productName,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    lineTotal: line.lineTotalPesewas / 100,
  })),
  totalAmount: wire.totalPesewas / 100,
  downPayment: wire.downPaymentPesewas / 100,
  remainingBalance: wire.outstandingPesewas / 100,
  frequency: FREQUENCY_FROM_WIRE[wire.frequency] ?? 'monthly',
  installmentCount: wire.installmentCount,
  startDate: wire.startDate,
  status: wire.status,
  schedule: wire.schedule.map(toScheduleItem),
  notes: wire.notes ?? undefined,
  createdAt: wire.createdAt,
});

export interface InstallmentBook {
  plans: CustomerInstallmentPlan[];
  outstanding: number;
  overdue: number;
  activeCount: number;
  overdueCount: number;
}

export const installmentsApi = {
  list: (outletId?: string, customerId?: string) => {
    const query = new URLSearchParams();
    if (outletId && outletId !== 'all-outlets') query.set('outletId', outletId);
    if (customerId) query.set('customerId', customerId);
    const suffix = query.toString() ? `?${query}` : '';
    return request<InstallmentPageWire>(`/api/installment-plans${suffix}`).then(
      (page): InstallmentBook => ({
        plans: page.plans.map(toPlan),
        outstanding: page.outstandingPesewas / 100,
        overdue: page.overduePesewas / 100,
        activeCount: page.activeCount,
        overdueCount: page.overdueCount,
      }),
    );
  },

  /**
   * Agrees a plan.
   *
   * The schedule is not sent: the server generates it, because the split has to
   * sum to the balance to the pesewa (BR-11) and two implementations of that
   * rounding rule would eventually disagree.
   */
  create: (plan: CustomerInstallmentPlan) =>
    request<InstallmentPlanWire>('/api/installment-plans', {
      method: 'POST',
      body: JSON.stringify({
        customerId: plan.customerId,
        outletId: plan.outletId,
        saleId: plan.saleId ?? null,
        totalPesewas: Math.round(plan.totalAmount * 100),
        downPaymentPesewas: Math.round((plan.downPayment || 0) * 100),
        frequency: plan.frequency.toUpperCase(),
        installmentCount: plan.installmentCount,
        startDate: plan.startDate.slice(0, 10),
        notes: plan.notes || null,
        items: plan.items.map((line) => ({
          productId: line.productId || null,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotalPesewas: Math.round(line.lineTotal * 100),
        })),
      }),
    }).then(toPlan),

  /** Applied to the oldest unpaid installment first; spills forward. */
  pay: (
    planId: string,
    amount: number,
    receivedOn: string,
    paymentMethod: PaymentMethod,
    reference?: string,
  ) =>
    request<InstallmentPlanWire>(`/api/installment-plans/${planId}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        amountPesewas: Math.round(amount * 100),
        receivedOn: receivedOn.slice(0, 10),
        paymentMethod: METHOD_TO_WIRE[paymentMethod] ?? 'CASH',
        reference: reference || null,
      }),
    }).then(toPlan),

  /** Needs `settings.general` as well — writing a debt off is the owner's call. */
  setDefaulted: (planId: string, defaulted: boolean, reason?: string) => {
    const query = new URLSearchParams({ defaulted: String(defaulted) });
    if (reason) query.set('reason', reason);
    return request<InstallmentPlanWire>(
      `/api/installment-plans/${planId}/default?${query}`,
      { method: 'POST' },
    ).then(toPlan);
  },
};
