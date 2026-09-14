import { request } from './apiClient';
import type { Product, StockMovement } from './types';

/**
 * Stock — BR-1, FR-INV.
 *
 * BR-1 is that no global quantity exists, so every figure here is bound to an
 * outlet and the app's per-outlet maps are built from a list, never from a
 * single number.
 */
export interface StockWire {
  productId: string;
  outletId: string;
  quantity: number;
  /**
   * BR-4 · FR-PRICE-07: absent for a user without `price.view_cost`.
   *
   * Absent, not zero. A zero cost reads as "this was free", which is a claim;
   * missing reads as "you were not told", which is true — and the difference
   * matters on a valuation.
   */
  averageCost?: number | null;
  /** FR-PRICE-08: the unit cost of the most recent delivery, where known. */
  lastPurchaseCost?: number | null;
  reorderLevel: number;
  low: boolean;
}

export interface MovementWire {
  id: string;
  timestamp: string;
  outletId: string;
  productId: string;
  productName: string;
  type: StockMovement['type'];
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost?: number | null;
  reason?: string | null;
  note?: string | null;
  referenceNumber?: string | null;
  exception: boolean;
  user: string;
}

export type MovementType =
  | 'OPENING' | 'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'LOSS';

export interface MovementDraft {
  productId: string;
  outletId: string;
  type: MovementType;
  /** A magnitude. Direction belongs to the type — the server decides the sign. */
  quantity: number;
  unitCost?: number;
  reason?: string;
  note?: string;
  sourceType?: string;
  /** BR-7: the idempotency key. A retry with the same id moves stock once. */
  sourceId?: string;
}

const stamp = (iso: string) => {
  const at = new Date(iso);
  return `${at.toLocaleDateString('en-GB')} ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export const toMovement = (wire: MovementWire): StockMovement => ({
  id: wire.id,
  timestamp: stamp(wire.timestamp),
  outletId: wire.outletId,
  productId: wire.productId,
  productName: wire.productName,
  type: wire.type,
  quantity: wire.quantity,
  previousStock: wire.previousStock,
  newStock: wire.newStock,
  unitCost: wire.unitCost ?? undefined,
  referenceNumber: wire.referenceNumber ?? undefined,
  reason: wire.reason ?? undefined,
  user: wire.user,
});

export const stockApi = {
  /** Every outlet's figure for one product. */
  forProduct: (productId: string) =>
    request<StockWire[]>(`/api/stock/product/${encodeURIComponent(productId)}`),

  atOutlet: (outletId: string) =>
    request<StockWire[]>(`/api/stock/outlet/${encodeURIComponent(outletId)}`),

  /** FR-INV-08. */
  lowAt: (outletId: string) =>
    request<StockWire[]>(`/api/stock/outlet/${encodeURIComponent(outletId)}/low`),

  record: (draft: MovementDraft) =>
    request<StockWire>('/api/stock/movements', { method: 'POST', body: JSON.stringify(draft) }),

  setReorderLevel: (productId: string, outletId: string, value: number) =>
    request<StockWire>(
      `/api/stock/product/${encodeURIComponent(productId)}/outlet/${encodeURIComponent(outletId)}/reorder-level?value=${value}`,
      { method: 'PUT' },
    ),

  /** FR-INV-04, and FR-INV-10 with `exceptionsOnly`. */
  movements: (filter: {
    productId?: string; outletId?: string; type?: string; exceptionsOnly?: boolean; limit?: number;
  } = {}) => {
    const query = new URLSearchParams();
    if (filter.productId) query.set('productId', filter.productId);
    if (filter.outletId) query.set('outletId', filter.outletId);
    if (filter.type) query.set('type', filter.type);
    if (filter.exceptionsOnly) query.set('exceptionsOnly', 'true');
    query.set('limit', String(filter.limit ?? 200));
    return request<MovementWire[]>(`/api/stock/movements?${query}`).then((rows) => rows.map(toMovement));
  },
};

/**
 * Fold stock levels into the catalogue's per-outlet maps.
 *
 * The app's `Product` carries stock, cost and reorder level keyed by outlet —
 * the shape BR-1 implies — while the API returns them as rows. Rebuilding the
 * maps from the rows each time, rather than patching them in place, keeps a
 * product that has lost its stock row from keeping a stale figure.
 */
export const withStock = (products: Product[], levels: StockWire[]): Product[] => {
  const byProduct = new Map<string, StockWire[]>();
  levels.forEach((level) => {
    const rows = byProduct.get(level.productId) || [];
    rows.push(level);
    byProduct.set(level.productId, rows);
  });

  return products.map((product) => {
    const rows = byProduct.get(product.id) || [];
    const stock: Record<string, number> = {};
    const costPrice: Record<string, number> = {};
    const replacementCost: Record<string, number> = {};
    const minStockAlert: Record<string, number> = {};

    rows.forEach((row) => {
      stock[row.outletId] = row.quantity;
      // FR-PRICE-07: no entry rather than a zero, so a screen without the
      // permission shows a gap instead of a cost of nothing.
      if (row.averageCost != null) costPrice[row.outletId] = row.averageCost;
      if (row.lastPurchaseCost != null) replacementCost[row.outletId] = row.lastPurchaseCost;
      minStockAlert[row.outletId] = row.reorderLevel;
    });

    return { ...product, stock, costPrice, replacementCost, minStockAlert };
  });
};
