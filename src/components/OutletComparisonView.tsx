import React, { useState, useMemo } from 'react';
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

interface OutletComparisonViewProps {
  outlets: Outlet[];
  products: Product[];
  sales: CompletedSale[];
}

type MetricMode = 'total' | 'average';

interface OutletMetrics {
  outlet: Outlet;
  // Totals
  totalRevenue: number;
  totalOrders: number;
  totalItems: number;
  grossProfit: number;
  marginPct: number;
  totalDiscounts: number;
  stockValuation: number;
  lowStockCount: number;
  // Averages per sale
  avgOrderValue: number;
  avgItemsPerSale: number;
  avgProfitPerSale: number;
  avgDiscountPerSale: number;
  revenuePerItem: number;
  // Profile
  theme: {
    headerBg: string;
    badgeBg: string;
    border: string;
    accentText: string;
  };
  topDriver: string;
  archetype: string;
}

export const OutletComparisonView: React.FC<OutletComparisonViewProps> = ({
  outlets,
  products,
  sales,
}) => {
  const [metricMode, setMetricMode] = useState<MetricMode>('total');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Compute metrics for each outlet dynamically
  const outletMetricsList: OutletMetrics[] = useMemo(() => {
    return outlets.map((outlet) => {
      const rawSales = sales.filter(
        (s) => s.outletId === outlet.id && s.status === 'COMPLETED'
      );

      // Branch seed / baseline configurations
      let baseRevenue = 0;
      let baseOrders = 0;
      let baseItems = 0;
      let baseDiscounts = 0;
      let baseMarginPct = 30.0;
      let archetype = 'General Trade Branch';
      let topDriver = 'Fast-moving installation essentials and standard retail lines.';
      let theme = {
        headerBg: 'bg-slate-900',
        badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
        border: 'border-slate-300',
        accentText: 'text-slate-900',
      };

      if (outlet.id === 'radiance-lighting') {
        baseRevenue = 34850.0;
        baseOrders = 28;
        baseItems = 142;
        baseDiscounts = 850.0;
        baseMarginPct = 40.0;
        archetype = 'High-Value Architectural Showroom';
        topDriver = 'Italian chandeliers, 48V magnetic track lights, and luxury pendants with premium retail margins.';
      } else if (outlet.id === 'inco-hardware') {
        baseRevenue = 32450.0;
        baseOrders = 95;
        baseItems = 712;
        baseDiscounts = 1420.0;
        baseMarginPct = 28.5;
        archetype = 'Bulk Contractor & Electrical Supply';
        topDriver = '2.5mm Twin & Earth Cable accounts for 41% of daily volume, supplied by Nexans Ghana.';
      } else if (outlet.id === 'apex-electricals') {
        baseRevenue = 16538.0;
        baseOrders = 77;
        baseItems = 590;
        baseDiscounts = 680.0;
        baseMarginPct = 32.0;
        archetype = 'Commercial & Urban Trade Counter';
        topDriver = 'PVC Conduit 20mm & 13A Single Sockets lead unit velocity in Kumasi trade branch.';
      }

      // Dynamic sales added in session
      const dynamicRevenue = rawSales.reduce((acc, s) => acc + s.total, 0);
      const dynamicOrders = rawSales.length;
      const dynamicItems = rawSales.reduce(
        (acc, s) => acc + s.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0
      );
      const dynamicDiscounts = rawSales.reduce((acc, s) => acc + (s.discountTotal || 0), 0);

      // Estimated gross profit
      const dynamicProfit = rawSales.reduce((acc, s) => {
        const saleCost = s.items.reduce((itemCost, it) => {
          const unitCost =
            it.frozenCostPrice ||
            (it.product.costPrice && it.product.costPrice[outlet.id]) ||
            it.unitPrice * 0.7;
          return itemCost + unitCost * it.quantity;
        }, 0);
        return acc + (s.total - saleCost);
      }, 0);

      const totalRevenue = baseRevenue + dynamicRevenue;
      const totalOrders = Math.max(1, baseOrders + dynamicOrders);
      const totalItems = Math.max(1, baseItems + dynamicItems);
      const totalDiscounts = baseDiscounts + dynamicDiscounts;
      const grossProfit = baseRevenue * (baseMarginPct / 100) + dynamicProfit;
      const marginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      // Inventory valuation & low stock count
      const stockValuation = products.reduce(
        (sum, p) => sum + (p.stock[outlet.id] || 0) * (p.costPrice[outlet.id] || 0),
        0
      );

      const lowStockCount = products.filter(
        (p) => (p.stock[outlet.id] || 0) <= (p.minStockAlert[outlet.id] || 10)
      ).length;

      // Unit Economics (Per Sale)
      const avgOrderValue = totalRevenue / totalOrders;
      const avgItemsPerSale = totalItems / totalOrders;
      const avgProfitPerSale = grossProfit / totalOrders;
      const avgDiscountPerSale = totalDiscounts / totalOrders;
      const revenuePerItem = totalRevenue / totalItems;

      return {
        outlet,
        totalRevenue,
        totalOrders,
        totalItems,
        grossProfit,
        marginPct,
        totalDiscounts,
        stockValuation,
        lowStockCount,
        avgOrderValue,
        avgItemsPerSale,
        avgProfitPerSale,
        avgDiscountPerSale,
        revenuePerItem,
        theme,
        topDriver,
        archetype,
      };
    });
  }, [outlets, products, sales]);

  // Max values for relative bar benchmarks
  const maxTotalRevenue = Math.max(...outletMetricsList.map((m) => m.totalRevenue), 1);
  const maxAOV = Math.max(...outletMetricsList.map((m) => m.avgOrderValue), 1);
  const maxTotalOrders = Math.max(...outletMetricsList.map((m) => m.totalOrders), 1);
  const maxItemsPerSale = Math.max(...outletMetricsList.map((m) => m.avgItemsPerSale), 1);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header with Metric Mode Segmented Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-[-0.025em]">
            Multi-Outlet Comparison
          </h1>
          <p className="text-sm font-normal text-slate-500 mt-1 tracking-normal">
            Comparative performance and operational analysis across all enterprise retail branches.
          </p>
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
              <BarChart3 className="w-3.5 h-3.5 text-orange-600" />
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
              <Scale className="w-3.5 h-3.5 text-blue-600" />
              <span>Average Per Sale (Unit Economics)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contextual Mode Explanation Banner */}
      <div
        className={`p-4 rounded-2xl border text-xs flex items-start gap-3 transition-colors ${
          metricMode === 'total'
            ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
            : 'bg-blue-50/70 border-blue-200/80 text-blue-950'
        }`}
      >
        <div
          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
            metricMode === 'total'
              ? 'bg-amber-200/70 text-amber-800'
              : 'bg-blue-200/70 text-blue-800'
          }`}
        >
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
              className={`text-[10px] font-mono px-2 py-0.2 rounded-full font-bold uppercase ${
                metricMode === 'total' ? 'bg-amber-200 text-amber-900' : 'bg-blue-200 text-blue-900'
              }`}
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
          const { outlet, theme } = metric;
          const isAovLeader = metric.avgOrderValue === maxAOV;
          const isRevenueLeader = metric.totalRevenue === maxTotalRevenue;

          return (
            <div
              key={outlet.id}
              className="bg-white rounded-2xl border border-slate-300 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col justify-between"
            >
              {/* Branch Header Banner */}
              <div
                className={`p-5 ${theme.headerBg} text-white flex justify-between items-start`}
              >
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                      Outlet {idx + 1} • {outlet.town}
                    </span>
                    {metricMode === 'total' && isRevenueLeader && (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/90 text-white px-2 py-0.5 rounded">
                        ★ Revenue Leader
                      </span>
                    )}
                    {metricMode === 'average' && isAovLeader && (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-slate-900 px-2 py-0.5 rounded">
                        ★ Highest AOV
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-black mt-1.5 tracking-tight">{outlet.name}</h2>
                  <p className="text-xs text-white/80 mt-0.5">
                    {outlet.address} • Prefix: {outlet.receiptPrefix}
                  </p>
                  <p className="text-[11px] text-white/70 italic mt-1 font-medium">
                    {metric.archetype}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                  <Store className="w-5 h-5 text-white/90" />
                </div>
              </div>

              {/* Dynamic Metric Content Body based on metricMode */}
              <div className="p-5 space-y-4 flex-1">
                {metricMode === 'total' ? (
                  /* ================= TOTAL VALUES MODE ================= */
                  <div className="space-y-4">
                    {/* Primary Hero Metric: Total Gross Revenue */}
                    <div className="p-3.5 bg-slate-900 text-white rounded-xl">
                      <div className="flex justify-between items-center text-[11px] text-slate-400 font-semibold">
                        <span>Total Gross Revenue</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {((metric.totalRevenue / maxTotalRevenue) * 100).toFixed(0)}% of Max
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono mt-1 text-white">
                        GH₵ {metric.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      {/* Visual Relative Scale Bar */}
                      <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div
                          className="bg-orange-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${(metric.totalRevenue / maxTotalRevenue) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Secondary Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                          Completed Orders
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          {metric.totalOrders} Orders
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                          Gross Profit ({metric.marginPct.toFixed(0)}%)
                        </span>
                        <strong className="text-base font-black text-emerald-400 block mt-1 font-mono">
                          GH₵ {metric.grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                          Stock Valuation
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          GH₵ {metric.stockValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                          Low Stock Alerts
                        </span>
                        <strong
                          className={`text-base font-black block mt-1 font-mono ${
                            metric.lowStockCount > 5 ? 'text-rose-400' : 'text-amber-400'
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
                    <div className="p-3.5 bg-slate-900 text-white rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center text-[11px] text-slate-400 font-semibold">
                        <span>Average Order Value (AOV)</span>
                        <span className="text-cyan-400 font-mono font-bold">
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
                          className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${(metric.avgOrderValue / maxAOV) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Secondary Per-Sale Unit Economics Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                          Basket Items
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          {metric.avgItemsPerSale.toFixed(1)} Items
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                          Profit Per Sale
                        </span>
                        <strong className="text-base font-black text-emerald-400 block mt-1 font-mono">
                          GH₵ {metric.avgProfitPerSale.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                          Avg Discount
                        </span>
                        <strong className="text-base font-black text-white block mt-1 font-mono">
                          GH₵ {metric.avgDiscountPerSale.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>

                      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                        <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                          Revenue / Unit
                        </span>
                        <strong className="text-base font-black text-cyan-400 block mt-1 font-mono">
                          GH₵ {metric.revenuePerItem.toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Key Revenue Driver Box */}
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                    <span>Branch Catalyst & Category Focus</span>
                  </span>
                  <p className="text-slate-600 leading-relaxed text-[11px]">{metric.topDriver}</p>
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
              <Layers className="w-4 h-4 text-orange-600" />
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
              className={`font-black uppercase text-[10px] px-2 py-0.5 rounded-md ${
                metricMode === 'total'
                  ? 'bg-orange-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}
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
              <tr className={metricMode === 'total' ? 'bg-orange-50/30' : 'bg-blue-50/30'}>
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
                    ? 'Inco Hardware leads in total volume via bulk contracting.'
                    : 'Radiance Lighting achieves ~3.6x higher ticket size via luxury chandeliers.'}
                </td>
              </tr>

              {/* Row 2: Sales Count / Items per Sale */}
              <tr className={metricMode === 'total' ? 'bg-orange-50/20' : 'bg-blue-50/20'}>
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-orange-600 shrink-0" />
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
                    ? 'Inco Hardware handles greatest order density.'
                    : 'Contractor mix at Inco drives highest items-per-basket (7.5 units).'}
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
                      ? `GH₵ ${m.grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${m.marginPct.toFixed(1)}%)`
                      : `GH₵ ${m.avgProfitPerSale.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </td>
                ))}
                <td className="py-3 px-4 text-slate-600 text-[11px]">
                  Radiance Lighting retains highest gross margin rate (40.0%).
                </td>
              </tr>

              {/* Row 4: Discount Impact */}
              <tr>
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-blue-600 shrink-0" />
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
                  Inco Hardware grants more trade discounts for repeat contractor volume.
                </td>
              </tr>

              {/* Row 5: Stock Assets Valuation */}
              <tr>
                <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                  <Package className="w-4 h-4 text-purple-600 shrink-0" />
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
                  Capital allocation balanced with branch sales velocity.
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
            <span className="text-amber-400 font-bold block mb-1">
              1. Volume vs Ticket Size Trade-off
            </span>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Toggling between <strong>Total Values</strong> and <strong>Average Per Sale</strong> exposes that high-volume trade outlets (Inco) rely on transaction velocity, while specialized showrooms (Radiance) maximize unit revenue per interaction.
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80">
            <span className="text-emerald-400 font-bold block mb-1">
              2. Unit Margin Preservation
            </span>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Average profit per sale is greatest at Radiance Lighting (GH₵ {outletMetricsList.find(o => o.outlet.id === 'radiance-lighting')?.avgProfitPerSale.toFixed(2) || '498.00'}), demonstrating high markup resilience on architectural fixtures compared to commodity cables.
            </p>
          </div>

          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80">
            <span className="text-blue-400 font-bold block mb-1">
              3. Procurement & Stock Buffer Alignment
            </span>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Low stock items in Inco Hardware require faster PO turnaround due to high unit depletion velocity (7.5 items/basket) compared to showroom inventory cycles.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

