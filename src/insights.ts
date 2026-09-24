/**
 * Observations about the trading figures — FR-RPT-04.
 *
 * <p>Every sentence this produces is derived from a number the server
 * computed. Nothing here has a default, a sample or a plausible-sounding
 * fallback, and that is the entire point of the module.
 *
 * <p>What it replaces: the analytics screen called an inference endpoint that
 * existed only in the Vite dev server, so in a shipped counter the call always
 * failed and the screen always rendered its `catch` branch — a block of
 * hardcoded prose. It told every shop that its financial health was 88 out of
 * 100, grade A; that "Radiance Lighting captures highest ticket value (GH₵
 * 1,245/order)"; and that clearing aged outdoor fixtures would release GH₵
 * 8,500. Beside it sat real charts drawn from real sales, which made the
 * invented half impossible to pick out.
 *
 * <p>An observation is only emitted when the figures it needs are present. A
 * shop with no cost visibility gets fewer observations, not softer ones.
 */

export type Trend = 'up' | 'down' | 'flat';
export type Severity = 'high' | 'medium' | 'low';

export interface Observation {
  /** Stable key, so React lists and tests do not depend on wording. */
  id: string;
  title: string;
  /** The finding, stated in terms of the figures it came from. */
  detail: string;
  trend: Trend;
}

export interface Risk {
  id: string;
  title: string;
  severity: Severity;
  detail: string;
}

/**
 * The figures an observation may be drawn from.
 *
 * <p>`grossProfit`, `cogs` and `marginPercent` are null for a user without
 * `report.view_profit` — FR-RPT-05 — and every observation that would need one
 * is then simply not produced.
 */
export interface TradingFigures {
  netRevenue: number;
  grossRevenue: number;
  refundTotal: number;
  refundCount: number;
  saleCount: number;
  averageSale: number;
  discountTotal: number;
  voidCount: number;
  voidedValue: number;
  operatingExpenses: number;
  outstandingCredit: number;
  cogs: number | null;
  grossProfit: number | null;
  marginPercent: number | null;
  /** Sales in the recent half of the period against the earlier half. */
  salesTrendPercent: number | null;
}

const pct = (value: number) => `${value.toFixed(1)}%`;
// The sign belongs in front of the symbol: "-GH₵2,000.00" reads as money
// owed, "GH₵-2,000.00" reads as a typo.
const money = (value: number) => {
  const text = Math.abs(value).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? '-' : ''}GH₵${text}`;
};

/** A share of a total, or null when there is no total to take a share of. */
const shareOf = (part: number, whole: number): number | null =>
  whole <= 0 ? null : (part / whole) * 100;

/**
 * What the figures say, in the order a shop owner would want to hear it.
 *
 * <p>Returns an empty list when there was no trade in the period. An empty
 * list is a legitimate answer — "nothing sold" — and the screen says so rather
 * than filling the space.
 */
export function observationsFrom(figures: TradingFigures): Observation[] {
  const found: Observation[] = [];
  if (figures.saleCount === 0) return found;

  if (figures.salesTrendPercent !== null && Math.abs(figures.salesTrendPercent) >= 5) {
    const rising = figures.salesTrendPercent > 0;
    found.push({
      id: 'sales-trend',
      title: rising ? 'Sales are rising' : 'Sales are falling',
      detail: `Takings in the second half of this period are ${pct(Math.abs(figures.salesTrendPercent))} `
        + `${rising ? 'above' : 'below'} the first half.`,
      trend: rising ? 'up' : 'down',
    });
  }

  if (figures.marginPercent !== null && figures.grossProfit !== null) {
    found.push({
      id: 'gross-margin',
      title: `Gross margin is ${pct(figures.marginPercent)}`,
      detail: `${money(figures.grossProfit)} gross profit on ${money(figures.netRevenue)} of net sales, `
        + `against ${money(figures.cogs ?? 0)} of stock sold.`,
      trend: figures.marginPercent >= 0 ? 'up' : 'down',
    });
  }

  if (figures.grossProfit !== null && figures.operatingExpenses > 0) {
    const net = figures.grossProfit - figures.operatingExpenses;
    found.push({
      id: 'net-position',
      title: net >= 0 ? 'The period is in profit' : 'The period is in loss',
      detail: `${money(figures.operatingExpenses)} of paid expenses against ${money(figures.grossProfit)} `
        + `gross profit leaves ${money(net)}.`,
      trend: net >= 0 ? 'up' : 'down',
    });
  }

  const discountShare = shareOf(figures.discountTotal, figures.grossRevenue);
  if (discountShare !== null && figures.discountTotal > 0) {
    found.push({
      id: 'discounts',
      title: `${pct(discountShare)} of takings went out as discount`,
      detail: `${money(figures.discountTotal)} was conceded across ${figures.saleCount} sales.`,
      trend: discountShare >= 10 ? 'down' : 'flat',
    });
  }

  if (figures.saleCount > 0) {
    found.push({
      id: 'basket',
      title: `The average sale is ${money(figures.averageSale)}`,
      detail: `${figures.saleCount} sales made ${money(figures.netRevenue)} net of returns.`,
      trend: 'flat',
    });
  }

  return found;
}

/**
 * What is worth somebody's attention, most serious first.
 *
 * <p>The thresholds are deliberately plain and few. A risk engine with
 * twenty rules nobody can recite is a risk engine nobody trusts.
 */
export function risksFrom(figures: TradingFigures): Risk[] {
  const found: Risk[] = [];

  const refundShare = shareOf(figures.refundTotal, figures.grossRevenue);
  if (refundShare !== null && refundShare >= 5) {
    found.push({
      id: 'refunds',
      title: 'Returns are taking a real share of takings',
      severity: refundShare >= 15 ? 'high' : 'medium',
      detail: `${figures.refundCount} returns worth ${money(figures.refundTotal)} — `
        + `${pct(refundShare)} of gross takings.`,
    });
  }

  const discountShare = shareOf(figures.discountTotal, figures.grossRevenue);
  if (discountShare !== null && discountShare >= 10) {
    found.push({
      id: 'discounting',
      title: 'Discounting is heavy',
      severity: discountShare >= 20 ? 'high' : 'medium',
      detail: `${money(figures.discountTotal)} conceded, ${pct(discountShare)} of gross takings. `
        + 'The discount report lists every one and who approved it.',
    });
  }

  if (figures.voidCount > 0) {
    const voidShare = shareOf(figures.voidCount, figures.saleCount + figures.voidCount);
    found.push({
      id: 'voids',
      title: 'Sales were voided in this period',
      severity: voidShare !== null && voidShare >= 5 ? 'medium' : 'low',
      detail: `${figures.voidCount} voided sales worth ${money(figures.voidedValue)}. `
        + 'The void log names the cashier and the reason for each.',
    });
  }

  if (figures.marginPercent !== null && figures.marginPercent < 0) {
    found.push({
      id: 'negative-margin',
      title: 'Stock is selling below what it cost',
      severity: 'high',
      detail: `Margin is ${pct(figures.marginPercent)}. Check the cost prices on recent goods receipts `
        + 'and any prices set below the floor.',
    });
  }

  if (figures.grossProfit !== null && figures.operatingExpenses > figures.grossProfit) {
    found.push({
      id: 'expenses-exceed-profit',
      title: 'Expenses are running ahead of gross profit',
      severity: 'high',
      detail: `${money(figures.operatingExpenses)} paid out against ${money(figures.grossProfit)} earned on stock.`,
    });
  }

  if (figures.outstandingCredit > 0 && figures.netRevenue > 0
      && figures.outstandingCredit > figures.netRevenue) {
    found.push({
      id: 'credit-exposure',
      title: 'Customer credit exceeds the period’s sales',
      severity: 'medium',
      detail: `${money(figures.outstandingCredit)} is outstanding on installment plans, `
        + `against ${money(figures.netRevenue)} sold in this period.`,
    });
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return found.sort((left, right) => order[left.severity] - order[right.severity]);
}
