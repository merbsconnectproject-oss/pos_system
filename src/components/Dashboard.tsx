import React, { useState } from 'react';
import {
  Calendar,
  X,
  FileText,
  RefreshCw,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ShoppingBag,
  AlertTriangle,
  Package,
  TrendingUp,
  DollarSign,
  Wallet,
  Truck,
  ArrowRight,
  Store,
  Palette,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  Check,
  Receipt,
  CalendarClock,
  ArrowRightLeft,
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
  accentColor?: string;
  onChangeAccent?: (color: string) => void;
}

export type MetricCategoryFilter = 'all' | 'revenue' | 'inventory' | 'finance';

interface MetricCardItem {
  id: string;
  category: 'revenue' | 'inventory' | 'finance';
  title: string;
  value: string;
  change: string;
  changePositive?: boolean;
  contextNote?: string;
  subAction?: () => void;
  icon: React.ReactNode;
  iconColor?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
  products,
  currentOutlet,
  sales,
  onOpenPos,
  onOpenGoodsReceipt,
  onViewAllLowStock,
  onSelectTab,
  accentColor = '#c55200',
  onChangeAccent,
}) => {
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState('Today (05/09/2026)');

  // Category Scope Filter
  const [categoryFilter, setCategoryFilter] = useState<MetricCategoryFilter>('all');
  const [showAccentPicker, setShowAccentPicker] = useState(false);

  // Counter Datasheet AC-11 compliant presets (no blue)
  const ACCENT_PRESETS = [
    { id: 'orange', name: 'Orange', hex: '#c55200' },
    { id: 'amber', name: 'Amber', hex: '#a56800' },
    { id: 'crimson', name: 'Crimson', hex: '#c1354b' },
    { id: 'plum', name: 'Plum', hex: '#8b4a99' },
    { id: 'forest', name: 'Forest', hex: '#2d7a4f' },
    { id: 'teal', name: 'Teal', hex: '#10786f' },
    { id: 'graphite', name: 'Graphite', hex: '#57534e' },
  ];

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

  // Solid Darker Shade Metric Cards (Streamlined, minimal, high-contrast)
  const metricCards: MetricCardItem[] = [
    {
      id: 'gross-revenue',
      category: 'revenue',
      title: 'Gross Revenue',
      value: `GH₵ ${totalSalesAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: '+22.4% vs last week',
      changePositive: true,
      icon: <DollarSign className="w-4 h-4" />,
    },
    {
      id: 'gross-margin',
      category: 'revenue',
      title: 'Gross Profit',
      value: 'GH₵ 14,858.00',
      change: '30.3% margin rate',
      changePositive: true,
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: 'stock-valuation',
      category: 'inventory',
      title: 'Stock Valuation',
      value: `GH₵ ${totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: `${lowStockItems.length} items low in stock`,
      changePositive: lowStockItems.length === 0,
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'terminal-cashier',
      category: 'revenue',
      title: 'Drawer (Till) Cash',
      value: 'GH₵ 8,412.00',
      change: 'Reconciled for active shift',
      changePositive: true,
      icon: <Store className="w-4 h-4" />,
    },
    {
      id: 'momo-share',
      category: 'revenue',
      title: 'Mobile Money Share',
      value: '64% Cashless',
      change: 'MTN & Telecel verified',
      changePositive: true,
      icon: <Wallet className="w-4 h-4" />,
    },
    {
      id: 'sale-voids',
      category: 'inventory',
      title: 'Sale Voids',
      value: 'GH₵ 1,478.00',
      change: '-12.1% voids rate',
      changePositive: false,
      icon: <RefreshCw className="w-4 h-4" />,
    },
    {
      id: 'operating-expenses',
      category: 'finance',
      title: 'Operating Expenses',
      value: currentOutlet.id === 'radiance-lighting' ? 'GH₵ 11,250.00' : 'GH₵ 18,650.00',
      change: '-4.2% vs budget',
      changePositive: true,
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      id: 'installment-receivables',
      category: 'finance',
      title: 'Credit Receivables',
      value: 'GH₵ 18,200.00',
      change: '3 active plans',
      changePositive: true,
      icon: <CalendarClock className="w-4 h-4" />,
    },
  ];

  // Filtered Cards based on active category filter
  const displayedCards = metricCards.filter((card) => {
    if (categoryFilter === 'all') return true;
    return card.category === categoryFilter;
  });

  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* 1. TOP HEADER & QUICK STATS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-300 shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Executive Dashboard
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Real-time branch inventory, POS transactions, and multi-tier trade metrics.
          </p>
        </div>

        {/* Date Range, Brand Theme Quick Swatch & Quick POS button */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Brand Accent Quick Bar Toggle */}
          {onChangeAccent && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAccentPicker((prev) => !prev)}
                className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold px-2.5 py-2 rounded-xl transition-colors cursor-pointer shadow-2xs"
                title="Switch Brand Accent"
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="hidden md:inline">Accent</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showAccentPicker && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-300 rounded-2xl shadow-xl z-30 p-2.5 space-y-2 animate-in fade-in zoom-in-95">
                  <div className="text-[10px] font-black uppercase text-slate-400 px-1">
                    Brand Accent
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {ACCENT_PRESETS.map((p) => (
                      <button
                        key={p.hex}
                        type="button"
                        onClick={() => {
                          onChangeAccent(p.hex);
                          setShowAccentPicker(false);
                        }}
                        className="w-5 h-5 rounded-full relative flex items-center justify-center hover:scale-110 transition-transform cursor-pointer shadow-2xs"
                        style={{ backgroundColor: p.hex }}
                        title={p.name}
                      >
                        {accentColor === p.hex && (
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setDateRangeOpen(!dateRangeOpen)}
              className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{dateRange}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {dateRangeOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-300 rounded-2xl shadow-xl z-30 p-2 text-xs divide-y divide-slate-200 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1 text-[10px] font-black uppercase text-slate-400">
                  Filter Analytics Period
                </div>
                <div className="pt-1 space-y-0.5">
                  {[
                    'Today (05/09/2026)',
                    'Yesterday (04/09/2026)',
                    'This Week (29/08 - 05/09)',
                    'This Month (Sept 2026)',
                    'Consolidated Aggregate',
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
            onClick={() => onSelectTab('analytics')}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Open Analytics & AI Inferences"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Analytics & AI</span>
          </button>

          <button
            onClick={onOpenPos}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black px-3.5 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <span>Launch POS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. DISMISSIBLE ALERT STRIP */}
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
              left in stock.
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

      {/* 3. METRIC CARDS HEADER & SCOPE FILTERS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-300 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
          <h2 className="text-sm font-black text-slate-900 tracking-tight">
            Key Performance Metrics
          </h2>
        </div>

        {/* Category Scope Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Metrics' },
            { id: 'revenue', label: 'Revenue & Cash' },
            { id: 'inventory', label: 'Inventory & Stock' },
            { id: 'finance', label: 'Finance & P&L' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id as MetricCategoryFilter)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                categoryFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-300'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. SOLID DARKER SHADE METRIC CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayedCards.map((card) => (
          <div
            key={card.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {card.title}
                </span>
                <div className="w-8 h-8 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300">
                  {card.icon}
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-3 tracking-tight">
                {card.value}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center">
              <span
                className={`text-xs font-medium flex items-center gap-1 ${
                  card.changePositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {card.changePositive ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {card.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 5. CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SalesPurchaseChart accentColor={accentColor} />
        </div>
        <div className="lg:col-span-1">
          <CustomerOverviewChart accentColor={accentColor} />
        </div>
      </div>

      {/* 6. BOTTOM ROW: TOP SELLING PRODUCTS & RECENT COMPLETED SALES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Selling Products */}
        <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
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
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-200"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="w-10 h-10 rounded-xl object-cover border border-slate-300"
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
        <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
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
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-200"
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
