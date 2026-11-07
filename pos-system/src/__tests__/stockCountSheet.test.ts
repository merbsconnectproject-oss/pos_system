import { describe, expect, it } from 'vitest';
import { buildStockCountCsv, buildStockCountPdf, type StockCountSheetMeta, type StockCountSheetRow } from '../stockCountSheet';

const meta: StockCountSheetMeta = {
  reference: 'COUNT-20260930',
  outlet: 'Radiance Lighting',
  countDate: '2026-09-30',
  countedBy: 'Ama Mensah',
  notes: 'Main floor, shelves A-C',
};

const row: StockCountSheetRow = {
  sku: 'RAD-001',
  product: 'Lamp, 15W "Warm"',
  category: 'Lighting & Lamps',
  systemQuantity: 12,
  countedQuantity: 10,
  variance: -2,
  unit: 'pcs',
};

describe('physical stock count exports', () => {
  it('builds an Excel-compatible CSV with metadata, escaped values, and variance', () => {
    const csv = buildStockCountCsv(meta, [row]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Reference,COUNT-20260930');
    expect(csv).toContain('Counted by,Ama Mensah');
    expect(csv).toContain('"Lamp, 15W ""Warm"""');
    expect(csv).toContain('12,10,-2,pcs');
  });

  it('builds a downloadable multi-page PDF containing every count row', () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      ...row,
      sku: `RAD-${String(index + 1).padStart(3, '0')}`,
      product: `Product ${index + 1}`,
    }));
    const bytes = buildStockCountPdf(meta, rows);
    const pdf = new TextDecoder().decode(bytes);

    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Count 3');
    expect(pdf).toContain('(Product 1)');
    expect(pdf).toContain('(Product 50)');
    expect(pdf.endsWith('%%EOF')).toBe(true);
  });
});
