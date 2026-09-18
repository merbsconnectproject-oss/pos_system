import { describe, expect, it } from 'vitest';
import { posCategoryOptions } from '../components/PosModal';
import type { CatalogueListItem } from '../catalogueApi';
import type { Product } from '../types';

const product = (category: string, outletId = 'radiance'): Product => ({
  id: `${outletId}-${category}`,
  name: category,
  sku: category,
  outletId,
  category,
  brand: 'Generic',
  barcodes: [],
  baseUnit: 'pcs',
  retailPrice: 1,
  tradePrice: 1,
  floorPrice: 1,
  costPrice: {},
  stock: {},
  minStockAlert: {},
  imageUrl: '',
  active: true,
});

describe('POS catalogue categories', () => {
  it('uses the server-managed category list instead of compiled or product-derived names', () => {
    const managed: CatalogueListItem[] = [
      { id: '1', name: 'Commercial Refrigeration', active: true, inUse: 0 },
      { id: '2', name: 'Retired Range', active: false, inUse: 0 },
    ];

    expect(posCategoryOptions(managed, [product('Cables & Wires')], 'radiance'))
      .toEqual(['All', 'Commercial Refrigeration']);
  });

  it('falls back to active products from the current outlet if the category endpoint is unavailable', () => {
    const products = [
      product('Custom Lighting'),
      product('Other Branch Category', 'inco'),
      { ...product('Retired Product'), active: false },
    ];

    expect(posCategoryOptions(null, products, 'radiance')).toEqual(['All', 'Custom Lighting']);
  });

  it('does not invent categories when the authoritative database list is empty', () => {
    expect(posCategoryOptions([], [product('Cables & Wires')], 'radiance')).toEqual(['All']);
  });
});
