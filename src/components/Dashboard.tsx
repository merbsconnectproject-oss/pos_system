import React, { useState } from 'react';
import {
  Calendar,
  Info,
  X,
  FileText,
  RefreshCw,
  Gift,
  ShieldCheck,
  Layers,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  Users,
  ShoppingBag,
  AlertTriangle,
  Package,
  TrendingUp,
  DollarSign,
  Wallet,
  Truck,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { SalesPurchaseChart } from './SalesPurchaseChart';
import { CustomerOverviewChart } from './CustomerOverviewChart';
import { Product, Outlet, CompletedSale } from '../types';

interface DashboardProps {
  products: Product[];
  currentOutlet: Outlet;
  sales: CompletedSale[];
  onOpenPos: () => void;
  onOpenGoodsReceipt: () => void;
  onViewAllLowStock: () => void;
  onSelectTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  products,
  currentOutlet,
  sales,
  onOpenPos,
  onOpenGoodsReceipt,
  onViewAllLowStock,
  onSelectTab,
}) => {
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState('Today (05/09/2026)');

  const outletId = currentOutlet.id === 'all-outlets' ? 'inco-hardware' : currentOutlet.id;

  // Filter products belonging to current store
  const outletProducts = products.filter((p) => {
    if (currentOutlet.id === 'all-outlets') return true;
    return !p.outletId || p.outletId === 'all-outlets' || p.outletId === currentOutlet.id;
  });

  // Real calculations
  const outletSales = sales.filter(
    (s) => currentOutlet.id === 'all-outlets' || s.outletId === currentOutlet.id
  );
  const totalSalesAmount =
    outletSales
      .filter((s) => s.status === 'COMPLETED')
      .reduce((sum, s) => sum + s.total, 0) +
    (currentOutlet.id === 'apex-electricals'
      ? 16538.0
      : currentOutlet.id === 'inco-hardware'
      ? 32450.0
      : 48988.0);

  const lowStockItems = outletProducts.filter((p) => {
    const targetStore = currentOutlet.id === 'all-outlets' ? (p.outletId || 'inco-hardware') : currentOutlet.id;
    const stock = p.stock[targetStore] || 0;
    const minAlert = p.minStockAlert[targetStore] || 10;
    return stock <= minAlert;
  });

  const totalValuation = outletProducts.reduce((sum, p) => {
    if (currentOutlet.id === 'all-outlets') {
      const incoStock = p.stock['inco-hardware'] || 0;
      const apexStock = p.stock['apex-electricals'] || 0;
      const incoCost = p.costPrice['inco-hardware'] || p.retailPrice * 0.7;
      const apexCost = p.costPrice['apex-electricals'] || p.retailPrice * 0.7;
      return sum + (incoStock * incoCost) + (apexStock * apexCost);
    } else {
      const stock = p.stock[currentOutlet.id] || 0;
      const cost = p.costPrice[currentOutlet.id] || p.retailPrice * 0.7;
      return sum + (stock * cost);
    }
  }, 0);

  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* 1. TOP HEADER & QUICK STATS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Executive Dashboard
            </h1>
            <span className="bg-orange-50 text-orange-600 border border-orange-200 text-xs font-black px-2.5 py-0.5 rounded-lg flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
              {currentOutlet.name}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Real-time branch inventory, POS transactions, and multi-tier trade metrics.
          </p>
        </div>

        {/* Date Range & Quick POS button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative">
            <button
              onClick={() => setDateRangeOpen(!dateRangeOpen)}
              className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{dateRange}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {dateRangeOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2 text-xs divide-y divide-slate-100 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1 text-[10px] font-black uppercase text-slate-400">
                  Filter Analytics Period
                </div>
                <div className="pt-1 space-y-0.5">
                  {[
                    'Today (05/09/2026)',
                    'Yesterday (04/09/2026)',
                    'This Week (29/08 - 05/09)',
                    'This Month (Sept 2026)',
                    'All Outlets Aggregate',
                  ].map((range) => (
                    <button
                      key={range}
                      onClick={() => {
                        setDateRange(range);
                        setDateRangeOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 font-medium text-slate-600 transition-colors cursor-pointer"
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onOpenPos}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black px-3.5 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <span>Launch POS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. DISMISSIBLE ALERT STRIP (PRD Low Stock Alert) */}
      {!alertDismissed && lowStockItems.length > 0 && (
        <div className="flex items-center justify-between bg-amber-50/90 border border-amber-200 text-slate-800 text-xs sm:text-sm rounded-2xl px-4 py-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Low Stock Notice:{' '}
              <strong className="text-amber-900 font-bold">{lowStockItems[0]?.name}</strong> has
              only{' '}
              <span className="font-bold underline">
                {lowStockItems[0]?.stock[outletId]} {lowStockItems[0]?.baseUnit}
              </span>{' '}
              left at {currentOutlet.name}.
            </span>
            <button
              onClick={onOpenGoodsReceipt}
              className="hidden sm:inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 font-black underline ml-2 cursor-pointer"
            >
              Post Goods Receipt (GRN) →
            </button>
          </div>

          <button
            onClick={() => setAlertDismissed(true)}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
            title="Dismiss Alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. FOUR PRIMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <DollarSign className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="flex items-center text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <ArrowUpRight className="w-3 h-3 mr-0.5" /> +22.4%
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Gross Revenue
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-0.5">
              GH₵ {totalSalesAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex justify-between items-center border-t border-slate-100 pt-2.5">
            <span>Completed Orders</span>
            <span className="font-bold text-slate-800 font-mono">{outletSales.length + 84}</span>
          </div>
        </div>

        {/* Card 2: Sales Returns / Voids */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <RefreshCw className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="flex items-center text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              <ArrowDownRight className="w-3 h-3 mr-0.5" /> -12.1%
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Sale Voids (BR-3)
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-0.5">
              GH₵ 1,478.00
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex justify-between items-center border-t border-slate-100 pt-2.5">
            <span>Reversed to Stock</span>
            <span className="font-bold text-slate-800 font-mono">3 Receipts</span>
          </div>
        </div>

        {/* Card 3: Goods Receipts / Procurement */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Truck className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="flex items-center text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              <ArrowUpRight className="w-3 h-3 mr-0.5" /> +18.7%
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Procurement (GRN)
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-0.5">
              GH₵ 24,145.00
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex justify-between items-center border-t border-slate-100 pt-2.5">
            <span>Weighted Cost Avg</span>
            <span className="font-bold text-slate-800 font-mono">BR-4 Standard</span>
          </div>
        </div>

        {/* Card 4: Inventory Valuation */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <Layers className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
              BR-1 Active
            </span>
          </div>
          <div className="mt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Stock Valuation (Cost)
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-0.5">
              GH₵ {totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex justify-between items-center border-t border-slate-100 pt-2.5">
            <span>Low Stock Alerts</span>
            <button
              onClick={onViewAllLowStock}
              className="font-bold text-rose-600 hover:underline cursor-pointer"
            >
              {lowStockItems.length} Items Alert
            </button>
          </div>
        </div>
      </div>

      {/* 4. SECONDARY STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400">Gross Margin (BR-5 Frozen)</span>
            <div className="text-base font-black text-slate-900 font-mono mt-0.5">
              GH₵ 14,858.00
            </div>
            <span className="text-[10px] text-emerald-600 font-bold">30.3% Profitability</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400">MoMo Payment Share</span>
            <div className="text-base font-black text-slate-900 font-mono mt-0.5">64% Mobile Money</div>
            <span className="text-[10px] text-amber-600 font-bold">MTN / Telecel Verified</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Wallet className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400">Supplier Payables (Net 30)</span>
            <div className="text-base font-black text-slate-900 font-mono mt-0.5">
              GH₵ 18,400.00
            </div>
            <span className="text-[10px] text-slate-400 font-medium">Due in 14 days</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
            <FileText className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-300">Terminal Cashier</span>
            <div className="text-base font-black mt-0.5">Drawer Open</div>
            <button
              onClick={() => onSelectTab('shifts')}
              className="text-[10px] text-orange-400 font-bold hover:underline cursor-pointer"
            >
              Blind Cash Count (BR-14) →
            </button>
          </div>
          <button
            onClick={() => onSelectTab('shifts')}
            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 rounded-xl text-xs font-black text-white shadow-xs cursor-pointer"
          >
            Float
          </button>
        </div>
      </div>

      {/* 5. CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SalesPurchaseChart />
        </div>
        <div className="lg:col-span-1">
          <CustomerOverviewChart />
        </div>
      </div>

      {/* 6. BOTTOM ROW: TOP SELLING PRODUCTS & RECENT COMPLETED SALES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Selling Products */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-500" />
              <h3 className="font-black text-sm text-slate-900">Top Velocity Products</h3>
            </div>
            <button
              onClick={() => onSelectTab('products')}
              className="text-xs font-bold text-orange-600 hover:underline cursor-pointer"
            >
              View Catalogue ({outletProducts.length})
            </button>
          </div>

          <div className="space-y-2.5">
            {outletProducts.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                  />
                  <div>
                    <div className="font-bold text-xs text-slate-900">{p.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {p.category} • SKU: {p.sku}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-xs text-slate-900 font-mono">
                    GH₵ {p.retailPrice.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-emerald-600 font-bold">{p.salesCount} sold</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Completed Sales */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-orange-500" />
              <h3 className="font-black text-sm text-slate-900">Recent Completed Orders</h3>
            </div>
            <button
              onClick={() => onSelectTab('sales-history')}
              className="text-xs font-bold text-orange-600 hover:underline cursor-pointer"
            >
              View All Orders
            </button>
          </div>

          <div className="space-y-2.5">
            {outletSales.slice(0, 4).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-slate-900">
                      {s.receiptNumber}
                    </span>
                    <span className="text-[10px] text-slate-400">{s.createdAt}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                    {s.customerName} ({s.customerType})
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-xs text-slate-900 font-mono">
                    GH₵ {s.total.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold">
                    {s.payments[0]?.provider || s.payments[0]?.method.toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
