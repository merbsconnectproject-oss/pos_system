import { request } from './apiClient';

/**
 * Purchase orders — FR-SUP-08, `supplier.manage`.
 *
 * Nothing here records what arrived. Deliveries are booked through the goods
 * receipt endpoint naming the order they are against, and the server sums them:
 * `receivedQuantity` and `outstandingQuantity` are computed on every read. A
 * screen that kept its own running total would be the second copy this design
 * exists to avoid — and the first reversal would put the two out of step.
 */

/** How much of an order, or one of its lines, has arrived. */
export type PurchaseOrderDelivery = 'NONE' | 'PARTIAL' | 'COMPLETE' | 'OVER';

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'CLOSED' | 'CANCELLED';

export interface PurchaseOrderLine {
  productId: string;
  sku: string | null;
  name: string | null;
  purchaseUnit: string;
  conversionFactor: number;
  orderedQuantity: number;
  receivedQuantity: number;
  /** Negative when more arrived than was ordered. */
  outstandingQuantity: number;
  unitCost: number;
  lineTotalPesewas: number;
  delivery: PurchaseOrderDelivery;
}

export interface PurchaseOrderReceipt {
  id: string;
  reference: string | null;
  confirmedAt: string | null;
  /** Corrected away by a reversing document, so it counts for nothing. */
  reversed: boolean;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  outletId: string;
  supplierId: string;
  supplierName: string | null;
  status: PurchaseOrderStatus;
  delivery: PurchaseOrderDelivery;
  expectedOn: string | null;
  /** Promised, still open, and the date has passed. */
  overdue: boolean;
  note: string | null;
  sentAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  createdAt: string;
  orderedTotalPesewas: number;
  receivedTotalPesewas: number;
  lines: PurchaseOrderLine[];
  receipts: PurchaseOrderReceipt[];
}

export interface PurchaseOrderDraft {
  outletId: string;
  supplierId: string;
  expectedOn?: string | null;
  note?: string | null;
  lines: {
    productId: string;
    purchaseUnit: string;
    conversionFactor: string;
    quantity: string;
    unitCost: string;
  }[];
}

export const purchaseOrdersApi = {
  /** @param outletId omit for every branch this user can see */
  list: (outletId?: string, status?: PurchaseOrderStatus, supplierId?: string) => {
    const query = new URLSearchParams();
    if (outletId && outletId !== 'all-outlets') query.set('outletId', outletId);
    if (status) query.set('status', status);
    if (supplierId) query.set('supplierId', supplierId);
    const suffix = query.toString() ? `?${query}` : '';
    return request<PurchaseOrder[]>(`/api/purchase-orders${suffix}`);
  },

  get: (id: string) => request<PurchaseOrder>(`/api/purchase-orders/${id}`),

  raise: (draft: PurchaseOrderDraft) =>
    request<PurchaseOrder>('/api/purchase-orders', {
      method: 'POST',
      body: JSON.stringify(draft),
    }),

  /** Drafts only — a sent order is a copy the supplier holds. */
  amend: (id: string, draft: PurchaseOrderDraft) =>
    request<PurchaseOrder>(`/api/purchase-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(draft),
    }),

  send: (id: string) =>
    request<PurchaseOrder>(`/api/purchase-orders/${id}/send`, { method: 'POST' }),

  /**
   * No more deliveries expected.
   *
   * The reason is required when anything is still outstanding; the server
   * supplies "Received in full" when nothing is.
   */
  close: (id: string, reason?: string) =>
    request<PurchaseOrder>(`/api/purchase-orders/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null }),
    }),

  cancel: (id: string, reason: string) =>
    request<PurchaseOrder>(`/api/purchase-orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

/** What to show as the state of an order, in the words a shop would use. */
export function deliveryLabel(order: PurchaseOrder): string {
  if (order.status === 'DRAFT') return 'Not sent';
  if (order.status === 'CANCELLED') return 'Cancelled';
  switch (order.delivery) {
    case 'NONE':
      return order.status === 'CLOSED' ? 'Closed, nothing delivered' : 'Awaiting delivery';
    case 'PARTIAL':
      return order.status === 'CLOSED' ? 'Closed short' : 'Part delivered';
    case 'OVER':
      return 'Over-delivered';
    case 'COMPLETE':
      return 'Delivered in full';
  }
}
