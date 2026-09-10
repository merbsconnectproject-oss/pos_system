import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
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
  Package,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Store,
  TrendingUp,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { SalesPurchaseChart } from './SalesPurchaseChart';
import { CustomerOverviewChart } from './CustomerOverviewChart';
import { CompletedSale, Outlet, OutletId, Product, ShiftInfo, UserAccount } from '../types';

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

const roleLabel: Record<UserAccount['role'], string> = {
  super_admin: 'Owner view',
  branch_manager: 'Manager view',
  cashier: 'Cashier view',
  storekeeper: 'Manager view',
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
}) => {
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState('Today');
  const [dashboardScope, setDashboardScope] = useState<DashboardScope>(
    currentUser.outletId === 'all-outlets' ? 'all' : currentOutlet.id
  );

  const isOwner = currentUser.role === 'super_admin';
  const isCashier = currentUser.role === 'cashier';
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

  const metrics: DashboardMetrics = useMemo(() => {
    const salesToday = scopedSales.reduce((sum, sale) => sum + sale.total, 0);
    const stockValue = scopedProducts.reduce(
      (sum, product) =>
        sum +
        scopedOutletIds.reduce((outletSum, outletId) => {
          const stock = product.stock[outletId] || 0;
          const cost = product.costPrice[outletId] || product.retailPrice * 0.7;
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

    return {
      salesToday,
      estimatedProfit,
      expectedCash: shiftInfo.openingFloat + cashSales,
      stockValue,
      transactions,
      averageSale: transactions > 0 ? salesToday / transactions : 0,
      lowStockCount: lowStockItems.length,
      openShifts: shiftInfo.isOpen ? 1 : 0,
    };
  }, [
    scopedOutletIds,
    scopedProducts,
    scopedSales,
    shiftInfo.openingFloat,
    shiftInfo.isOpen,
    lowStockItems.length,
  ]);

  const hasNoData = products.length === 0 && sales.length === 0;

  const filledStats = [
    { label: "Today's sales", value: formatMoney(metrics.salesToday), icon: Banknote, show: true },
    { label: 'Estimated profit', value: formatMoney(metrics.estimatedProfit), icon: TrendingUp, show: !isCashier },
    { label: 'Expected cash', value: formatMoney(metrics.expectedCash), icon: Wallet, show: true },
    { label: 'Stock value', value: formatMoney(metrics.stockValue), icon: Layers, show: !isCashier },
  ].filter((stat) => stat.show);

  const whiteCards = [
    { label: 'Transactions', value: metrics.transactions.toString(), helper: 'Completed receipts', icon: Receipt },
    { label: 'Average sale', value: formatMoney(metrics.averageSale), helper: 'Per completed receipt', icon: BarChart3 },
    { label: 'Low stock count', value: metrics.lowStockCount.toString(), helper: 'Products at reorder level', icon: AlertTriangle },
    { label: 'Open shifts', value: metrics.openShifts.toString(), helper: shiftInfo.isOpen ? shiftInfo.openedAt : 'No shift open', icon: Clock },
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
              className="px-5 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 flex items-center justify-center gap-2"
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
    return (
      <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-[1200px] mx-auto">
        <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 border border-orange-200 text-orange-700 px-3 py-1 text-xs font-bold">
                <UserCheck className="w-3.5 h-3.5" />
                {roleLabel[currentUser.role]}
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-4">
                {shiftInfo.isOpen ? 'Continue selling' : 'Open shift to begin'}
              </h1>
              <p className="text-sm text-slate-500 mt-2 max-w-xl">
                {shiftInfo.isOpen
                  ? `Your ${currentOutlet.name} shift opened at ${shiftInfo.openedAt}. Keep serving from the POS terminal.`
                  : 'A shift must be opened before this terminal can process sales.'}
              </p>
            </div>
            <button
              type="button"
              onClick={shiftInfo.isOpen ? onOpenPos : onOpenShift}
              className="px-6 py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xs"
            >
              <ShoppingBag className="w-5 h-5" />
              <span>{shiftInfo.isOpen ? 'Continue selling' : 'Open shift'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Own sales today', value: formatMoney(metrics.salesToday), helper: `${metrics.transactions} completed receipts` },
            { label: 'Shift status', value: shiftInfo.isOpen ? 'Open' : 'Closed', helper: shiftInfo.isOpen ? shiftInfo.openedAt : 'Start required' },
            { label: 'Expected cash', value: formatMoney(metrics.expectedCash), helper: 'Visible for cashier closeout' },
          ].map((item) => (
            <div key={item.label} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{item.label}</div>
              <div className="text-xl font-black text-slate-900 mt-2">{item.value}</div>
              <div className="text-xs text-slate-500 mt-1">{item.helper}</div>
            </div>
          ))}
        </section>

        <RecentSalesCard sales={scopedSales} onSelectTab={onSelectTab} />
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
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-700 font-bold text-slate-600"
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
              className="px-3 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600"
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
        {filledStats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-slate-950 border border-slate-900 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-300">{label}</span>
              <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-orange-300" />
              </div>
            </div>
            <div className="mt-4 text-2xl font-black text-white font-mono">{value}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {whiteCards.map(({ label, value, helper, icon: Icon }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
                <div className="text-2xl font-black text-slate-900 mt-2 font-mono">{value}</div>
                <div className="text-xs text-slate-500 mt-1">{helper}</div>
              </div>
              <Icon className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SalesPurchaseChart accentColor={accentColor} />
        </div>
        <div>
          <CustomerOverviewChart accentColor={accentColor} />
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

const LowStockCard = ({ items, onViewAll }: { items: Product[]; onViewAll: () => void }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5">
    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
      <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <span>Low stock list</span>
      </h3>
      <button type="button" onClick={onViewAll} className="text-xs font-bold text-orange-600 hover:underline">
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
        <FileText className="w-4 h-4 text-orange-600" />
        <span>Recent sales</span>
      </h3>
      <button type="button" onClick={() => onSelectTab('sales-history')} className="text-xs font-bold text-orange-600 hover:underline">
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
        <ShoppingBag className="w-4 h-4 text-orange-600" />
        <span>Top sellers</span>
      </h3>
      <button type="button" onClick={() => onSelectTab('products')} className="text-xs font-bold text-orange-600 hover:underline">
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
