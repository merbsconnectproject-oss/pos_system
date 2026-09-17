import { describe, expect, it } from 'vitest';
import { withStock, type StockWire } from '../stockApi';
import type { Product } from '../types';

/**
 * BR-1: stock is per outlet, and the catalogue in memory holds it as a map.
 *
 * Every caller fetches one outlet's rows, so the question this file exists to
 * settle is what happens to the outlets that were not asked about. Rebuilding
 * the maps from a single branch's answer wiped the rest, which is what made a
 * reorder level look like it cleared itself after the first sale.
 */
describe('folding stock levels into the catalogue', () => {
  const product = (over: Partial<Product> = {}): Product => ({
    id: 'p1',
    name: 'Twin & Earth 2.5mm',
    sku: 'CBL-001',
    category: 'Cables & Wires',
    brand: 'Nexans',
    description: '',
    barcodes: [],
    baseUnit: 'm',
    sellingUnits: [],
    retailPrice: 12,
    tradePrice: 10,
    floorPrice: 9,
    costPrice: { inco: 7, apex: 8 },
    stock: { inco: 120, apex: 45 },
    minStockAlert: { inco: 30, apex: 15 },
    imageUrl: '',
    salesCount: 0,
    active: true,
    ...over,
  });

  const row = (over: Partial<StockWire> = {}): StockWire => ({
    productId: 'p1',
    outletId: 'inco',
    quantity: 118,
    averageCost: 7.2,
    reorderLevel: 30,
    low: false,
    ...over,
  });

  it("leaves another branch's figures alone", () => {
    // The reported bug: sell two metres at Inco, and Apex's quantity, cost and
    // reorder level all vanished from the product in memory.
    const [folded] = withStock([product()], [row()], 'inco');

    expect(folded.stock).toEqual({ inco: 118, apex: 45 });
    expect(folded.costPrice).toEqual({ inco: 7.2, apex: 8 });
    expect(folded.minStockAlert).toEqual({ inco: 30, apex: 15 });
  });

  it('replaces the figures of the branch it was asked about', () => {
    const [folded] = withStock([product()], [row({ quantity: 90, reorderLevel: 40 })], 'inco');

    expect(folded.stock.inco).toBe(90);
    expect(folded.minStockAlert.inco).toBe(40);
  });

  it('drops a figure for a branch that no longer has a row', () => {
    // Inside the scope the answer is complete, so a missing row means the
    // product is no longer stocked there — not that the old number still holds.
    const [folded] = withStock([product()], [], 'inco');

    expect(folded.stock).toEqual({ apex: 45 });
    expect(folded.minStockAlert).toEqual({ apex: 15 });
  });

  it('changes nothing when there is no answer and no scope', () => {
    // A failed fetch resolves to an empty list. That is not news about any
    // branch, and must not be read as "everything is now zero".
    const before = product();
    const [folded] = withStock([before], []);

    expect(folded.stock).toEqual(before.stock);
    expect(folded.minStockAlert).toEqual(before.minStockAlert);
  });

  it('folds a whole-catalogue answer covering several branches', () => {
    const [folded] = withStock(
      [product()],
      [row({ outletId: 'inco', quantity: 100 }), row({ outletId: 'apex', quantity: 50, reorderLevel: 20 })],
    );

    expect(folded.stock).toEqual({ inco: 100, apex: 50 });
    expect(folded.minStockAlert).toEqual({ inco: 30, apex: 20 });
  });

  it('keeps a gap rather than a zero when cost is withheld', () => {
    // FR-PRICE-07: a cashier is sent no averageCost. Writing zero would read as
    // "this was free", which is a claim rather than an absence.
    const [folded] = withStock([product()], [row({ averageCost: null })], 'inco');

    expect(folded.costPrice).toEqual({ apex: 8 });
  });
});
