import { request } from './apiClient';

/**
 * Reports — FR-RPT.
 *
 * Every figure here is the database's answer over the whole period asked for.
 * The screen used to add up whichever sales it happened to have loaded, which
 * is right at a hundred sales and quietly wrong at a hundred and one — a
 * year-to-date total that actually meant "the last hundred receipts".
 *
 * FR-RPT-05: `cost` and `profit` are absent, not zero, for a user without
 * `report.view_profit`. A number that reaches the browser has left the
 * building, so the server does not compute it.
 */
export interface ReportSummary {
  saleCount: number;
  revenue: number;
  discountTotal: number;
  averageSale: number;
  voidCount: number;
  voidedValue: number;
  /** How many returns happened in the period, and what they gave back. */
  refundCount: number;
  refundTotal: number;
  /**
   * Revenue less refunds — **the sales figure**.
   *
   * `revenue` stays gross on purpose: takings of 10,000 with 3,000 returned is a
   * different month from takings of 7,000 with none, and a shop wants to see
   * both. Anywhere a single "total sales" is shown, this is the one.
   */
  netRevenue: number;
  cost?: number | null;
  profit?: number | null;
  marginPercent?: number | null;
}

export interface ReportRow {
  key: string;
  name: string;
  secondary: string | null;
  quantity: number;
  revenue: number;
  cost?: number | null;
  profit?: number | null;
}

export interface ReportStockRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  outletId: string;
  outletName: string;
  quantity: number;
  reorderLevel: number;
  low: boolean;
  averageCost?: number | null;
  valueAtCost?: number | null;
  retailPrice: number;
}

export interface ReportExceptionRow {
  at: string | null;
  receiptNumber: string;
  outletId: string;
  outletName: string;
  productName: string | null;
  detail: string;
  amount: number;
  actor: string | null;
  approver: string | null;
  reason: string | null;
}

export interface DashboardOutlet {
  outletId: string | null;
  outletCode: string;
  outletName: string;
  salesToday: number;
  receiptsToday: number;
  expectedCash: number;
  lowStockCount: number;
  openShifts: number;
  profitToday?: number | null;
}

export interface DashboardView {
  asOf: string;
  outlets: DashboardOutlet[];
  combined: DashboardOutlet;
}

export interface ProfitAndLossWire {
  from: string;
  to: string;
  saleCount: number;
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  pendingExpenses: number;
  expensesByCategory: { category: string; label: string; amount: number }[];
  netProfit: number;
  netMarginPercent: number;
}

export type Grouping =
  | 'product' | 'category' | 'cashier' | 'customer' | 'customer_type' | 'payment' | 'movement';

/** FR-RPT-04: one bucket of the dashboard chart. */
export interface SeriesPoint {
  bucket: string;
  sales: number;
  purchases: number;
  receipts: number;
}

/** FR-RPT-03: outlet, date range, category, user and payment method. */
export interface ReportFilters {
  from?: Date | null;
  to?: Date | null;
  /** A server outlet id, or null for every branch the caller may see. */
  outletId?: string | null;
  category?: string | null;
  userId?: string | null;
  paymentMethod?: string | null;
}

const query = (filters: ReportFilters, extra: Record<string, string | number> = {}) => {
  const parameters = new URLSearchParams();
  if (filters.from) parameters.set('from', filters.from.toISOString());
  if (filters.to) parameters.set('to', filters.to.toISOString());
  if (filters.outletId) parameters.set('outletId', filters.outletId);
  if (filters.category) parameters.set('category', filters.category);
  if (filters.userId) parameters.set('userId', filters.userId);
  if (filters.paymentMethod) parameters.set('paymentMethod', filters.paymentMethod);
  Object.entries(extra).forEach(([key, value]) => parameters.set(key, String(value)));
  const rendered = parameters.toString();
  return rendered ? `?${rendered}` : '';
};

export const reportsApi = {
  summary: (filters: ReportFilters) =>
    request<ReportSummary>(`/api/reports/summary${query(filters)}`),

  breakdown: (by: Grouping, filters: ReportFilters, limit = 200) =>
    request<ReportRow[]>(`/api/reports/breakdown${query(filters, { by, limit })}`),

  ranking: (direction: 'best' | 'slow', filters: ReportFilters, limit = 20) =>
    request<ReportRow[]>(`/api/reports/ranking${query(filters, { direction, limit })}`),

  stock: (view: 'on-hand' | 'valuation' | 'low', filters: ReportFilters, limit = 500) =>
    request<ReportStockRow[]>(`/api/reports/stock${query(filters, { view, limit })}`),

  exceptions: (log: 'discount' | 'void', filters: ReportFilters, limit = 200) =>
    request<ReportExceptionRow[]>(`/api/reports/exceptions${query(filters, { log, limit })}`),

  /**
   * FR-RPT-04: takings and purchases over time.
   *
   * Every bucket in the range comes back, including the quiet ones — a chart
   * drawn only through the busy days is the wrong shape.
   */
  series: (bucket: 'DAY' | 'WEEK' | 'MONTH', filters: ReportFilters) =>
    request<SeriesPoint[]>(`/api/reports/series${query(filters, { bucket })}`),

  /** FR-RPT-01 · FR-RPT-02: scoped by the server to the branches you are assigned to. */
  dashboard: () => request<DashboardView>('/api/reports/dashboard'),

  profitAndLoss: (filters: ReportFilters) =>
    request<ProfitAndLossWire>(`/api/reports/profit-and-loss${query(filters)}`),
};
