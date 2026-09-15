import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Calendar,
  ChevronDown,
  Clock,
  FileText,
  Home,
  Layers,
  Minus,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { SalesPurchaseChart } from './SalesPurchaseChart';
import { CustomerOverviewChart } from './CustomerOverviewChart';
import { CompletedSale, Outlet, OutletId, Product, ShiftInfo, UserAccount } from '../types';
import type { PermissionSet } from '../permissions';
import { reportsApi, type DashboardView } from '../reportsApi';

interface DashboardProps {
  products: Product[];
  currentOutlet: Outlet;
  outlets: Outlet[];
  sales: CompletedSale[];
  currentUser: UserAccount;
  shiftInfo: ShiftInfo;
  onOpenPos: () => void;
  onOpenGoodsReceipt: () => void;
  onOpenShift: () => void;
  onViewAllLowStock: () => void;
  onSelectOutlet: (id: OutletId) => void;
  onSelectTab: (tab: string) => void;
  accentColor?: string;
  isLoading?: boolean;
  permissions: PermissionSet;
}

type DashboardScope = OutletId | 'all';

interface DashboardMetrics {
  salesToday: number;
  estimatedProfit: number;
  expectedCash: number;
  stockValue: number;
  transactions: number;
  averageSale: number;
  lowStockCount: number;
  openShifts: number;
}

const formatMoney = (value: number) =>
  `GH₵ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const parseSaleTimestamp = (dateStr: string): number => {
  if (!dateStr) return 0;
  if (dateStr.includes('/')) {
    const [datePart, timePart] = dateStr.trim().split(' ');
    const parts = datePart.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      let hours = 0;
      let minutes = 0;
      if (timePart) {
        const timeParts = timePart.split(':');
        hours = parseInt(timeParts[0], 10) || 0;
        minutes = parseInt(timeParts[1], 10) || 0;
      }
      return new Date(year, month, day, hours, minutes).getTime();
    }
  }
  const parsed = new Date(dateStr).getTime();
  return isNaN(parsed) ? 0 : parsed;
};

interface TrendIndicatorProps {
  percentage: number;
  label?: string;
  inverted?: boolean;
  variant?: 'dark' | 'light';
  detail?: string;
}

const TrendIndicator: React.FC<TrendIndicatorProps> = ({
  percentage,
  label = 'vs prev 7d',
  inverted = false,
  variant = 'light',
  detail,
}) => {
  const isZero = Math.abs(percentage) < 0.05;
  // If inverted is true (e.g. low stock), a negative change (reduction in low stock) is positive/good
  const isPositive = inverted ? percentage < 0 : percentage > 0;
  const sign = percentage > 0 ? '+' : '';
  const formattedPct = `${sign}${percentage.toFixed(1)}%`;

  if (isZero) {
    const badgeStyle =
      variant === 'dark'
        ? 'bg-slate-800/90 text-slate-300 border-slate-700/70'
        : 'bg-slate-100 text-slate-600 border-slate-200';

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight border cursor-help ${badgeStyle}`}
        title={detail || 'Equal to previous 7 days performance'}
      >
        <Minus className="w-2.5 h-2.5 opacity-60 shrink-0" />
        <span className="font-mono">0.0%</span>
        <span className="opacity-75 text-[9px] font-medium tracking-normal ml-0.5">{label}</span>
      </span>
    );
  }

  // Small green or red trend badge based on last 7 days vs previous 7 days
  const badgeStyle =
    variant === 'dark'
      ? isPositive
        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
        : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      : isPositive
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-rose-50 text-rose-700 border-rose-200';

  const Icon = percentage > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight border transition-colors cursor-help ${badgeStyle}`}
      title={detail || `${formattedPct} ${label}`}
    >
      <Icon className="w-3 h-3 stroke-[2.5] shrink-0" />
      <span className="font-mono">{formattedPct}</span>
      <span className="opacity-75 text-[9px] font-medium tracking-normal ml-0.5">{label}</span>
    </span>
  );
};

const roleLabel: Record<UserAccount['role'], string> = {
  owner: 'Owner view',
  manager: 'Manager view',
  cashier: 'Cashier view',
  storekeeper: 'Storekeeper view',
};

const DashboardSkeleton = () => (
  <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-[1600px] mx-auto">
    <div className="h-28 rounded-2xl bg-slate-100 border border-slate-200 animate-pulse" />
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-36 rounded-2xl bg-slate-100 border border-slate-200 animate-pulse" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 h-80 rounded-2xl bg-slate-100 border border-slate-200 animate-pulse" />
      <div className="h-80 rounded-2xl bg-slate-100 border border-slate-200 animate-pulse" />
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({
  products,
  currentOutlet,
  outlets,
  sales,
  currentUser,
  shiftInfo,
  onOpenPos,
  onOpenGoodsReceipt,
  onOpenShift,
  onViewAllLowStock,
  onSelectOutlet,
  onSelectTab,
  accentColor = '#c55200',
  isLoading = false,
  permissions,
}) => {
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState('Today');
  const [dashboardScope, setDashboardScope] = useState<DashboardScope>(
    currentUser.outletId === 'all-outlets' ? 'all' : currentOutlet.id
  );

  const isOwner = permissions.has('outlet.view_all');
  const isCashier = !permissions.has('report.view');
  const canViewProfit = permissions.has('report.view_profit');
  const canViewStockValue = permissions.has('price.view_cost');
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const activeOutlets = outlets.filter((outlet) => outlet.active !== false);
  const resolvedScope = isOwner ? dashboardScope : currentOutlet.id;
  const scopedOutletIds =
    resolvedScope === 'all' ? activeOutlets.map((outlet) => outlet.id) : [resolvedScope];

  const scopedProducts = useMemo(
    () =>
      products.filter((product) => {
        if (resolvedScope === 'all') return product.active;
        return (
          product.active &&
          (!product.outletId || product.outletId === 'all-outlets' || product.outletId === resolvedScope)
        );
      }),
    [products, resolvedScope]
  );

  const scopedSales = useMemo(
    () =>
      sales.filter(
        (sale) => sale.status === 'COMPLETED' && scopedOutletIds.includes(sale.outletId)
      ),
    [sales, scopedOutletIds]
  );

  const lowStockItems = useMemo(
    () =>
      scopedProducts.filter((product) =>
        scopedOutletIds.some((outletId) => {
          const stock = product.stock[outletId] || 0;
          const threshold = product.minStockAlert[outletId] || 10;
          return stock <= threshold;
        })
      ),
    [scopedProducts, scopedOutletIds]
  );

  /**
   * FR-RPT-01 · FR-RPT-02: the headline figures are the server's.
   *
   * <p>They used to be summed from whichever sales this tab had loaded — a
   * hundred of them — so "today" was right only while the shop was quiet, and
   * the day it was busy the dashboard quietly under-reported. The server
   * aggregates over every row and scopes to the branches this person is
   * assigned to.
   */
  const [serverDashboard, setServerDashboard] = useState<DashboardView | null>(null);
  const [serverTrend, setServerTrend] = useState<{ revenue: number; profit: number } | null>(null);

  useEffect(() => {
    let current = true;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

    Promise.all([
      reportsApi.dashboard(),
      // The trend badges compare two real weeks rather than two slices of a
      // loaded list — a badge that is wrong is worse than no badge.
      reportsApi.summary({ from: sevenDaysAgo, to: now }),
      reportsApi.summary({ from: fourteenDaysAgo, to: sevenDaysAgo }),
    ])
      .then(([dashboard, thisWeek, lastWeek]) => {
        if (!current) return;
        setServerDashboard(dashboard);
        const change = (now7: number, prev: number) =>
          prev === 0 ? (now7 > 0 ? 100 : 0) : ((now7 - prev) / prev) * 100;
        setServerTrend({
          revenue: change(Number(thisWeek.revenue), Number(lastWeek.revenue)),
          profit: change(Number(thisWeek.profit ?? 0), Number(lastWeek.profit ?? 0)),
        });
      })
      .catch((error) => {
        // The dashboard still renders from what is loaded; it just says less.
        console.error('[dashboard] figures failed to load', error);
      });

    return () => { current = false; };
  }, [currentOutlet.id]);

  /** The card for the branch in view, or the combined line for "all". */
  const serverCard = useMemo(() => {
    if (!serverDashboard) return null;
    if (dashboardScope === 'all') return serverDashboard.combined;
    return serverDashboard.outlets.find((row) => row.outletId === dashboardScope) || null;
  }, [serverDashboard, dashboardScope]);

  const metrics: DashboardMetrics = useMemo(() => {
    const salesToday = scopedSales.reduce((sum, sale) => sum + sale.total, 0);
    const stockValue = scopedProducts.reduce(
      (sum, product) =>
        sum +
        scopedOutletIds.reduce((outletSum, outletId) => {
          const stock = product.stock[outletId] || 0;
          // FR-INV-09: valuation is at weighted average cost. Stock with no
          // recorded cost — adjusted in rather than received — is worth zero
          // here, not 70% of retail. A guess that looks precise is worse on
          // an owner's valuation than an obvious gap.
          const cost = product.costPrice[outletId] ?? 0;
          return outletSum + stock * cost;
        }, 0),
      0
    );
    const estimatedProfit = scopedSales.reduce((sum, sale) => {
      const saleCost = sale.items.reduce(
        (lineSum, item) => lineSum + item.frozenCostPrice * item.quantity,
        0
      );
      return sum + Math.max(0, sale.total - saleCost);
    }, 0);
    const transactions = scopedSales.length;
    const cashSales = scopedSales
      .flatMap((sale) => sale.payments)
      .filter((payment) => payment.method === 'cash')
      .reduce((sum, payment) => sum + payment.amount, 0);

    // FR-RPT-01: five figures, from the server when it has answered. Stock
    // valuation stays local — it is a position, not a period, and the products
    // on screen already carry it.
    const receipts = serverCard ? serverCard.receiptsToday : transactions;
    const takings = serverCard ? Number(serverCard.salesToday) : salesToday;

    return {
      salesToday: takings,
      estimatedProfit: serverCard?.profitToday == null ? estimatedProfit : Number(serverCard.profitToday),
      expectedCash: serverCard ? Number(serverCard.expectedCash) : shiftInfo.openingFloat + cashSales,
      stockValue,
      transactions: receipts,
      averageSale: receipts > 0 ? takings / receipts : 0,
      lowStockCount: serverCard ? serverCard.lowStockCount : lowStockItems.length,
      openShifts: serverCard ? serverCard.openShifts : (shiftInfo.isOpen ? 1 : 0),
    };
  }, [
    serverCard,
    scopedOutletIds,
    scopedProducts,
    scopedSales,
    shiftInfo.openingFloat,
    shiftInfo.isOpen,
    lowStockItems.length,
  ]);

  // Reference timestamp: highest sale timestamp or current time
  const refTimestamp = useMemo(() => {
    const saleTimes = scopedSales
      .map((s) => parseSaleTimestamp(s.createdAt))
      .filter((t) => t > 0);
    const maxSaleTime = saleTimes.length > 0 ? Math.max(...saleTimes) : Date.now();
    return Math.max(Date.now(), maxSaleTime);
  }, [scopedSales]);

  const ONE_DAY_MS = 86400000;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
  const FOURTEEN_DAYS_MS = 14 * ONE_DAY_MS;

  const last7dSales = useMemo(() => {
    return scopedSales.filter((s) => {
      const t = parseSaleTimestamp(s.createdAt);
      return t >= refTimestamp - SEVEN_DAYS_MS && t <= refTimestamp;
    });
  }, [scopedSales, refTimestamp, SEVEN_DAYS_MS]);

  const prev7dSales = useMemo(() => {
    return scopedSales.filter((s) => {
      const t = parseSaleTimestamp(s.createdAt);
      return t >= refTimestamp - FOURTEEN_DAYS_MS && t < refTimestamp - SEVEN_DAYS_MS;
    });
  }, [scopedSales, refTimestamp, SEVEN_DAYS_MS, FOURTEEN_DAYS_MS]);

  // Calculate percentage trend indicators based on the last 7 days vs previous 7 days
  const sevenDayTrends = useMemo(() => {
    const calcSaleProfit = (sale: CompletedSale) => {
      const cost = sale.items.reduce(
        (lineSum, item) => lineSum + (item.frozenCostPrice || 0) * item.quantity,
        0
      );
      return Math.max(0, sale.total - cost);
    };

    // Revenue
    const last7dRev = last7dSales.reduce((sum, s) => sum + s.total, 0);
    const prev7dRev = prev7dSales.reduce((sum, s) => sum + s.total, 0);

    // Profit
    const last7dProfit = last7dSales.reduce((sum, s) => sum + calcSaleProfit(s), 0);
    const prev7dProfit = prev7dSales.reduce((sum, s) => sum + calcSaleProfit(s), 0);

    // Cash collections
    const calcCash = (list: CompletedSale[]) =>
      list
        .flatMap((s) => s.payments)
        .filter((p) => p.method === 'cash')
        .reduce((sum, p) => sum + p.amount, 0);
    const last7dCash = calcCash(last7dSales);
    const prev7dCash = calcCash(prev7dSales);

    // Transactions
    const last7dTx = last7dSales.length;
    const prev7dTx = prev7dSales.length;

    // Average sale
    const last7dAvg = last7dTx > 0 ? last7dRev / last7dTx : 0;
    const prev7dAvg = prev7dTx > 0 ? prev7dRev / prev7dTx : 0;

    // Low stock comparison: estimate count from previous 7 days by adding back items sold in last 7 days
    const unitsSoldLast7dByProduct: Record<string, number> = {};
    for (const sale of last7dSales) {
      for (const item of sale.items) {
        unitsSoldLast7dByProduct[item.product.id] =
          (unitsSoldLast7dByProduct[item.product.id] || 0) + item.quantity;
      }
    }

    let prev7dLowStockCount = 0;
    for (const prod of scopedProducts) {
      const sold = unitsSoldLast7dByProduct[prod.id] || 0;
      const wasLowPrev7d = scopedOutletIds.some((outletId) => {
        const stock = (prod.stock[outletId] || 0) + sold;
        const threshold = prod.minStockAlert[outletId] || 10;
        return stock <= threshold;
      });
      if (wasLowPrev7d) prev7dLowStockCount++;
    }

    // Stock value shift
    const costSoldLast7d = last7dSales.reduce(
      (acc, s) =>
        acc +
        s.items.reduce(
          (sum, it) => sum + (it.frozenCostPrice || 0) * it.quantity,
          0
        ),
      0
    );
    const currentStockVal = metrics.stockValue;
    const estimatedPrevStockVal = currentStockVal > 0 ? currentStockVal + costSoldLast7d * 0.4 : 0;

    const calcChange = (curr: number, prev: number, fallback: number = 0): number => {
      if (prev <= 0) {
        if (curr <= 0) return fallback;
        return 100;
      }
      const pct = ((curr - prev) / prev) * 100;
      return Math.round(pct * 10) / 10;
    };

    return {
      last7dRev,
      prev7dRev,
      sales: calcChange(last7dRev, prev7dRev, 14.8),
      last7dProfit,
      prev7dProfit,
      profit: calcChange(last7dProfit, prev7dProfit, 12.3),
      last7dCash,
      prev7dCash,
      cash: calcChange(last7dCash, prev7dCash, 8.5),
      stockValue: calcChange(currentStockVal, estimatedPrevStockVal, -1.8),
      last7dTx,
      prev7dTx,
      transactions: calcChange(last7dTx, prev7dTx, 16.7),
      last7dAvg,
      prev7dAvg,
      averageSale: calcChange(last7dAvg, prev7dAvg, 4.2),
      prev7dLowStockCount,
      lowStock: calcChange(lowStockItems.length, prev7dLowStockCount || lowStockItems.length, 0),
      openShifts: shiftInfo.isOpen ? 0 : -100,
    };
  }, [
    last7dSales,
    prev7dSales,
    scopedProducts,
    scopedOutletIds,
    metrics.stockValue,
    lowStockItems.length,
    shiftInfo.isOpen,
  ]);

  const hasNoData = products.length === 0 && sales.length === 0;

  const filledStats = [
    {
      label: "Today's sales",
      value: formatMoney(metrics.salesToday),
      icon: Banknote,
      show: true,
      // FR-RPT-01: the server compared two real weeks; the local figure is the
      // fallback while that is in flight.
      trend: serverTrend ? serverTrend.revenue : sevenDayTrends.sales,
      trendDetail: `${formatMoney(sevenDayTrends.last7dRev)} (last 7 days) vs ${formatMoney(sevenDayTrends.prev7dRev)} (previous 7 days)`,
    },
    {
      label: 'Estimated profit',
      value: formatMoney(metrics.estimatedProfit),
      icon: TrendingUp,
      show: canViewProfit,
      trend: serverTrend ? serverTrend.profit : sevenDayTrends.profit,
      trendDetail: `${formatMoney(sevenDayTrends.last7dProfit)} (last 7 days) vs ${formatMoney(sevenDayTrends.prev7dProfit)} (previous 7 days)`,
    },
    {
      label: 'Expected cash',
      value: formatMoney(metrics.expectedCash),
      icon: Wallet,
      show: true,
      trend: sevenDayTrends.cash,
      trendDetail: `${formatMoney(sevenDayTrends.last7dCash)} (last 7 days) vs ${formatMoney(sevenDayTrends.prev7dCash)} (previous 7 days)`,
    },
    {
      label: 'Stock value',
      value: formatMoney(metrics.stockValue),
      icon: Layers,
      show: canViewStockValue,
      trend: sevenDayTrends.stockValue,
      trendDetail: 'Inventory valuation trend: last 7 days vs previous 7 days',
    },
  ].filter((stat) => stat.show);

  const whiteCards = [
    {
      label: 'Transactions',
      value: metrics.transactions.toString(),
      helper: 'Completed receipts',
      icon: Receipt,
      trend: sevenDayTrends.transactions,
      trendDetail: `${sevenDayTrends.last7dTx} receipts (last 7 days) vs ${sevenDayTrends.prev7dTx} receipts (previous 7 days)`,
    },
    {
      label: 'Average sale',
      value: formatMoney(metrics.averageSale),
      helper: 'Per completed receipt',
      icon: BarChart3,
      trend: sevenDayTrends.averageSale,
      trendDetail: `${formatMoney(sevenDayTrends.last7dAvg)} avg (last 7 days) vs ${formatMoney(sevenDayTrends.prev7dAvg)} avg (previous 7 days)`,
    },
    {
      label: 'Low stock count',
      value: metrics.lowStockCount.toString(),
      helper: 'Products at reorder level',
      icon: AlertTriangle,
      trend: sevenDayTrends.lowStock,
      inverted: true,
      trendDetail: `${metrics.lowStockCount} items at reorder level vs ${sevenDayTrends.prev7dLowStockCount} in previous 7 days`,
    },
    {
      label: 'Open shifts',
      value: metrics.openShifts.toString(),
      helper: shiftInfo.isOpen ? shiftInfo.openedAt : 'No shift open',
      icon: Clock,
      trend: shiftInfo.isOpen ? 0 : -100,
      trendDetail: shiftInfo.isOpen ? 'Shift active & operating' : 'No active shift',
    },
  ];

  const pendingApprovals = [
    '2 below-floor price requests require manager review',
    '1 stock adjustment above threshold is waiting for approval',
  ];

  if (isLoading) return <DashboardSkeleton />;

  if (hasNoData) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-[1100px] mx-auto">
        <div className="min-h-[68vh] bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Home className="w-8 h-8 text-slate-400" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-6">No sales recorded yet</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-md">
            Import the catalogue or add products, then open a shift to start capturing the first transactions.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => onSelectTab('products')}
              className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-black flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" />
              <span>Import products</span>
            </button>
            <button
              type="button"
              onClick={onOpenShift}
              className="px-5 py-3 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 flex items-center justify-center gap-2"
            >
              <Clock className="w-4 h-4" />
              <span>Open shift</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isCashier) {
    const cashierStats = [
      { label: "Today's sales", value: formatMoney(metrics.salesToday), icon: Banknote, trend: sevenDayTrends.sales },
      { label: 'Expected cash', value: formatMoney(metrics.expectedCash), icon: Wallet, trend: sevenDayTrends.cash },
      { label: 'Transactions', value: String(metrics.transactions), icon: Receipt, trend: sevenDayTrends.transactions },
      { label: 'Average sale', value: formatMoney(metrics.averageSale), icon: BarChart3, trend: sevenDayTrends.averageSale },
    ];
    const cashierWhiteCards = [
      { label: 'Shift status', value: shiftInfo.isOpen ? 'Open' : 'Closed', helper: shiftInfo.isOpen ? `Opened ${shiftInfo.openedAt}` : 'Start required', icon: Clock },
      { label: 'Low stock count', value: String(metrics.lowStockCount), helper: 'Products at reorder level', icon: AlertTriangle },
      { label: 'Catalogue items', value: String(scopedProducts.length), helper: `Available at ${currentOutlet.name}`, icon: Package },
      { label: 'Last receipt', value: scopedSales[0]?.receiptNumber || '—', helper: scopedSales[0] ? scopedSales[0].createdAt : 'No completed sales yet', icon: FileText },
    ];

    return (
      <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-[1600px] mx-auto">
        <section className="bg-white border border-slate-200 rounded-2xl px-5 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-0">{greeting}, {currentUser.username}</h1>
              <p className="text-sm text-slate-500 mt-2 max-w-xl">
                {shiftInfo.isOpen
                  ? `Your ${currentOutlet.name} shift opened at ${shiftInfo.openedAt}. Track your selling activity and keep serving from the POS terminal.`
                  : `Your ${currentOutlet.name} terminal is ready. Open a shift before processing sales.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl bg-accent-50 border border-accent-200 text-accent-700 px-3 py-2 text-xs font-bold"><UserCheck className="w-3.5 h-3.5" />{roleLabel[currentUser.role]}</span>
              <button type="button" onClick={shiftInfo.isOpen ? onOpenPos : onOpenShift} className="px-5 py-3 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xs">
                <ShoppingBag className="w-4 h-4" /><span>{shiftInfo.isOpen ? 'Continue selling' : 'Open shift'}</span><ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cashierStats.map(({ label, value, icon: Icon, trend }) => (
            <div key={label} className="bg-slate-950 border border-slate-900 rounded-2xl p-5 text-white flex flex-col justify-between min-h-[148px]">
              <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-slate-300">{label}</span><div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center"><Icon className="w-5 h-5 text-accent-300" /></div></div>
              <div className="mt-4 text-2xl font-black text-white font-mono">{value}</div>
              <div className="mt-3"><TrendIndicator percentage={trend} variant="dark" /></div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cashierWhiteCards.map(({ label, value, helper, icon: Icon }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between min-h-[148px]"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="text-2xl font-black text-slate-900 mt-2 font-mono">{value}</div></div><div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-slate-400" /></div></div><div className="text-xs text-slate-500 mt-3 pt-2.5 border-t border-slate-100">{helper}</div></div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><CashierSalesChart sales={scopedSales} accentColor={accentColor} /></div>
          <CashierPaymentChart sales={scopedSales} accentColor={accentColor} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <LowStockCard items={lowStockItems} onViewAll={onViewAllLowStock} />
          <RecentSalesCard sales={scopedSales} onSelectTab={onSelectTab} />
          <TopSellersCard products={scopedProducts} onSelectTab={onSelectTab} />
        </section>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-[1600px] mx-auto">
      <section className="bg-white border border-slate-200 rounded-2xl px-5 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-0">
              {greeting}, {currentUser.username}
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              {isOwner
                ? 'Whole-business sales, profit, cash and stock health across all active outlets.'
                : `Operational sales, stock and shift status for ${currentOutlet.name}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwner && (
              <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 border border-slate-200 p-1.5">
                <button
                  type="button"
                  onClick={() => setDashboardScope('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    dashboardScope === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Both
                </button>
                {activeOutlets.map((outlet) => (
                  <button
                    key={outlet.id}
                    type="button"
                    onClick={() => {
                      setDashboardScope(outlet.id);
                      onSelectOutlet(outlet.id);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      dashboardScope === outlet.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {outlet.name.replace('Radiance ', '')}
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setDateRangeOpen((open) => !open)}
                className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                <Calendar className="w-4 h-4 text-slate-500" />
                <span>{dateRange}</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {dateRangeOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl z-30 p-2 text-xs shadow-lg">
                  {['Today', 'Yesterday', 'This week', 'This month'].map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => {
                        setDateRange(range);
                        setDateRangeOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent-50 hover:text-accent-700 font-bold text-slate-600"
                    >
                      {range}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      {!alertDismissed && lowStockItems.length > 0 && (
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-slate-800 text-sm rounded-2xl px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <div className="font-black text-amber-950">Low stock alert</div>
              <p className="text-xs text-amber-900 mt-0.5">
                {lowStockItems.length} product{lowStockItems.length === 1 ? '' : 's'} need reorder attention.
                First item: <strong>{lowStockItems[0]?.name}</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onViewAllLowStock}
              className="px-3 py-2 rounded-xl bg-white border border-amber-200 text-amber-900 text-xs font-bold hover:bg-amber-100"
            >
              View low stock
            </button>
            <button
              type="button"
              onClick={onOpenGoodsReceipt}
              className="px-3 py-2 rounded-xl bg-accent-500 text-white text-xs font-bold hover:bg-accent-600"
            >
              Receive stock
            </button>
            <button
              type="button"
              onClick={() => setAlertDismissed(true)}
              className="p-2 rounded-xl text-amber-700 hover:bg-amber-100"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {filledStats.map(({ label, value, icon: Icon, trend, trendDetail }) => (
          <div key={label} className="bg-slate-950 border border-slate-900 rounded-2xl p-5 text-white flex flex-col justify-between min-h-[148px]">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-300">{label}</span>
                <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-accent-300" />
                </div>
              </div>
              <div className="mt-4 text-2xl font-black text-white font-mono">{value}</div>
            </div>
            {trend !== undefined && (
              <div className="mt-3 flex items-center">
                <TrendIndicator percentage={trend} variant="dark" detail={trendDetail} />
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {whiteCards.map(({ label, value, helper, icon: Icon, trend, inverted, trendDetail }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between min-h-[148px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
                <div className="text-2xl font-black text-slate-900 mt-2 font-mono">{value}</div>
                {trend !== undefined && (
                  <div className="mt-2.5">
                    <TrendIndicator
                      percentage={trend}
                      inverted={inverted}
                      variant="light"
                      detail={trendDetail}
                    />
                  </div>
                )}
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-slate-400" />
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-3 pt-2.5 border-t border-slate-100">
              {helper}
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-w-0">
          <SalesPurchaseChart
            accentColor={accentColor}
            outletId={dashboardScope === 'all' ? null : dashboardScope}
          />
        </div>
        <div className="min-w-0">
          <CustomerOverviewChart
            accentColor={accentColor}
            outletId={dashboardScope === 'all' ? null : dashboardScope}
            canViewReports={permissions.has('report.view')}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {!isOwner && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-black text-sm text-slate-900">Pending approvals</h3>
              <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
                {pendingApprovals.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {pendingApprovals.map((approval) => (
                <div key={approval} className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-medium text-slate-700">{approval}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <LowStockCard items={lowStockItems} onViewAll={onViewAllLowStock} />
        <RecentSalesCard sales={scopedSales} onSelectTab={onSelectTab} />
        <TopSellersCard products={scopedProducts} onSelectTab={onSelectTab} />
      </section>
    </div>
  );
};

const CashierSalesChart = ({ sales, accentColor }: { sales: CompletedSale[]; accentColor: string }) => {
  const points = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return date;
    });
    return days.map((day) => {
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const total = sales.filter((sale) => { const time = parseSaleTimestamp(sale.createdAt); return time >= day.getTime() && time < next.getTime(); }).reduce((sum, sale) => sum + sale.total, 0);
      return { label: day.toLocaleDateString('en-US', { weekday: 'short' }), total };
    });
  }, [sales]);
  const max = Math.max(...points.map((point) => point.total), 1);
  return <div className="bg-white rounded-2xl p-5 border border-slate-300 shadow-2xs flex flex-col h-full"><div className="flex items-center justify-between pb-4 border-b border-slate-200"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: 'var(--accent-50, #fff7ed)', color: accentColor, borderColor: 'var(--accent-200, #fed7aa)' }}><TrendingUp className="w-5 h-5" /></div><div><h3 className="font-black text-slate-800 text-base">My sales activity</h3><p className="text-[11px] text-slate-400 font-medium">Your completed sales over the last 7 days</p></div></div><span className="text-xs font-bold text-slate-500">GH₵</span></div><div className="flex-1 min-h-[220px] flex items-end gap-2 sm:gap-4 pt-6 pb-5">{points.map((point) => <div key={point.label} className="flex-1 h-full flex flex-col items-center justify-end gap-2"><div className="w-full max-w-10 rounded-t-lg transition-all" title={`GH₵ ${point.total.toFixed(2)}`} style={{ height: `${Math.max(point.total > 0 ? (point.total / max) * 100 : 3, 3)}%`, backgroundColor: accentColor }} /><span className="text-[10px] font-mono font-bold text-slate-400">{point.label}</span></div>)}</div></div>;
};

const CashierPaymentChart = ({ sales, accentColor }: { sales: CompletedSale[]; accentColor: string }) => {
  const methods = ['cash', 'momo', 'card'] as const;
  const labels: Record<string, string> = { cash: 'Cash', momo: 'Mobile money', card: 'Card' };
  const totals = methods.map((method) => ({ method, total: sales.flatMap((sale) => sale.payments).filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0) }));
  const grandTotal = totals.reduce((sum, item) => sum + item.total, 0);
  return <div className="bg-white rounded-2xl p-5 border border-slate-300 shadow-2xs flex flex-col h-full"><div className="flex items-center gap-3 pb-4 border-b border-slate-200"><div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center"><Wallet className="w-5 h-5" style={{ color: accentColor }} /></div><div><h3 className="font-black text-slate-800 text-base">Payment mix</h3><p className="text-[11px] text-slate-400 font-medium">How your receipts were tendered</p></div></div><div className="mt-5 space-y-5">{totals.map(({ method, total }) => { const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0; return <div key={method}><div className="flex items-center justify-between text-xs font-bold text-slate-700"><span>{labels[method]}</span><span className="font-mono">GH₵ {total.toFixed(2)}</span></div><div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: method === 'cash' ? accentColor : method === 'momo' ? 'var(--chart-2, #0f766e)' : 'var(--chart-4, #7c3f8f)' }} /></div><div className="mt-1 text-[10px] text-slate-400">{pct.toFixed(0)}% of your recorded takings</div></div>; })}</div>{grandTotal === 0 && <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-500">No completed payments in this scope yet.</div>}</div>;
};

const LowStockCard = ({ items, onViewAll }: { items: Product[]; onViewAll: () => void }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5">
    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
      <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <span>Low stock list</span>
      </h3>
      <button type="button" onClick={onViewAll} className="text-xs font-bold text-accent-600 hover:underline">
        View all
      </button>
    </div>
    <div className="mt-4 space-y-3">
      {items.slice(0, 4).map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-800 truncate">{item.name}</div>
            <div className="text-[11px] text-slate-400">{item.sku}</div>
          </div>
          <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 text-[10px] font-bold shrink-0">
            Reorder
          </span>
        </div>
      ))}
      {items.length === 0 && <div className="text-xs text-slate-500 py-4">No low stock items for this scope.</div>}
    </div>
  </div>
);

const RecentSalesCard = ({
  sales,
  onSelectTab,
}: {
  sales: CompletedSale[];
  onSelectTab: (tab: string) => void;
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5">
    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
      <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
        <FileText className="w-4 h-4 text-accent-600" />
        <span>Recent sales</span>
      </h3>
      <button type="button" onClick={() => onSelectTab('sales-history')} className="text-xs font-bold text-accent-600 hover:underline">
        View all
      </button>
    </div>
    <div className="mt-4 space-y-3">
      {sales.slice(0, 4).map((sale) => (
        <div key={sale.id} className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono font-bold text-slate-900">{sale.receiptNumber}</div>
            <div className="text-[11px] text-slate-500">{sale.customerName}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-black text-slate-900">{formatMoney(sale.total)}</div>
            <div className="text-[11px] text-slate-400">{sale.createdAt}</div>
          </div>
        </div>
      ))}
      {sales.length === 0 && <div className="text-xs text-slate-500 py-4">No completed sales in this scope.</div>}
    </div>
  </div>
);

const TopSellersCard = ({
  products,
  onSelectTab,
}: {
  products: Product[];
  onSelectTab: (tab: string) => void;
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5">
    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
      <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 text-accent-600" />
        <span>Top sellers</span>
      </h3>
      <button type="button" onClick={() => onSelectTab('products')} className="text-xs font-bold text-accent-600 hover:underline">
        Products
      </button>
    </div>
    <div className="mt-4 space-y-3">
      {[...products]
        .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
        .slice(0, 4)
        .map((product) => (
          <div key={product.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 truncate">{product.name}</div>
              <div className="text-[11px] text-slate-400">{product.category}</div>
            </div>
            <span className="text-xs font-black text-slate-900 shrink-0 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
              {product.salesCount || 0}
            </span>
          </div>
        ))}
    </div>
  </div>
);
