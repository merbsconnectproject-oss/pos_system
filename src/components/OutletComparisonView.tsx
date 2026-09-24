import React, { useEffect, useMemo, useState } from 'react';
import {
  Store,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  AlertTriangle,
  Layers,
  Scale,
  BarChart3,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Percent,
  CheckCircle2,
  Building2,
  Package,
  Info,
} from 'lucide-react';
import { Outlet, Product, CompletedSale } from '../types';
import { InfoHint } from './InfoHint';
import { reportsApi } from '../reportsApi';

interface OutletComparisonViewProps {
  outlets: Outlet[];
  products: Product[];
  sales: CompletedSale[];
}

type MetricMode = 'total' | 'average';

/**
 * One branch's trading, as the server computed it.
 *
 * <p>`grossProfit` and `marginPct` are null for a reader without
 * `report.view_profit` — FR-RPT-05 — and the screen leaves those cells blank
 * rather than showing a zero that reads as "made no money".
 */
interface OutletMetrics {
  outlet: Outlet;
  // Totals, all net of returns
  totalRevenue: number;
  totalOrders: number;
  totalItems: number;
  grossProfit: number | null;
  marginPct: number | null;
  totalDiscounts: number;
  refundTotal: number;
  stockValuation: number;
  lowStockCount: number;
  // Averages per sale
  avgOrderValue: number;
  avgItemsPerSale: number;
  avgProfitPerSale: number | null;
  avgDiscountPerSale: number;
  revenuePerItem: number;
}

export const OutletComparisonView: React.FC<OutletComparisonViewProps> = ({
  outlets,
  products,
  sales,
}) => {
  const [metricMode, setMetricMode] = useState<MetricMode>('total');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  /**
   * FR-RPT-03 · FR-RPT-04: every figure below comes from the server.
   *
   * <p>What was here instead: a per-branch block of literals — Radiance
   * Lighting opened at GH₵34,850 of revenue on 28 orders at a 40% margin,
   * Inco Hardware at GH₵32,450 on 95 — added to whatever sales the browser had
   * loaded. Gross profit was that invented revenue times an invented margin,
   * and any line whose cost was missing fell back to 70% of its selling price.
   * Every comparison on the screen was therefore a comparison of two seeds.
   *
   * <p>One summary call per branch. There are two or three branches, and the
   * alternative — a grouping the reports API does not have — would have been a
   * new endpoint for a screen that can ask the existing one.
   */
  const [rows, setRows] = useState<OutletMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setFailed(false);

    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86400000);

    Promise.all(outlets.map(async (outlet) => {
      const filters = { from, to, outletId: outlet.id };
      const [summary, byProduct, valuation, low] = await Promise.all([
        reportsApi.summary(filters),
        // Units moved, which the summary does not carry — it counts receipts.
        // Summed from the product breakdown rather than estimated.
        reportsApi.breakdown('product', filters, 1000),
        reportsApi.stock('valuation', { from: null, to: null, outletId: outlet.id }),
        reportsApi.stock('low', { from: null, to: null, outletId: outlet.id }),
      ]);

      const orders = summary.saleCount;
      const items = byProduct.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
      const profit = summary.profit == null ? null : Number(summary.profit);

      return {
        outlet,
        totalRevenue: Number(summary.netRevenue),
        totalOrders: orders,
        totalItems: items,
        grossProfit: profit,
        marginPct: summary.marginPercent == null ? null : Number(summary.marginPercent),
        totalDiscounts: Number(summary.discountTotal),
        refundTotal: Number(summary.refundTotal),
        stockValuation: valuation.reduce((sum, row) => sum + Number(row.valueAtCost ?? 0), 0),
        lowStockCount: low.length,
        avgOrderValue: Number(summary.averageSale),
        avgItemsPerSale: orders === 0 ? 0 : items / orders,
        avgProfitPerSale: profit === null || orders === 0 ? null : profit / orders,
        avgDiscountPerSale: orders === 0 ? 0 : Number(summary.discountTotal) / orders,
        revenuePerItem: items === 0 ? 0 : Number(summary.netRevenue) / items,
      } satisfies OutletMetrics;
    }))
      .then((computed) => { if (current) setRows(computed); })
      .catch(() => {
        if (!current) return;
        // Empty and said out loud. A comparison screen that falls back to
        // something plausible is how the seeds got here in the first place.
        setRows([]);
        setFailed(true);
      })
      .finally(() => { if (current) setLoading(false); });

    return () => { current = false; };
  }, [outlets]);

  const outletMetricsList = rows;

  /**
   * FR-RPT-04: which branch leads on a measure, stated from the measure.
   *
   * <p>Returns null when there is nothing to compare — one branch, no trade,
   * or a tie. The commentary column used to be four fixed sentences naming
   * specific shops and specific percentages ("Radiance Lighting retains
   * highest gross margin rate (40.0%)") whatever the branches had actually
   * done, and whatever branches existed.
   */
  const leaderOn = (
    pick: (metric: OutletMetrics) => number | null,
    describe: (name: string, value: number) => string,
  ): string | null => {
    const scored = outletMetricsList
      .map((metric) => ({ name: metric.outlet.name, value: pick(metric) }))
      .filter((row): row is { name: string; value: number } => row.value !== null && row.value > 0)
      .sort((left, right) => right.value - left.value);

    if (scored.length < 2) return null;
    if (scored[0].value === scored[1].value) return null;
    return describe(scored[0].name, scored[0].value);
  };

  // Max values for relative bar benchmarks
  const maxTotalRevenue = Math.max(...outletMetricsList.map((m) => m.totalRevenue), 1);
  const maxAOV = Math.max(...outletMetricsList.map((m) => m.avgOrderValue), 1);
  const maxTotalOrders = Math.max(...outletMetricsList.map((m) => m.totalOrders), 1);
  const maxItemsPerSale = Math.max(...outletMetricsList.map((m) => m.avgItemsPerSale), 1);

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
        <div className="bg-white p-6 rounded-2xl border border-slate-300 text-sm text-slate-500">
          Reading branch figures&hellip;
        </div>
      </div>
    );
  }

  if (failed) {
    // Said plainly. The alternative — showing something plausible — is how
    // this screen came to have a seeded revenue for every branch.
    return (
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
        <div className="bg-white p-6 rounded-2xl border border-red-200 text-sm text-red-700">
          Branch figures could not be read from the server. Nothing is shown rather
          than an estimate.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header with Metric Mode Segmented Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Multi-Outlet Comparison</h1><InfoHint text="Compare sales, margins, basket size, and operational performance across enterprise retail branches." /></div>
        </div>

        {/* Primary Toggle: 'Total Values' vs 'Average Per Sale' */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
            Metric View:
          </span>
          <div className="inline-flex bg-slate-100 p-1.5 rounded-xl border border-slate-300 text-xs shadow-inner">
            <button
              type="button"
              id="outlet-comparison-toggle-total"
              onClick={() => setMetricMode('total')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-2 ${
                metricMode === 'total'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-accent-600" />
              <span>Total Values (Volume)</span>
            </button>

            <button
              type="button"
              id="outlet-comparison-toggle-average"
              onClick={() => setMetricMode('average')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-2 ${
                metricMode === 'average'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-slate-500" />
              <span>Average Per Sale (Unit Economics)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contextual Mode Explanation Banner */}
      <div
        className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 text-xs flex items-start gap-3 transition-colors"
      >
        <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-white border border-slate-200 text-slate-600">
          {metricMode === 'total' ? (
            <BarChart3 className="w-4 h-4" />
          ) : (
            <Scale className="w-4 h-4" />
          )}
        </div>
        <div className="space-y-0.5">
          <div className="font-extrabold text-sm flex items-center gap-2">
            <span>
              {metricMode === 'total'
                ? 'Total Values Mode: Cumulative Sales & Asset Footprint'
                : 'Average Per Sale Mode: Ticket Size & Unit Economics'}
            </span>
            <span
              className="text-[10px] font-mono px-2 py-0.2 rounded-full font-bold uppercase bg-white text-slate-700 border border-slate-200"
            >
              {metricMode === 'total' ? 'Aggregate Scale' : 'Per-Transaction Analysis'}
            </span>
          </div>
          <p className="text-slate-600 leading-relaxed">
            {metricMode === 'total'
              ? 'Analyzing gross revenue turnover, aggregate order count, total units sold, and active warehouse inventory valuation across all outlets. Best for understanding total store capacity, gross profit generation, and working capital commitment.'
              : 'Analyzing per-transaction performance: Average Order Value (AOV / Basket Size), units per checkout, gross profit per order, and discount concession per receipt. Isolates operational counter efficiency from store footfall and physical store square footage.'}
          </p>
        </div>
      </div>

      {/* Side-by-Side Outlet Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {outletMetricsList.map((metric, idx) => {
          const { outlet } = metric;
          const isAovLeader = metric.avgOrderValue === maxAOV;
          const isRevenueLeader = metric.totalRevenue === maxTotalRevenue;

          return (
            <div
              key={outlet.id}
              className="bg-white rounded-2xl border border-slate-300 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between"
            >
              {/* Branch Header */}
              <div className="p-5 bg-white border-b border-slate-200 text-slate-900 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded">
                      Outlet {idx + 1} • {outlet.town}
                    </span>
                    {metricMode === 'total' && isRevenueLeader && (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-accent-50 text-accent-700 border border-accent-200 px-2 py-0.5 rounded">
                        Revenue Leader
                      </span>
                    )}
                    {metricMode === 'average' && isAovLeader && (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-accent-50 text-accent-700 border border-accent-200 px-2 py-0.5 rounded">
                        Highest AOV
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-black mt-1.5 tracking-tight">{outlet.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {outlet.address} • Prefix: {outlet.receiptPrefix}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    {metric.outlet.address || metric.outlet.phone || 'Branch'}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-200 shrink-0">
                  <Store className="w-5 h-5 text-accent-600" />
                </div>
              </div>

              {/* Dynamic Metric Content Body based on metricMode */}
              <div className="p-5 space-y-4 flex-1">
                {metricMode === 'total' ? (
                  /* ================= TOTAL VALUES MODE ================= */
                  <div className="space-y-4">
                    {/* Primary Hero Metric: Total Gross Revenue */}
                    <div className="p-3.5 bg-slate-950 text-white rounded-xl border border-slate-900">
                      <div className="flex justify-between items-center text-[11px] text-slate-200 font-semibold">
                        <span>Total Gross Revenue</span>
                        <span className="text-accent-300 font-mono font-bold">
                          {((metric.totalRevenue / maxTotalRevenue) * 100).toFixed(0)}% of Max
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono mt-1 text-white">
                        GH₵ {metric.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      {/* Visual Relative Scale Bar */}
                      <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div
                          className="bg-accent-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${(metric.totalRevenue / maxTotalRevenue) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Secondary Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 text-white">
                        <span className="text-slate-200 block text-[10px] font-bold uppercase tracking-wider">
                          Completed Orders
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          {metric.totalOrders} Orders
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 text-white">
                        <span className="text-slate-200 block text-[10px] font-bold uppercase tracking-wider">
                          Gross Profit ({metric.marginPct.toFixed(0)}%)
                        </span>
                        <strong className="text-base font-black text-emerald-300 block mt-1 font-mono">
                          GH₵ {metric.grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 text-white">
                        <span className="text-slate-200 block text-[10px] font-bold uppercase tracking-wider">
                          Stock Valuation
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          GH₵ {metric.stockValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 text-white">
                        <span className="text-slate-200 block text-[10px] font-bold uppercase tracking-wider">
                          Low Stock Alerts
                        </span>
                        <strong
                          className={`text-base font-black block mt-1 font-mono ${
                            metric.lowStockCount > 5 ? 'text-rose-300' : 'text-amber-300'
                          }`}
                        >
                          {metric.lowStockCount} Products
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ================= AVERAGE PER SALE MODE ================= */
                  <div className="space-y-4">
                    {/* Primary Hero Metric: Average Order Value (AOV) */}
                    <div className="p-3.5 bg-slate-950 text-white rounded-xl border border-slate-900">
                      <div className="flex justify-between items-center text-[11px] text-slate-200 font-semibold">
                        <span>Average Order Value (AOV)</span>
                        <span className="text-accent-300 font-mono font-bold">
                          {((metric.avgOrderValue / maxAOV) * 100).toFixed(0)}% of Max
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono mt-1 text-white">
                        GH₵ {metric.avgOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-xs font-normal text-slate-400">/ sale</span>
                      </div>
                      {/* Visual Relative Scale Bar */}
                      <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div
                          className="bg-accent-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${(metric.avgOrderValue / maxAOV) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Secondary Per-Sale Unit Economics Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 text-white">
                        <span className="text-slate-200 block text-[10px] font-bold uppercase tracking-wider">
                          Basket Items
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          {metric.avgItemsPerSale.toFixed(1)} Items
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 text-white">
                        <span className="text-slate-200 block text-[10px] font-bold uppercase tracking-wider">
                          Profit Per Sale
                        </span>
                        <strong className="text-base font-black text-emerald-300 block mt-1 font-mono">
                          GH₵ {metric.avgProfitPerSale.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 text-white">
                        <span className="text-slate-200 block text-[10px] font-bold uppercase tracking-wider">
                          Avg Discount
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          GH₵ {metric.avgDiscountPerSale.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-900 text-white">
                        <span className="text-slate-200 block text-[10px] font-bold uppercase tracking-wider">
                          Revenue / Unit
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          GH₵ {metric.revenuePerItem.toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Key Revenue Driver Box */}
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent-500" />
                    <span>Returns and discounts</span>
                  </span>
                  <p className="text-slate-600 leading-relaxed text-[11px]">
                    GH₵ {metric.refundTotal.toFixed(2)} refunded and GH₵{' '}
                    {metric.totalDiscounts.toFixed(2)} conceded in this period.
                  </p>
                </div>
              </div>

              {/* Branch Card Footer Status */}
              <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Manager: {outlet.managerName || 'Assigned Lead'}
                </span>
                <span className="font-mono font-bold text-slate-700">
                  {metricMode === 'total'
                    ? `${metric.totalOrders} total sales`
                    : `GH₵ ${metric.avgOrderValue.toFixed(0)} avg ticket`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparative Cross-Branch Summary Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent-600" />
              <span>Direct Cross-Branch Benchmark Matrix</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Side-by-side performance evaluation in{' '}
              <strong className="text-slate-800">
                {metricMode === 'total' ? 'Total Values (Volume)' : 'Average Per Sale (Unit Economics)'}
              </strong>{' '}
              mode.
            </p>
          </div>

          <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl self-start sm:self-auto flex items-center gap-2">
            <span>Current Display:</span>
            <span
              className="font-black uppercase text-[10px] px-2 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200"
            >
              {metricMode === 'total' ? 'Total Cumulative' : 'Per-Sale Averages'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-300">
              <tr>
                <th className="py-3.5 px-4">Metric Dimension</th>
                {outletMetricsList.map((m) => (
                  <th key={m.outlet.id} className="py-3.5 px-4 font-black text-slate-800">
                    {m.outlet.name}
                    <span className="block text-[9px] font-normal text-slate-400 capitalize">
                      {m.outlet.town}
                    </span>
                  </th>
                ))}
                <th className="py-3.5 px-4">Variance & Insight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {/* Row 1: Gross Revenue / AOV */}
              <tr className="bg-slate-50/70">
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span>{metricMode === 'total' ? 'Gross Revenue' : 'Average Order Value (AOV)'}</span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      {metricMode === 'total' ? 'Total monetary sales inflow' : 'Revenue earned per customer receipt'}
                    </span>
                  </div>
                </td>
                {outletMetricsList.map((m) => (
                  <td key={m.outlet.id} className="py-3 px-4 font-mono font-bold text-slate-900">
                    {metricMode === 'total'
                      ? `GH₵ ${m.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : `GH₵ ${m.avgOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </td>
                ))}
                <td className="py-3 px-4 text-slate-600 text-[11px]">
                  {metricMode === 'total'
                    ? leaderOn((m) => m.totalRevenue,
                        (name, value) => `${name} took the most: GH₵ ${value.toFixed(2)}.`) ?? '—'
                    : leaderOn((m) => m.avgOrderValue,
                        (name, value) => `${name} has the highest average sale at GH₵ ${value.toFixed(2)}.`) ?? '—'}
                </td>
              </tr>

              {/* Row 2: Sales Count / Items per Sale */}
              <tr className="bg-slate-50/40">
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-accent-600 shrink-0" />
                  <div>
                    <span>{metricMode === 'total' ? 'Completed Transactions' : 'Items Per Basket'}</span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      {metricMode === 'total' ? 'Receipt volume generated' : 'Average line items per ticket'}
                    </span>
                  </div>
                </td>
                {outletMetricsList.map((m) => (
                  <td key={m.outlet.id} className="py-3 px-4 font-mono font-bold text-slate-900">
                    {metricMode === 'total'
                      ? `${m.totalOrders} Orders`
                      : `${m.avgItemsPerSale.toFixed(1)} Items / Sale`}
                  </td>
                ))}
                <td className="py-3 px-4 text-slate-600 text-[11px]">
                  {metricMode === 'total'
                    ? leaderOn((m) => m.totalOrders,
                        (name, value) => `${name} rang up the most sales: ${value}.`) ?? '—'
                    : leaderOn((m) => m.avgItemsPerSale,
                        (name, value) => `${name} has the largest basket at ${value.toFixed(1)} units.`) ?? '—'}
                </td>
              </tr>

              {/* Row 3: Gross Profit Yield */}
              <tr>
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span>{metricMode === 'total' ? 'Gross Profit Margin (GH₵)' : 'Profit Per Sale'}</span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      Net sales minus cost of goods sold (COGS)
                    </span>
                  </div>
                </td>
                {outletMetricsList.map((m) => (
                  <td key={m.outlet.id} className="py-3 px-4 font-mono font-bold text-emerald-700">
                    {metricMode === 'total'
                      ? m.grossProfit === null
                        // FR-RPT-05: no cost was sent, so there is no profit to
                        // show. A dash, never a zero.
                        ? '—'
                        : `GH₵ ${m.grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          + `${m.marginPct === null ? '' : ` (${m.marginPct.toFixed(1)}%)`}`
                      : m.avgProfitPerSale === null
                        ? '—'
                        : `GH₵ ${m.avgProfitPerSale.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </td>
                ))}
                <td className="py-3 px-4 text-slate-600 text-[11px]">
                  {leaderOn((m) => m.marginPct,
                    (name, value) => `${name} holds the highest gross margin at ${value.toFixed(1)}%.`)
                    ?? '—'}
                </td>
              </tr>

              {/* Row 4: Discount Impact */}
              <tr>
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <span>{metricMode === 'total' ? 'Total Discounts Conceded' : 'Avg Discount / Ticket'}</span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      Price concessions & trade discounts
                    </span>
                  </div>
                </td>
                {outletMetricsList.map((m) => (
                  <td key={m.outlet.id} className="py-3 px-4 font-mono font-bold text-slate-800">
                    {metricMode === 'total'
                      ? `GH₵ ${m.totalDiscounts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : `GH₵ ${m.avgDiscountPerSale.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </td>
                ))}
                <td className="py-3 px-4 text-slate-600 text-[11px]">
                  {leaderOn((m) => m.totalDiscounts,
                    (name, value) => `${name} conceded the most, GH₵ ${value.toFixed(2)}.`)
                    ?? '—'}
                </td>
              </tr>

              {/* Row 5: Stock Assets Valuation */}
              <tr>
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <span>Warehouse Stock Valuation</span>
                    <span className="block text-[10px] text-slate-400 font-normal">
                      Weighted cost value of held inventory
                    </span>
                  </div>
                </td>
                {outletMetricsList.map((m) => (
                  <td key={m.outlet.id} className="py-3 px-4 font-mono font-bold text-slate-800">
                    GH₵ {m.stockValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                ))}
                <td className="py-3 px-4 text-slate-600 text-[11px]">
                  {leaderOn((m) => m.stockValuation,
                    (name, value) => `${name} holds the most stock at cost, GH₵ ${value.toFixed(2)}.`)
                    ?? '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategic Operational Insights Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-md">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
            Multi-Branch Analytical Summary & Takeaways
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80">
            <span className="text-accent-300 font-bold block mb-1">Busiest branch</span>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              {leaderOn((m) => m.totalOrders,
                (name, value) => `${name} rang up ${value} sales in this period.`)
                ?? 'Not enough trade across branches to compare.'}
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80">
            <span className="text-emerald-300 font-bold block mb-1">Largest basket</span>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              {leaderOn((m) => m.avgOrderValue,
                (name, value) => `${name} has the highest average sale at GH₵ ${value.toFixed(2)}.`)
                ?? 'Not enough trade across branches to compare.'}
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80">
            <span className="text-slate-100 font-bold block mb-1">Reordering</span>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              {leaderOn((m) => m.lowStockCount,
                (name, value) => `${name} has ${value} lines at or below reorder level.`)
                ?? 'No branch is carrying more low stock than another.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
