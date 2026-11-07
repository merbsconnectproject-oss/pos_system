import { describe, expect, it } from 'vitest';
import { observationsFrom, risksFrom, type TradingFigures } from '../insights';

const figures = (over: Partial<TradingFigures> = {}): TradingFigures => ({
  netRevenue: 10_000,
  grossRevenue: 10_000,
  refundTotal: 0,
  refundCount: 0,
  saleCount: 100,
  averageSale: 100,
  discountTotal: 0,
  voidCount: 0,
  voidedValue: 0,
  operatingExpenses: 0,
  outstandingCredit: 0,
  cogs: 6_000,
  grossProfit: 4_000,
  marginPercent: 40,
  salesTrendPercent: 0,
  ...over,
});

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

describe('observations — FR-RPT-04', () => {
  it('says nothing at all when nothing sold', () => {
    // The screen this replaces filled the same space with an executive summary
    // and a financial health grade of A for a shop that had not made a sale.
    expect(observationsFrom(figures({ saleCount: 0 }))).toEqual([]);
  });

  it('reports the margin the server computed, not one it assumed', () => {
    const [margin] = observationsFrom(figures()).filter((row) => row.id === 'gross-margin');
    expect(margin.title).toBe('Gross margin is 40.0%');
    expect(margin.detail).toContain('GH₵4,000.00');
    expect(margin.detail).toContain('GH₵6,000.00');
  });

  it('withholds every cost-derived observation without report.view_profit — FR-RPT-05', () => {
    const blind = observationsFrom(figures({ cogs: null, grossProfit: null, marginPercent: null }));
    expect(ids(blind)).not.toContain('gross-margin');
    expect(ids(blind)).not.toContain('net-position');
    // What does not depend on cost still appears — fewer observations, not
    // vaguer ones.
    expect(ids(blind)).toContain('basket');
  });

  it('calls a rise a rise and a fall a fall', () => {
    expect(observationsFrom(figures({ salesTrendPercent: 22 }))[0].trend).toBe('up');
    expect(observationsFrom(figures({ salesTrendPercent: -22 }))[0].trend).toBe('down');
  });

  it('stays quiet about a trend too small to mean anything', () => {
    expect(ids(observationsFrom(figures({ salesTrendPercent: 2 })))).not.toContain('sales-trend');
  });

  it('reports a loss as a loss', () => {
    const rows = observationsFrom(figures({ grossProfit: 1_000, operatingExpenses: 3_000 }));
    const net = rows.find((row) => row.id === 'net-position');
    expect(net?.title).toBe('The period is in loss');
    expect(net?.detail).toContain('-GH₵2,000.00');
  });
});

describe('risks — FR-RPT-04', () => {
  it('finds nothing to report in a clean period', () => {
    expect(risksFrom(figures())).toEqual([]);
  });

  it('raises heavy returns, and grades them by how heavy', () => {
    const moderate = risksFrom(figures({ refundTotal: 800, refundCount: 6 }));
    expect(moderate[0].id).toBe('refunds');
    expect(moderate[0].severity).toBe('medium');

    const severe = risksFrom(figures({ refundTotal: 2_000, refundCount: 20 }));
    expect(severe[0].severity).toBe('high');
  });

  it('raises selling below cost as the most serious thing on the screen', () => {
    const rows = risksFrom(figures({ marginPercent: -12, grossProfit: -1_200, cogs: 11_200 }));
    expect(rows[0].severity).toBe('high');
    expect(ids(rows)).toContain('negative-margin');
  });

  it('raises expenses running ahead of gross profit', () => {
    const rows = risksFrom(figures({ grossProfit: 1_000, operatingExpenses: 4_000 }));
    expect(ids(rows)).toContain('expenses-exceed-profit');
  });

  it('says nothing about margin when the reader may not see cost — FR-RPT-05', () => {
    const rows = risksFrom(figures({ marginPercent: null, grossProfit: null, cogs: null }));
    expect(ids(rows)).not.toContain('negative-margin');
    expect(ids(rows)).not.toContain('expenses-exceed-profit');
  });

  it('puts the most serious first', () => {
    const rows = risksFrom(figures({
      voidCount: 1,
      voidedValue: 50,
      marginPercent: -5,
      grossProfit: -500,
    }));
    expect(rows[0].severity).toBe('high');
    expect(rows[rows.length - 1].severity).toBe('low');
  });

  it('does not divide by a period that took nothing', () => {
    expect(() => risksFrom(figures({
      grossRevenue: 0,
      netRevenue: 0,
      saleCount: 0,
      refundTotal: 0,
    }))).not.toThrow();
  });
});
