/**
 * Catalogue lookups — FR-PROD-03/04, FR-PROD-06.
 *
 * A product carries several barcodes and each is bound to one selling unit, so a
 * scan resolves to a (product, unit) pair rather than just a product. Scanning the
 * carton code must add a full carton.
 */
import type { Product, ProductBarcode, SellingUnit } from './types';

/** The code printed on the shelf label — the first, which is the smallest sellable unit. */
export function primaryBarcode(product: Product): string {
  return product.barcodes[0]?.code || '';
}

export function allBarcodes(product: Product): string[] {
  return product.barcodes.map((entry) => entry.code);
}

export function barcodeForUnit(product: Product, unitName: string): string | undefined {
  return product.barcodes.find((entry) => entry.unitName === unitName)?.code;
}

export interface BarcodeMatch {
  product: Product;
  /** The unit the scanned code identifies. */
  unitName: string;
  /** The matching SellingUnit, when the product defines one. */
  sellingUnit?: SellingUnit;
}

/** Exact barcode resolution. Returns the unit so the caller adds the right quantity. */
export function findByBarcode(products: Product[], code: string): BarcodeMatch | null {
  const clean = code.trim();
  if (!clean) return null;
  for (const product of products) {
    const entry = product.barcodes.find((item) => item.code === clean);
    if (entry) {
      return {
        product,
        unitName: entry.unitName,
        sellingUnit: product.sellingUnits?.find((unit) => unit.name === entry.unitName),
      };
    }
  }
  return null;
}

/** Barcode first, then SKU. Used by the counter scan field, which accepts either. */
export function findByBarcodeOrSku(products: Product[], code: string): BarcodeMatch | null {
  const byBarcode = findByBarcode(products, code);
  if (byBarcode) return byBarcode;
  const clean = code.trim().toLowerCase();
  const product = products.find((item) => item.sku.toLowerCase() === clean);
  if (!product) return null;
  const base = product.sellingUnits?.find((unit) => unit.conversionFactor === 1);
  return { product, unitName: base?.name || product.baseUnit, sellingUnit: base };
}

/** FR-PROD-06: partial, out-of-order term matching across name, SKU, barcodes, brand, category. */
export function matchesSearch(product: Product, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    product.name,
    product.sku,
    product.brand,
    product.category,
    ...allBarcodes(product),
  ]
    .join(' ')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function makeBarcodes(code: string, unitName: string): ProductBarcode[] {
  return code ? [{ code, unitName }] : [];
}
