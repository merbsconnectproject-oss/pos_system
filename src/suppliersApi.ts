import { request } from './apiClient';
import type { Supplier } from './types';

/**
 * Suppliers and deliveries — FR-SUP.
 *
 * The goods receipt is the only path that moves weighted average cost, so the
 * figures it returns are the server's and replace whatever the modal estimated.
 */
export interface SupplierWire {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  categorySupplied?: string | null;
  outletId?: string | null;
  active: boolean;
  totalSupplied: number;
  createdAt: string;
}

export const toSupplier = (wire: SupplierWire): Supplier => ({
  id: wire.id,
  name: wire.name,
  contactPerson: wire.contactPerson || '',
  phone: wire.phone || '',
  email: wire.email || undefined,
  // The server keeps terms as free text so a shop can agree its own; the app's
  // union is the four the form offers, and anything else shows as entered.
  paymentTerms: (wire.paymentTerms || 'Cash on Delivery') as Supplier['paymentTerms'],
  address: wire.address || '',
  totalSupplied: wire.totalSupplied,
  outletId: wire.outletId || 'all-outlets',
  categorySupplied: wire.categorySupplied || undefined,
});

const fromSupplier = (supplier: Partial<Supplier>) => ({
  name: supplier.name || '',
  contactPerson: supplier.contactPerson,
  phone: supplier.phone,
  email: supplier.email,
  address: supplier.address,
  paymentTerms: supplier.paymentTerms,
  categorySupplied: supplier.categorySupplied,
  // 'all-outlets' is the app's word for "every branch"; the server says null.
  outletId: supplier.outletId && supplier.outletId !== 'all-outlets' ? supplier.outletId : null,
});

export interface ReceiptLineDraft {
  productId: string;
  purchaseUnit: string;
  conversionFactor: number;
  quantity: number;
  unitCost: number;
}

export interface ReceiptResultLine {
  productId: string;
  productName: string;
  purchaseUnit: string;
  conversionFactor: number;
  quantity: number;
  quantityInBaseUnits: number;
  unitCost: number;
  lineTotal: number;
  resultingQuantity: number;
  resultingAverageCost: number;
}

export interface ReceiptResult {
  id: string;
  outletId?: string;
  supplierId?: string;
  supplierName: string;
  reference?: string | null;
  note?: string | null;
  confirmedAt?: string;
  total: number;
  reversesId?: string | null;
  reversed: boolean;
  lines: ReceiptResultLine[];
}

export const suppliersApi = {
  list: (includeInactive = false) =>
    request<SupplierWire[]>(`/api/suppliers?includeInactive=${includeInactive}`)
      .then((rows) => rows.map(toSupplier)),

  create: (supplier: Partial<Supplier>) =>
    request<SupplierWire>('/api/suppliers', { method: 'POST', body: JSON.stringify(fromSupplier(supplier)) })
      .then(toSupplier),

  update: (id: string, supplier: Partial<Supplier>) =>
    request<SupplierWire>(`/api/suppliers/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify(fromSupplier(supplier)),
    }).then(toSupplier),

  /** BR-17: retired, not deleted — receipts reference the row. */
  setActive: (id: string, active: boolean) =>
    request<SupplierWire>(`/api/suppliers/${encodeURIComponent(id)}/active?value=${active}`, { method: 'POST' })
      .then(toSupplier),

  history: (id: string) => request<ReceiptResult[]>(`/api/suppliers/${encodeURIComponent(id)}/receipts`),
  productHistory: (productId: string) => request<ReceiptResult[]>(`/api/products/${encodeURIComponent(productId)}/purchase-history`),
};

export const goodsReceiptApi = {
  /** FR-SUP-04: writes the movements and recalculates weighted average cost. */
  receive: (outletId: string, supplierId: string, reference: string, lines: ReceiptLineDraft[]) =>
    request<ReceiptResult>('/api/goods-receipts', {
      method: 'POST',
      body: JSON.stringify({ outletId, supplierId, reference, lines }),
    }),

  /** FR-SUP-06. */
  reverse: (id: string) =>
    request<ReceiptResult>(`/api/goods-receipts/${encodeURIComponent(id)}/reverse`, { method: 'POST' }),

  atOutlet: (outletId: string) =>
    request<ReceiptResult[]>(`/api/goods-receipts?outletId=${encodeURIComponent(outletId)}`),
};
