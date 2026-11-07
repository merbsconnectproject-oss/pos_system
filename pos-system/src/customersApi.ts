import { request } from './apiClient';
import type { Customer } from './types';
import type { SaleWire } from './salesApi';

/**
 * Customers — FR-CUST.
 *
 * One list for the whole business (FR-CUST-05), found by phone number
 * (FR-CUST-03). What a customer has spent is computed by the server from their
 * sales, so it is read here and never accumulated in the browser: a total kept
 * in a tab is wrong the moment another till sells to them.
 */
export interface CustomerWire {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  customerType: Customer['customerType'];
  priceLevel: 'RETAIL' | 'TRADE';
  discountRate: number;
  /** FR-CUST-07: the most they may owe. Zero means no credit. */
  creditLimit: number;
  notes: string | null;
  active: boolean;
  totalPurchased: number;
  salesCount: number;
  createdAt: string;
}

export const toCustomer = (wire: CustomerWire): Customer => ({
  id: wire.id,
  name: wire.name,
  phone: wire.phone,
  customerType: wire.customerType,
  totalPurchased: Number(wire.totalPurchased ?? 0),
  salesCount: wire.salesCount ?? 0,
  discountRate: Number(wire.discountRate ?? 0),
  creditLimit: Number(wire.creditLimit ?? 0),
  notes: wire.notes ?? '',
  email: wire.email ?? '',
  address: wire.address ?? '',
  active: wire.active,
  priceLevel: wire.priceLevel,
});

const toWire = (customer: Customer) => ({
  name: customer.name,
  phone: customer.phone,
  email: customer.email || null,
  address: customer.address || null,
  type: customer.customerType,
  // Sent explicitly, including zero. Omitting it would hand the customer back
  // their type's default rate and silently undo an agreed one.
  discountRate: customer.discountRate ?? null,
  // FR-CUST-07: null leaves the limit alone, so a screen that does not offer
  // the field cannot withdraw somebody's credit by saving their phone number.
  creditLimit: customer.creditLimit ?? null,
  notes: customer.notes || null,
});

/** FR-CUST-07: what a customer owes, how old it is, and on which plans. */
export interface CustomerStatement {
  customerId: string;
  customerName: string;
  customerPhone: string;
  creditLimit: number;
  balance: number;
  available: number;
  overLimit: boolean;
  ageing: {
    current: number;
    upTo30Days: number;
    upTo60Days: number;
    over60Days: number;
  };
  plans: Array<{
    planId: string;
    planNumber: string;
    status: string;
    total: number;
    paid: number;
    outstanding: number;
    oldestUnpaidDue: string | null;
    daysLate: number;
    createdAt: string;
  }>;
  asOf: string;
}

export const customersApi = {
  list: (query?: string, includeInactive = false) =>
    request<CustomerWire[]>(
      `/api/customers?includeInactive=${includeInactive}` +
        (query ? `&query=${encodeURIComponent(query)}` : ''),
    ).then((wires) => wires.map(toCustomer)),

  /**
   * FR-CUST-03: the counter's lookup.
   *
   * Resolves to null when nobody has that number — an ordinary answer at a
   * till, where most sales have no customer at all.
   */
  byPhone: (phone: string) =>
    request<CustomerWire | null>(`/api/customers/by-phone?phone=${encodeURIComponent(phone)}`)
      .then((wire) => (wire ? toCustomer(wire) : null)),

  /**
   * FR-CUST-07: their statement — balance, ageing and the plans behind it.
   *
   * <p>Behind `customer.credit` on the server. How far behind somebody is with
   * their payments is not something a cashier needs in order to serve them.
   */
  statement: (customerId: string) =>
    request<CustomerStatement>(`/api/customers/${encodeURIComponent(customerId)}/statement`),

  create: (customer: Customer) =>
    request<CustomerWire>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(toWire(customer)),
    }).then(toCustomer),

  update: (customer: Customer) =>
    request<CustomerWire>(`/api/customers/${encodeURIComponent(customer.id)}`, {
      method: 'PUT',
      body: JSON.stringify(toWire(customer)),
    }).then(toCustomer),

  /** BR-17. */
  setActive: (customerId: string, active: boolean) =>
    request<CustomerWire>(
      `/api/customers/${encodeURIComponent(customerId)}/active?value=${active}`,
      { method: 'POST' },
    ).then(toCustomer),

  /** FR-CUST-06 · `G-05`: their purchases, across every branch. */
  history: (customerId: string, limit = 50) =>
    request<SaleWire[]>(`/api/customers/${encodeURIComponent(customerId)}/sales?limit=${limit}`),
};
