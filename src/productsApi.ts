import { request } from './apiClient';
import type { Product } from './types';

/**
 * The catalogue — FR-PROD, FR-UOM.
 *
 * Stock, cost and reorder level are per outlet and belong to F. The API does
 * not carry them yet, so `toProduct` fills those maps empty rather than
 * inventing numbers: a product with no recorded stock reads as zero, which is
 * true, where a fabricated figure would be a lie printed on a stock report.
 */
export interface ProductWire {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  supplierId?: string | null;
  baseUnit: string;
  retailPrice: number;
  tradePrice: number;
  floorPrice: number;
  imageUrl?: string | null;
  active: boolean;
  sellingUnits: { name: string; conversionFactor: number; price: number; tradePrice?: number | null }[];
  barcodes: { code: string; unitName: string }[];
  createdAt: string;
  updatedAt: string;
}

const PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400&auto=format&fit=crop&q=80';

export const toProduct = (wire: ProductWire): Product => ({
  id: wire.id,
  name: wire.name,
  sku: wire.sku,
  category: (wire.category || 'Hardware & Tools') as Product['category'],
  brand: wire.brand || 'Generic',
  description: wire.description || '',
  supplierId: wire.supplierId || undefined,
  barcodes: wire.barcodes,
  baseUnit: wire.baseUnit as Product['baseUnit'],
  sellingUnits: wire.sellingUnits.map((unit) => ({
    name: unit.name,
    conversionFactor: unit.conversionFactor,
    price: unit.price,
    tradePrice: unit.tradePrice ?? undefined,
  })),
  retailPrice: wire.retailPrice,
  tradePrice: wire.tradePrice,
  floorPrice: wire.floorPrice,
  // Waiting on F. Empty, never invented.
  costPrice: {},
  stock: {},
  minStockAlert: {},
  imageUrl: wire.imageUrl || PLACEHOLDER_IMAGE,
  salesCount: 0,
  active: wire.active,
});

/**
 * The catalogue half of what the product form collects.
 *
 * Opening stock, cost and reorder level are deliberately absent: the API
 * ignores unknown fields, so sending them would look like it worked and drop
 * them silently. They are held locally until F can store them.
 */
const fromProduct = (product: Product) => ({
  sku: product.sku || undefined,
  name: product.name,
  description: product.description || undefined,
  category: product.category,
  brand: product.brand,
  supplierId: product.supplierId || undefined,
  baseUnit: product.baseUnit,
  retailPrice: product.retailPrice,
  tradePrice: product.tradePrice,
  floorPrice: product.floorPrice,
  imageUrl: product.imageUrl,
  sellingUnits: (product.sellingUnits || []).map((unit) => ({
    name: unit.name,
    conversionFactor: unit.conversionFactor,
    price: unit.price,
    tradePrice: unit.tradePrice,
  })),
  barcodes: (product.barcodes || []).map((code) => ({ code: code.code, unitName: code.unitName })),
});

interface ProductPage {
  content: ProductWire[];
  totalElements: number;
}

export const productsApi = {
  list: (query = '', activeOnly = true, size = 200) => {
    const parameters = new URLSearchParams({ activeOnly: String(activeOnly), size: String(size) });
    if (query) parameters.set('q', query);
    return request<ProductPage>(`/api/products?${parameters}`).then((page) => page.content.map(toProduct));
  },

  create: (product: Product) =>
    request<ProductWire>('/api/products', { method: 'POST', body: JSON.stringify(fromProduct(product)) })
      .then(toProduct),

  update: (id: string, product: Product) =>
    request<ProductWire>(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify(fromProduct(product)),
    }).then(toProduct),

  /** FR-PROD-08 · BR-17: deactivation, never deletion. */
  setActive: (id: string, active: boolean) =>
    request<ProductWire>(`/api/products/${encodeURIComponent(id)}/active?value=${active}`, { method: 'POST' })
      .then(toProduct),

  /** FR-PROD-03/04: the counter's scan lookup. */
  byBarcode: (code: string) =>
    request<ProductWire>(`/api/products/barcode/${encodeURIComponent(code)}`).then(toProduct),

  /** FR-PROD-10: one atomic server commit after the browser preview. */
  import: (products: Product[]) =>
    request<{ created: number; updated: number; products: ProductWire[] }>('/api/products/import', {
      method: 'POST',
      body: JSON.stringify({ products: products.map(fromProduct) }),
    }).then((result) => ({ ...result, products: result.products.map(toProduct) })),

  costHistory: (productId: string) =>
    request<CostHistoryWire[]>(`/api/products/${encodeURIComponent(productId)}/cost-history`),
};

export interface CostHistoryWire {
  id: string;
  unitCost: number;
  movementType: 'OPENING' | 'RECEIPT';
  outletId: string;
  outletName: string | null;
  changedById: string | null;
  changedBy: string | null;
  changedAt: string;
}

/**
 * Per-branch prices and price history — FR-PRICE-03, FR-PRICE-06.
 *
 * Null is sent and read as null throughout. "This branch charges the shared
 * price" and "this branch charges nothing" are different answers, and a
 * resolved number for both would make them identical.
 */
export interface OutletPriceWire {
  outletId: string;
  retailPrice: number | null;
  tradePrice: number | null;
  floorPrice: number | null;
  updatedAt: string;
}

export interface PriceHistoryWire {
  id: string;
  retailPrice: number;
  tradePrice: number;
  floorPrice: number;
  changedBy: string | null;
  changedAt: string;
}

export const pricingApi = {
  /** FR-PRICE-03: every branch that charges something different. */
  overrides: (productId: string) =>
    request<OutletPriceWire[]>(`/api/products/${encodeURIComponent(productId)}/prices`),

  setOverride: (
    productId: string,
    outletId: string,
    prices: { retailPrice?: number | null; tradePrice?: number | null; floorPrice?: number | null },
  ) =>
    request<OutletPriceWire>(
      `/api/products/${encodeURIComponent(productId)}/prices/${encodeURIComponent(outletId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          retailPrice: prices.retailPrice ?? null,
          tradePrice: prices.tradePrice ?? null,
          floorPrice: prices.floorPrice ?? null,
        }),
      },
    ),

  /** Back to the shared price. */
  clearOverride: (productId: string, outletId: string) =>
    request<void>(
      `/api/products/${encodeURIComponent(productId)}/prices/${encodeURIComponent(outletId)}`,
      { method: 'DELETE' },
    ),

  /** FR-PRICE-06: what this product has been priced at, and by whom. */
  history: (productId: string) =>
    request<PriceHistoryWire[]>(`/api/products/${encodeURIComponent(productId)}/price-history`),
};
