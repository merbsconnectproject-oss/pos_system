import { describe, expect, it } from 'vitest';
import { productCategoryAppearance } from '../components/ProductCategoryVisual';
import { toProduct, type ProductWire } from '../productsApi';

const wireProduct = (imageUrl?: string | null): ProductWire => ({
  id: 'product-1',
  sku: 'TEST-1',
  name: 'Test product',
  category: 'Lighting & Lamps',
  brand: 'Test',
  baseUnit: 'pcs',
  retailPrice: 10,
  tradePrice: 9,
  floorPrice: 8,
  imageUrl,
  active: true,
  sellingUnits: [],
  barcodes: [],
  createdAt: '2026-09-30T00:00:00Z',
  updatedAt: '2026-09-30T00:00:00Z',
});

describe('product category visuals', () => {
  it('assigns intentional semantic colours to known categories', () => {
    expect(productCategoryAppearance('Lighting & Lamps').background).toBe('#F2C94C');
    expect(productCategoryAppearance('Cables & Wires').background).toBe('#A44A5B');
    expect(productCategoryAppearance('Plumbing & Sanitary').background).toBe('#2F7F83');
    expect(productCategoryAppearance('Protection & Breakers').background).toBe('#B6473E');
  });

  it('gives merchant-created categories a stable colour from the curated palette', () => {
    const first = productCategoryAppearance('Commercial Refrigeration');
    const second = productCategoryAppearance('Commercial Refrigeration');

    expect(second.background).toBe(first.background);
    expect(first.background).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('does not manufacture a stock-photo URL for products without an image', () => {
    expect(toProduct(wireProduct()).imageUrl).toBe('');
    expect(toProduct(wireProduct(null)).imageUrl).toBe('');
  });
});
