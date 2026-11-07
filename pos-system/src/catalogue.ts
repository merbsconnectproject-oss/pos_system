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

/**
 * EAN-13's check digit — the thirteenth from the first twelve.
 *
 * Positions alternate weight 1 and 3 from the left. A code with the wrong check
 * digit is not a barcode: a scanner reads it and rejects it, which on a shelf
 * label looks like a broken scanner rather than a bad number.
 */
function ean13CheckDigit(twelve: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** Stable, non-cryptographic digest — the same product always seeds the same code. */
function seedDigits(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  // Ten digits, left-padded, from a 32-bit digest widened by a second round.
  const second = Math.imul(hash ^ 0x9e3779b9, 2654435761) >>> 0;
  return `${hash}`.padStart(10, '0').slice(0, 5) + `${second}`.padStart(10, '0').slice(0, 5);
}

/**
 * FR-PROD-04: an in-store barcode for goods that arrived without one.
 *
 * Loose goods, own-brand lines and anything a supplier ships unlabelled still
 * need something to scan at the till. GS1 reserves prefixes 20-29 for exactly
 * this — codes that are valid EAN-13, scan on any reader, and are guaranteed
 * never to collide with a manufacturer's code because no manufacturer is issued
 * that range.
 *
 * Deterministic from the seed, so regenerating for the same product proposes the
 * same number rather than a new one each press; `taken` is consulted so two
 * products can never be issued the same code.
 */
export function generateInternalBarcode(seed: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const digits = seedDigits(seed || String(Date.now()));

  // Walk forward on collision rather than reseeding: the first free code near
  // the product's own number is more predictable than a fresh random one.
  //
  // The body is exactly ten digits, because the prefix takes two of the twelve
  // that carry the check digit. Padding it to eleven and trimming the overflow
  // threw away the digit `attempt` moves, so a step of one left the code
  // unchanged and a thousand attempts only ever reached a hundred codes.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const body = ((Number(digits) + attempt) % 10_000_000_000).toString().padStart(10, '0');
    const twelve = `20${body}`;
    const code = twelve + ean13CheckDigit(twelve);
    if (!used.has(code)) return code;
  }
  // A shop with a thousand collisions on one seed does not exist, but returning
  // a duplicate silently would be worse than returning something time-based.
  const fallback = `20${String(Date.now()).slice(-10)}`;
  return fallback + ean13CheckDigit(fallback);
}

/** True when a code is a well-formed EAN-13, check digit included. */
export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}
