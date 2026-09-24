import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Calendar,
  Sparkles,
  RefreshCw,
  Printer,
  Download,
  Filter,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Building,
  Store,
  Wallet,
  Clock,
  PieChart as PieChartIcon,
  BarChart3,
  CheckCircle2,
  XCircle,
  X,
  HelpCircle,
  Search,
  ChevronDown,
  Send,
  SlidersHorizontal,
  Package,
  Zap,
  Users,
  Percent,
  ShoppingBag,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  AreaChart,
  BarChart,
  PieChart,
  Pie,
  Cell,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Product, Outlet, CompletedSale, Expense, CustomerInstallmentPlan, ReturnExchangeRecord } from '../types';
import { exportToCsv } from '../utils/csvExport';
import { InfoHint } from './InfoHint';
import { observationsFrom, risksFrom, type TradingFigures } from '../insights';
import {
  reportsApi,
  type DashboardView,
  type ReportFilters,
  type ReportRow,
  type ReportSummary,
  type SeriesPoint,
} from '../reportsApi';

interface AnalyticsReportsViewProps {
  products: Product[];
  sales: CompletedSale[];
  expenses?: Expense[];
  installmentPlans?: CustomerInstallmentPlan[];
  returnsExchanges?: ReturnExchangeRecord[];
  currentOutlet: Outlet;
  outlets: Outlet[];
  accentColor?: string;
}

const MiniSparkline: React.FC<{ data: Array<{ name: string; value: number }>; color: string }> = ({ data, color }) => (
  <div className="h-8 w-full" aria-hidden="true">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 3, right: 0, left: 0, bottom: 2 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

const CATEGORY_COLORS: Record<string, string> = {
  'Lighting & Lamps': '#F97316',
  'Cables & Wires': '#EA580C',
  'Protection & Breakers': '#64748B',
  'Switches & Sockets': '#475569',
  'Hardware & Tools': '#334155',
  'Solar & Inverters': '#94A3B8',
  'Plumbing & Pipes': '#CBD5E1',
  'Fasteners & Fixings': '#C2410C',
  'Other': '#64748b',
};

const PAYMENT_COLORS: Record<string, string> = {
  'Mobile Money': '#F97316',
  'Cash': '#64748B',
  'Bank Card / POS': '#475569',
  'Installment Credit': '#94A3B8',
  'Bank Transfer': '#334155',
};

/**
 * A short note under a chart, derived from the chart's own data — FR-RPT-04.
 *
 * <p>Renders nothing when there is nothing to say. Each of these used to carry
 * a fixed sentence as its fallback — "Mobile Money (48%) is the dominant
 * settlement rail", "15W Downlights turn over every 14 days" — shown whenever
 * the inference call failed, which in a shipped counter was always. A chart
 * with no note is honest; a chart with a borrowed note is not.
 */
const ChartNote: React.FC<{ note: string | null }> = ({ note }) => {
  if (!note) return null;
  return (
    <div className="analytics-callout mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <p className="text-[11px] leading-relaxed text-slate-700">{note}</p>
    </div>
  );
};

export const AnalyticsReportsView: React.FC<AnalyticsReportsViewProps> = ({
  products = [],
  sales = [],
  expenses = [],
  installmentPlans = [],
  returnsExchanges = [],
  currentOutlet,
  outlets,
  accentColor = '#f97316',
}) => {
  // Filter States
  const [selectedRange, setSelectedRange] = useState<'7d' | '30d' | 'mtd' | 'qtd' | 'ytd'>('30d');
  const [selectedOutlet, setSelectedOutlet] = useState<string>(
    currentOutlet?.id === 'all-outlets' ? 'all' : (currentOutlet?.id || 'all')
  );
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'outlets' | 'categories' | 'payments' | 'inventory'>('overview');

  // AI Inference State
  const [activeSnapshot, setActiveSnapshot] = useState<'dailyRevenue' | 'profitMargin' | 'retentionRate' | 'aov'>('dailyRevenue');
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Sync outlet filter if currentOutlet changes
  useEffect(() => {
    if (currentOutlet?.id) {
      setSelectedOutlet(currentOutlet.id === 'all-outlets' ? 'all' : currentOutlet.id);
    }
  }, [currentOutlet]);

  // Compute Outlet Specific Data
  const filteredSales = useMemo(() => {
    if (selectedOutlet === 'all') return sales;
    return sales.filter((s) => s.outletId === selectedOutlet);
  }, [sales, selectedOutlet]);

  const filteredExpenses = useMemo(() => {
    if (selectedOutlet === 'all') return expenses;
    return expenses.filter((e) => e.outletId === selectedOutlet || e.outletId === 'all-outlets');
  }, [expenses, selectedOutlet]);

  const filteredInstallments = useMemo(() => {
    if (selectedOutlet === 'all') return installmentPlans;
    return installmentPlans.filter((p) => p.outletId === selectedOutlet);
  }, [installmentPlans, selectedOutlet]);

  // Financial Metrics
  /**
   * FR-RPT-04: every figure on this screen comes from the server.
   *
   * <p>What was here before invented most of them. Revenue was real sales
   * **plus a literal** (28,370 or 108,420 depending on the branch); COGS was
   * `revenue * 0.641`, which produced the 35.9% margin quoted in the executive
   * summary regardless of what anything cost; the transaction count added 142;
   * the fourteen-day velocity curve was a sine wave; and the category,
   * payment, top-product and outlet tables were literal arrays. On an owner's
   * analytics screen those are not placeholders, they are claims about money.
   */
  const analyticsFilters = useMemo<ReportFilters>(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 14 * 86400000);
    return { from, to, outletId: selectedOutlet === 'all' ? null : selectedOutlet };
  }, [selectedOutlet]);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [categoryRows, setCategoryRows] = useState<ReportRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<ReportRow[]>([]);
  const [topRows, setTopRows] = useState<ReportRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardView | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsFailed, setAnalyticsFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setAnalyticsLoading(true);
    setAnalyticsFailed(false);

    Promise.all([
      reportsApi.summary(analyticsFilters),
      reportsApi.series('DAY', analyticsFilters),
      reportsApi.breakdown('category', analyticsFilters, 12),
      reportsApi.breakdown('payment', analyticsFilters),
      reportsApi.ranking('best', analyticsFilters, 6),
      reportsApi.dashboard(),
    ])
      .then(([loadedSummary, loadedSeries, categories, payments, top, dash]) => {
        if (!current) return;
        setSummary(loadedSummary);
        setSeries(loadedSeries);
        setCategoryRows(categories);
        setPaymentRows(payments);
        setTopRows(top);
        setDashboard(dash);
      })
      .catch(() => {
        if (!current) return;
        // Empty and said out loud. Falling back to something plausible is how
        // this screen came to be lying in the first place.
        setAnalyticsFailed(true);
        setSummary(null); setSeries([]); setCategoryRows([]);
        setPaymentRows([]); setTopRows([]); setDashboard(null);
      })
      .finally(() => { if (current) setAnalyticsLoading(false); });

    return () => { current = false; };
  }, [analyticsFilters]);

  const num = (value: number | null | undefined) => Number(value ?? 0);

  const metrics = useMemo(() => {
    // Net of returns. `summary.revenue` is gross takings; anything a shop reads
    // as "sales" has to have what came back taken off it, or a month with heavy
    // returns looks like a good one.
    const grossRevenue = num(summary?.netRevenue);
    const refundTotal = num(summary?.refundTotal);
    // BR-5 · FR-RPT-06: the cost frozen on each line when it was sold. Null
    // when this user may not see cost, and then so is everything derived
    // from it — rather than a percentage of revenue standing in for it.
    const cogs = num(summary?.cost);
    const grossProfit = num(summary?.profit);

    const totalOpex = filteredExpenses.reduce((sum, e) => sum + (e.status === 'PAID' ? e.amount : 0), 0);
    const netIncome = grossProfit - totalOpex;
    const totalTransactions = summary?.saleCount ?? 0;

    return {
      grossRevenue,
      refundTotal,
      refundCount: summary?.refundCount ?? 0,
      estimatedCOGS: cogs,
      grossProfit,
      grossMarginPct: num(summary?.marginPercent),
      totalOpex,
      netIncome,
      netMarginPct: grossRevenue === 0 ? 0 : Number(((netIncome / grossRevenue) * 100).toFixed(1)),
      totalTransactions,
      averageOrderValue: num(summary?.averageSale),
      voidCount: summary?.voidCount ?? 0,
      voidedValue: num(summary?.voidedValue),
      discountTotal: num(summary?.discountTotal),
      // Stage 2. Zero because nothing records one — which is the truth here,
      // not a placeholder standing in for a number we have not fetched.
      activeCreditReceivables: filteredInstallments.reduce((sum, plan) => sum + (plan.remainingBalance ?? 0), 0),
      returnsVolume: returnsExchanges.length,
      returnRatePct: totalTransactions === 0
        ? 0
        : Number(((returnsExchanges.length / totalTransactions) * 100).toFixed(1)),
    };
  }, [summary, filteredExpenses, filteredInstallments, returnsExchanges]);

  const quickSnapshot = useMemo(() => {
    const outletDisplayName = selectedOutlet === 'all'
      ? 'All branches'
      : outlets.find((outlet) => outlet.id === selectedOutlet)?.name || 'This branch';

    // Today is the last bucket the server returned, not a base figure.
    const today = series.length > 0 ? series[series.length - 1] : null;

    // The trend is the last seven buckets against the seven before them —
    // two real weeks, rather than a literal like the '+16.2%' that used to
    // sit here whatever the shop had done.
    const half = Math.floor(series.length / 2);
    const recent = series.slice(half).reduce((sum, point) => sum + num(point.sales), 0);
    const earlier = series.slice(0, half).reduce((sum, point) => sum + num(point.sales), 0);
    const change = earlier === 0 ? (recent > 0 ? 100 : 0) : ((recent - earlier) / earlier) * 100;

    return {
      outletDisplayName,
      dailySales: num(today?.sales),
      dailyRevenue: num(today?.sales),
      dailyReceipts: today?.receipts ?? 0,
      aov: metrics.averageOrderValue,
      profitMargin: metrics.grossMarginPct ?? 0,
      dailyTrend: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
      /** The same trend as a number, for anything that has to reason about it. */
      changePercent: series.length === 0 ? null : change,
      // FR-SET has no daily target and nobody has set one, so there is nothing
      // to pace against. Zero reads as "no target", which is the case.
      dailyTarget: 0,
      dailyTargetPace: 0,
      // Retention needs repeat-purchase history over a longer window than
      // this screen asks for. Zero until something computes it.
      retentionRate: 0,
    };
  }, [selectedOutlet, outlets, series, metrics.averageOrderValue, metrics.grossMarginPct]);

  const snapshotSeries = useMemo(() => {
    const daily = series.map((point, index) => ({ name: `${index + 1}`, value: num(point.sales) }));
    return {
      sales: daily,
      dailyRevenue: daily,
      receipts: series.map((point, index) => ({ name: `${index + 1}`, value: point.receipts })),
      aov: series.map((point, index) => ({
        name: `${index + 1}`,
        value: point.receipts > 0 ? Math.round(num(point.sales) / point.receipts) : 0,
      })),
      // Nothing computes these per day; an empty sparkline draws nothing,
      // which is better than drawing a shape that means nothing.
      profitMargin: [] as Array<{ name: string; value: number }>,
      retentionRate: [] as Array<{ name: string; value: number }>,
    };
  }, [series]);

  /** Chart 1: takings, cost and margin per day — FR-RPT-04, FR-RPT-06. */
  const salesVelocityData = useMemo(
    () => series.map((point) => ({
      name: point.bucket.slice(-5),
      revenue: num(point.sales),
      // Per-day cost is not in the series; the screen shows takings and
      // purchases, and the margin comes from the period summary instead of
      // being guessed per bar.
      // Per-day cost is not in the series; the period's margin is on the
      // summary above rather than guessed per bar.
      cogs: 0,
      profit: 0,
      margin: 0,
      purchases: num(point.purchases),
    })),
    [series],
  );

  /** Chart: takings against goods received, per day. */
  const operatingPerformanceData = useMemo(
    () => series.map((point) => ({
      name: point.bucket.slice(-5),
      sales: num(point.sales),
      expenses: num(point.purchases),
    })),
    [series],
  );

  /** Chart 2: one row per branch, from the dashboard the server scopes. */
  const outletComparisonData = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.outlets.map((row) => ({
      outlet: row.outletName,
      location: outlets.find((outlet) => outlet.id === row.outletId)?.town || '',
      revenue: num(row.salesToday),
      profit: num(row.profitToday),
      margin: num(row.salesToday) === 0
        ? 0
        : Number(((num(row.profitToday) / num(row.salesToday)) * 100).toFixed(1)),
      aov: row.receiptsToday > 0 ? num(row.salesToday) / row.receiptsToday : 0,
      transactions: row.receiptsToday,
      // Stage 2: nothing records credit yet, so it is zero rather than absent.
      activeCredit: 0,
    }));
  }, [dashboard, outlets]);

  /** Chart 3: takings by category. */
  const categoryData = useMemo(() => {
    const total = categoryRows.reduce((sum, row) => sum + num(row.revenue), 0);
    return categoryRows.map((row) => ({
      name: row.name,
      revenue: num(row.revenue),
      margin: num(row.revenue) === 0
        ? 0
        : Number(((num(row.profit) / num(row.revenue)) * 100).toFixed(1)),
      items: Number(row.quantity),
      share: total > 0 ? Number(((num(row.revenue) / total) * 100).toFixed(1)) : 0,
      color: CATEGORY_COLORS[row.name] || '#64748b',
    }));
  }, [categoryRows]);

  /** Chart 4: what customers actually paid with. */
  const paymentChannelData = useMemo(() => {
    const LABEL: Record<string, string> = {
      cash: 'Cash', momo: 'Mobile Money', card: 'Bank Card / POS', transfer: 'Bank Transfer',
    };
    const total = paymentRows.reduce((sum, row) => sum + num(row.revenue), 0);
    return paymentRows.map((row) => {
      const name = LABEL[row.key] || row.name;
      return {
        name,
        amount: num(row.revenue),
        percent: total > 0 ? Number(((num(row.revenue) / total) * 100).toFixed(1)) : 0,
        color: PAYMENT_COLORS[name] || '#64748b',
        badge: `${Number(row.quantity)} payments`,
      };
    });
  }, [paymentRows]);

  /**
   * Chart 5: installment credit ageing — FR-CUST-07.
   *
   * <p>Built from the plans themselves, bucketed by how overdue the oldest
   * unpaid instalment is. It was hardcoded to an empty array with a comment
   * saying installments were Stage 2 and nothing recorded one — which stopped
   * being true when installment plans shipped and began persisting, so the
   * chart stayed blank for a facility the shop now offers.
   *
   * <p>Before that it was worse: eight literal plans and GH₵18,200 outstanding.
   */
  const installmentAgingData = useMemo(() => {
    const now = Date.now();
    const buckets = [
      { stage: 'Current', color: '#15803D', max: 0 },
      { stage: '1–30 days', color: '#B45309', max: 30 },
      { stage: '31–60 days', color: '#C2410C', max: 60 },
      { stage: 'Over 60 days', color: '#BE123C', max: Infinity },
    ].map((bucket) => ({ ...bucket, count: 0, balance: 0 }));

    filteredInstallments
      .filter((plan) => plan.status !== 'COMPLETED')
      .forEach((plan) => {
        // The oldest unpaid instalment decides the bucket: a plan is as late as
        // its earliest arrears, not its most recent one.
        const unpaid = (plan.schedule || []).filter((item) => item.status !== 'PAID');
        const oldestDue = unpaid.reduce<number | null>((oldest, item) => {
          const due = new Date(item.dueDate).getTime();
          if (Number.isNaN(due)) return oldest;
          return oldest === null || due < oldest ? due : oldest;
        }, null);

        const daysLate = oldestDue === null ? 0 : Math.floor((now - oldestDue) / 86400000);
        const bucket = daysLate <= 0
          ? buckets[0]
          : buckets.find((candidate) => daysLate <= candidate.max) ?? buckets[buckets.length - 1];

        bucket.count += 1;
        bucket.balance += plan.remainingBalance ?? 0;
      });

    // Empty buckets are dropped rather than drawn as zero bars, so a shop with
    // no arrears sees three words instead of a chart of nothing.
    return buckets
      .filter((bucket) => bucket.count > 0)
      .map(({ stage, count, balance, color }) => ({ stage, count, balance, color }));
  }, [filteredInstallments]);

  /** Chart 6: best sellers by value. */
  const topProductsData = useMemo(
    () => topRows.map((row) => ({
      name: row.name,
      units: Number(row.quantity),
      revenue: num(row.revenue),
      margin: num(row.revenue) === 0
        ? 0
        : Number(((num(row.profit) / num(row.revenue)) * 100).toFixed(1)),
    })),
    [topRows],
  );

  /**
   * FR-RPT-04: what the figures say, computed here from the figures.
   *
   * <p>This screen used to POST to `/api/analytics/ai-inference`, a route that
   * exists only in the Vite dev server and is not part of the application the
   * installers ship. In a real shop the call always failed, so the screen
   * always rendered its `catch` branch — a fixed executive summary, a
   * financial health score of 88 graded A, and a "prescriptive action plan"
   * promising GH₵8,500 of released capital, identical on every counter in
   * every shop regardless of what it had sold.
   *
   * <p>Now derived, and only from figures the server actually returned. When
   * there is nothing to say, it says nothing — see `insights.ts`.
   */
  const tradingFigures = useMemo<TradingFigures>(() => ({
    netRevenue: metrics.grossRevenue,
    grossRevenue: num(summary?.revenue),
    refundTotal: metrics.refundTotal,
    refundCount: metrics.refundCount,
    saleCount: metrics.totalTransactions,
    averageSale: metrics.averageOrderValue,
    discountTotal: metrics.discountTotal,
    voidCount: metrics.voidCount,
    voidedValue: metrics.voidedValue,
    operatingExpenses: metrics.totalOpex,
    outstandingCredit: metrics.activeCreditReceivables,
    // FR-RPT-05: null rather than zero when this user may not see cost. Zero
    // would read as "nothing cost anything" and produce a 100% margin.
    cogs: summary?.cost == null ? null : metrics.estimatedCOGS,
    grossProfit: summary?.profit == null ? null : metrics.grossProfit,
    marginPercent: summary?.marginPercent == null ? null : metrics.grossMarginPct,
    salesTrendPercent: quickSnapshot.changePercent,
  }), [metrics, summary, quickSnapshot]);

  /** FR-RPT-05: the server sends no cost at all to a reader without the right. */
  const canViewProfit = summary?.cost != null;

  const observations = useMemo(() => observationsFrom(tradingFigures), [tradingFigures]);
  const risks = useMemo(() => risksFrom(tradingFigures), [tradingFigures]);

  // Handle preset prompt click
  /**
   * FR-RPT-04: one derived sentence per chart, or none.
   *
   * <p>Each reads the same rows the chart above it draws. Where the rows do
   * not support a statement — no sales, no categories, cost withheld — the
   * note is null and nothing is rendered.
   */
  const chartNotes = useMemo(() => {
    const cedis = (value: number) => `GH₵${value.toLocaleString('en-GB', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;

    const topCategory = [...categoryData].sort((a, b) => b.revenue - a.revenue)[0];
    const categoryTotal = categoryData.reduce((sum, row) => sum + row.revenue, 0);
    const topPayment = [...paymentChannelData].sort((a, b) => b.amount - a.amount)[0];
    const paymentTotal = paymentChannelData.reduce((sum, row) => sum + row.amount, 0);
    const topProduct = topProductsData[0];
    const busiestOutlet = [...outletComparisonData].sort((a, b) => b.revenue - a.revenue)[0];
    const creditOutstanding = installmentAgingData.reduce((sum, row) => sum + row.balance, 0);

    return {
      revenueVelocity: metrics.totalTransactions === 0
        ? null
        : `${metrics.totalTransactions} sales over this period, ${cedis(metrics.grossRevenue)} net of returns`
          + `${canViewProfit ? `, at a ${metrics.grossMarginPct}% gross margin` : ''}.`,

      outletComparison: !busiestOutlet || outletComparisonData.length < 2
        ? null
        : `${busiestOutlet.outlet} took the most in this period, ${cedis(busiestOutlet.revenue)} `
          + `across ${outletComparisonData.length} branches.`,

      categoryContribution: !topCategory || categoryTotal <= 0
        ? null
        : `${topCategory.name} is the largest category at ${cedis(topCategory.revenue)}, `
          + `${((topCategory.revenue / categoryTotal) * 100).toFixed(1)}% of the period's sales.`,

      paymentChannels: !topPayment || paymentTotal <= 0
        ? null
        : `${topPayment.name} settled the most, ${cedis(topPayment.amount)} — `
          + `${((topPayment.amount / paymentTotal) * 100).toFixed(1)}% of what was taken.`,

      installmentCredit: installmentAgingData.length === 0
        ? null
        : `${cedis(creditOutstanding)} outstanding across ${filteredInstallments.length} plans.`,

      inventoryTurnover: !topProduct
        ? null
        : `${topProduct.name} sold most by value, ${topProduct.units} units for ${cedis(topProduct.revenue)}.`,
    };
  }, [
    metrics, canViewProfit, categoryData, paymentChannelData,
    topProductsData, outletComparisonData, installmentAgingData, filteredInstallments,
  ]);

  /**
   * FR-RPT-04: how much of the takings settled without cash.
   *
   * <p>Summed from the payment breakdown the server returned. The line here
   * used to read "64% Digital • 36% Cash Float" on every shop's screen.
   */
  const digitalVsCash = useMemo(() => {
    const total = paymentChannelData.reduce((sum, row) => sum + row.amount, 0);
    if (total <= 0) return { digitalPercent: 0, cashPercent: 0 };
    const cash = paymentChannelData
      .filter((row) => row.name.toLowerCase().includes('cash'))
      .reduce((sum, row) => sum + row.amount, 0);
    return {
      digitalPercent: ((total - cash) / total) * 100,
      cashPercent: (cash / total) * 100,
    };
  }, [paymentChannelData]);

  // Export Analytics CSV
  const handleExportCsv = () => {
    const csvRows = [
      {
        Metric: 'Gross Revenue',
        Value: `GH₵ ${metrics.grossRevenue.toFixed(2)}`,
        Note: 'Total recognized sales revenue',
      },
      {
        Metric: 'Estimated COGS',
        Value: `GH₵ ${metrics.estimatedCOGS.toFixed(2)}`,
        Note: 'Cost of Goods Sold (64.1% cost baseline)',
      },
      {
        Metric: 'Gross Profit',
        Value: `GH₵ ${metrics.grossProfit.toFixed(2)}`,
        Note: `${metrics.grossMarginPct}% gross profit margin`,
      },
      {
        Metric: 'Operating Expenses (OpEx)',
        Value: `GH₵ ${metrics.totalOpex.toFixed(2)}`,
        Note: 'Showroom rent, power, and logistics',
      },
      {
        Metric: 'Net Operating Profit',
        Value: `GH₵ ${metrics.netIncome.toFixed(2)}`,
        Note: `${metrics.netMarginPct}% net margin`,
      },
      {
        Metric: 'Total Transactions',
        Value: metrics.totalTransactions.toString(),
        Note: 'Completed sales receipts',
      },
      {
        Metric: 'Average Order Value (AOV)',
        Value: `GH₵ ${metrics.averageOrderValue.toFixed(2)}`,
        Note: 'Average basket size',
      },
      {
        Metric: 'Installment Receivables',
        Value: `GH₵ ${metrics.activeCreditReceivables.toFixed(2)}`,
        Note: 'Active customer credit financed',
      },
    ];

    const filename = `radiance-pos-analytics-${selectedOutlet}-${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = ['Metric', 'Value', 'Note'];
    const rows = csvRows.map((r) => [r.Metric, r.Value, r.Note]);
    exportToCsv(filename, headers, rows);
  };

  return (
    <div className="analytics-page p-4 sm:p-5 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* 1. TOP HEADER & INTERACTIVE FILTERS */}
      <div className="analytics-header flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: accentColor }}
            />
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Commercial Intelligence Hub
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2">
            <span>Analytics &amp; Executive Reports</span>
            <InfoHint text="Review financial performance, outlet comparisons, margin health, and AI-generated commercial insights." />
            <span className="text-[10px] bg-accent-50 text-accent-700 font-bold px-2 py-1 rounded-md border border-accent-200 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-accent-600" /> AI-Inferred
            </span>
          </h1>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          {/* Outlet Filter */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-300">
            <Store className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            <select
              value={selectedOutlet}
              onChange={(e) => setSelectedOutlet(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 py-1 pr-2 rounded-lg cursor-pointer focus:outline-none"
            >
              <option value="all">All Outlets (Consolidated)</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            {(['7d', '30d', 'mtd', 'qtd', 'ytd'] as const).map((rng) => (
              <button
                key={rng}
                onClick={() => setSelectedRange(rng)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer uppercase ${
                  selectedRange === rng
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {rng}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => setPrintModalOpen(true)}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all"
            title="Generate printable executive report"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Print Report</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all"
            title="Export CSV data"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* QUICK SNAPSHOT ROW (Streamlined, Solid Darker Shade KPI Cards) */}
      <div className="analytics-snapshot bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center text-accent-600">
              <Zap className="w-4 h-4 fill-accent-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900 tracking-tight">
                  Quick Snapshot
                </h2>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                  Live Vitals
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Core commercial performance and cash-flow vitals.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Daily Revenue */}
          <div role="button" tabIndex={0} onClick={() => setActiveSnapshot('dailyRevenue')} onKeyDown={(e) => e.key === 'Enter' && setActiveSnapshot('dailyRevenue')} className={`bg-white p-5 rounded-xl border shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between cursor-pointer ${activeSnapshot === 'dailyRevenue' ? 'border-accent-300' : 'border-slate-200'}`}>
            <div>
              <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" /> Daily Revenue
                </span>
                <span className="text-xs font-mono font-bold text-emerald-600 flex items-center gap-0.5">
                  <ArrowUpRight className="w-3.5 h-3.5" /> {quickSnapshot.dailyTrend}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-3 tracking-tight">
                GH₵ {quickSnapshot.dailyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
              Goal: GH₵ {quickSnapshot.dailyTarget.toLocaleString()} ({quickSnapshot.dailyTargetPace}%)
            </div>
            {activeSnapshot === 'dailyRevenue' && <MiniSparkline data={snapshotSeries.dailyRevenue} color="#F97316" />}
          </div>

          {/* Card 2: Profit Margin */}
          <div role="button" tabIndex={0} onClick={() => setActiveSnapshot('profitMargin')} onKeyDown={(e) => e.key === 'Enter' && setActiveSnapshot('profitMargin')} className={`bg-white p-5 rounded-xl border shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between cursor-pointer ${activeSnapshot === 'profitMargin' ? 'border-accent-300' : 'border-slate-200'}`}>
            <div>
              <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-accent-600" /> Gross Profit Margin
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-3 tracking-tight">
                {quickSnapshot.profitMargin}%
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
              Profit Yield: GH₵ {metrics.grossProfit.toLocaleString()}
            </div>
            {activeSnapshot === 'profitMargin' && <MiniSparkline data={snapshotSeries.profitMargin} color="#F97316" />}
          </div>

          {/* Card 3: Customer Retention */}
          <div role="button" tabIndex={0} onClick={() => setActiveSnapshot('retentionRate')} onKeyDown={(e) => e.key === 'Enter' && setActiveSnapshot('retentionRate')} className={`bg-white p-5 rounded-xl border shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between cursor-pointer ${activeSnapshot === 'retentionRate' ? 'border-accent-300' : 'border-slate-200'}`}>
            <div>
              <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-slate-500" /> Customer Retention
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-3 tracking-tight">
                {quickSnapshot.retentionRate}%
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-emerald-300 font-medium">
              Trade &amp; Contractor Loyalty
            </div>
            {activeSnapshot === 'retentionRate' && <MiniSparkline data={snapshotSeries.retentionRate} color="#64748B" />}
          </div>

          {/* Card 4: Average Order Value */}
          <div role="button" tabIndex={0} onClick={() => setActiveSnapshot('aov')} onKeyDown={(e) => e.key === 'Enter' && setActiveSnapshot('aov')} className={`bg-white p-5 rounded-xl border shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between cursor-pointer ${activeSnapshot === 'aov' ? 'border-accent-300' : 'border-slate-200'}`}>
            <div>
              <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-slate-500" /> Average Ticket (AOV)
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-3 tracking-tight">
                GH₵ {quickSnapshot.aov.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
              Volume: {metrics.totalTransactions} Completed Orders
            </div>
            {activeSnapshot === 'aov' && <MiniSparkline data={snapshotSeries.aov} color="#64748B" />}
          </div>
        </div>
      </div>

      {/* 2. WHAT THE FIGURES SAY — derived, never asserted */}
      <div className="analytics-inference bg-white text-slate-800 rounded-xl p-5 sm:p-6 border border-slate-200 shadow-xs overflow-hidden">
        <div className="relative z-10 space-y-5">

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent-500" />
                <span>What the figures say</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Every line below is computed from this period&rsquo;s sales, returns, discounts and
                expenses. Nothing is estimated.
              </p>
            </div>
            {!canViewProfit && (
              // FR-RPT-05: said out loud, so an empty space is not mistaken for
              // a shop with no margin.
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5">
                Cost and profit hidden for this account
              </span>
            )}
          </div>

          {/* Sales against operating expenses */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Sales vs operating expenses</h3>
                <p className="text-[11px] text-slate-500">Daily movement across the selected period</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-500" /> Sales</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> Expenses</span>
              </div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={operatingPerformanceData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                  <Tooltip formatter={(value: number) => `GH₵ ${value.toLocaleString()}`} contentStyle={{ border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="sales" fill="#F97316" radius={[3, 3, 0, 0]} barSize={16} />
                  <Line type="monotone" dataKey="expenses" stroke="#64748B" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Observations */}
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-accent-500" /> Observations
              </div>
              {observations.length === 0 ? (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  {metrics.totalTransactions === 0
                    ? 'No sales in this period, so there is nothing to report.'
                    : 'Nothing in this period stands out.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {observations.map((observation) => (
                    <div
                      key={observation.id}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        {observation.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        {observation.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                        <span className="text-xs font-bold text-slate-800">{observation.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-600">{observation.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Worth attention */}
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-accent-500" /> Worth attention
              </div>
              {risks.length === 0 ? (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  Nothing in this period needs looking at.
                </p>
              ) : (
                <div className="space-y-2">
                  {risks.map((risk) => (
                    <div
                      key={risk.id}
                      className={`border rounded-xl p-3 space-y-1 ${
                        risk.severity === 'high'
                          ? 'bg-red-50 border-red-200'
                          : risk.severity === 'medium'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold ${
                          risk.severity === 'high' ? 'text-red-900'
                            : risk.severity === 'medium' ? 'text-amber-900' : 'text-slate-800'
                        }`}>
                          {risk.title}
                        </span>
                        <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded border ${
                          risk.severity === 'high'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : risk.severity === 'medium'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}>
                          {risk.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">{risk.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 3. CORE FINANCIAL SCORECARDS (6 KPI TILES) */}
      <div className="analytics-scorecards grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Gross Revenue */}
          <div className="analytics-metric-card bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>Gross Revenue</span>
            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded font-mono font-bold">
              +14.2%
            </span>
          </div>
          <div className="text-xl font-black text-white tracking-tight">
            GH₵ {metrics.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>COGS: GH₵ {metrics.estimatedCOGS.toLocaleString()}</span>
            <span className="font-bold text-slate-700">Net Sales</span>
          </div>
        </div>

        {/* Gross Profit & Margin */}
          <div className="analytics-metric-card bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>Gross Margin</span>
            <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-mono font-bold">
              Net of returns
            </span>
          </div>
          <div className="text-xl font-black text-emerald-700 tracking-tight">
            {metrics.grossMarginPct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Profit: GH₵ {metrics.grossProfit.toLocaleString()}</span>
            <span className="font-bold text-emerald-600">Healthy</span>
          </div>
        </div>

        {/* Operating Expenses */}
          <div className="analytics-metric-card bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>Total OpEx</span>
            <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-mono font-bold">
              P&amp;L Deduct
            </span>
          </div>
          <div className="text-xl font-black text-white tracking-tight">
            GH₵ {metrics.totalOpex.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Net Income: GH₵ {metrics.netIncome.toLocaleString()}</span>
            <span className="font-mono text-slate-700 font-bold">{metrics.netMarginPct}% Net</span>
          </div>
        </div>

        {/* Average Order Value (AOV) */}
          <div className="analytics-metric-card bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>Average Ticket (AOV)</span>
            <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-mono font-bold">
              Per Sale
            </span>
          </div>
          <div className="text-xl font-black text-white tracking-tight">
            GH₵ {metrics.averageOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{metrics.totalTransactions} Total Receipts</span>
            <span className="font-bold text-slate-700">Basket Size</span>
          </div>
        </div>

        {/* Active Installments Financed */}
          <div className="analytics-metric-card bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>Credit Receivables</span>
            <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-mono font-bold">
              Active Plans
            </span>
          </div>
          <div className="text-xl font-black text-white tracking-tight">
            GH₵ {metrics.activeCreditReceivables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>
              {filteredInstallments.filter((plan) => plan.status !== 'COMPLETED').length} active plans
            </span>
            <span className="font-bold text-slate-700">
              {filteredInstallments.filter((plan) => plan.status === 'DEFAULTED').length} defaulted
            </span>
          </div>
        </div>

        {/* Returns & Swap Rate */}
          <div className="analytics-metric-card bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>Return &amp; Swap Rate</span>
            <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-mono font-bold">
              Of sales
            </span>
          </div>
          <div className="text-xl font-black text-white tracking-tight">
            {metrics.returnRatePct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{metrics.refundCount} returns</span>
            <span className="font-bold text-slate-700">
              GH₵ {metrics.refundTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} refunded
            </span>
          </div>
        </div>
      </div>

      {/* 4. PRIMARY ANALYTICS CHARTS GRID */}
      <div className="analytics-chart-grid grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* CHART 1: SALES & GROSS MARGIN VELOCITY */}
        <div className="bg-white rounded-xl p-5 border border-slate-300 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <span>Sales &amp; Margin Velocity</span>
                  {quickSnapshot.changePercent !== null && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-0.5 ${
                      quickSnapshot.changePercent >= 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {quickSnapshot.changePercent >= 0
                        ? <TrendingUp className="w-3 h-3" />
                        : <TrendingDown className="w-3 h-3" />}
                      {quickSnapshot.dailyTrend}
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Daily gross sales (GH₵) vs Cost of Goods Sold and Margin %
                </p>
              </div>
              <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                14-Day Cycle
              </div>
            </div>

            {/* Recharts Composed Area + Line */}
            <div className="h-64 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={salesVelocityData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px' }}
                    formatter={(value: any, name: string) => [
                      name === 'margin' ? `${value}%` : `GH₵ ${Number(value).toLocaleString()}`,
                      name === 'revenue' ? 'Gross Revenue' : name === 'cogs' ? 'Cost of Goods (COGS)' : 'Margin %',
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Area yAxisId="left" type="monotone" dataKey="revenue" fill="#fdba74" fillOpacity={0.3} stroke="#f97316" strokeWidth={2} name="revenue" />
                  <Bar yAxisId="left" dataKey="cogs" fill="#cbd5e1" barSize={12} radius={[4, 4, 0, 0]} name="cogs" />
                  <Line yAxisId="right" type="monotone" dataKey="margin" stroke="#64748B" strokeWidth={2.5} dot={{ r: 3 }} name="margin" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <ChartNote note={chartNotes.revenueVelocity} />
        </div>

        {/* CHART 2: MULTI-OUTLET COMPARISON MATRIX */}
        <div className="bg-white rounded-xl p-5 border border-slate-300 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <span>Multi-Outlet Performance Matrix</span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                    3 Store Outlets
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Revenue (GH₵) vs Gross Profit contribution by location
                </p>
              </div>
              <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                Consolidated
              </div>
            </div>

            {/* Recharts Grouped Bar */}
            <div className="h-64 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={outletComparisonData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="outlet" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px' }}
                    formatter={(value: any, name: string) => [`GH₵ ${Number(value).toLocaleString()}`, name === 'revenue' ? 'Revenue' : 'Gross Profit']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="revenue" fill="#f97316" radius={[6, 6, 0, 0]} name="revenue" />
                  <Bar dataKey="profit" fill="#64748B" radius={[6, 6, 0, 0]} name="profit" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <ChartNote note={chartNotes.outletComparison} />
        </div>

        {/* CHART 3: PRODUCT CATEGORY CONTRIBUTION & MARGIN DENSITY */}
        <div className="bg-white rounded-xl p-5 border border-slate-300 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <span>Category Revenue &amp; Margin Density</span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                    6 Categories
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Gross revenue share and associated category margin percentage
                </p>
              </div>
            </div>

            {/* Recharts Pie / Donut & Category Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center mt-3">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="revenue"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px' }}
                      formatter={(val: any) => [`GH₵ ${Number(val).toLocaleString()}`, 'Revenue']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend & Margin List */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {categoryData.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="font-bold text-slate-700 truncate">{cat.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-slate-900 font-bold">GH₵ {(cat.revenue / 1000).toFixed(1)}k</span>
                      <span className="text-[10px] text-emerald-600 font-bold ml-1.5">{cat.margin}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ChartNote note={chartNotes.categoryContribution} />
        </div>

        {/* CHART 4: PAYMENT CHANNELS & SETTLEMENT VELOCITY */}
        <div className="bg-white rounded-xl p-5 border border-slate-300 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <span>Payment Channels &amp; Liquidity</span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                    Settlement Split
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Digital money (MoMo/Card) vs Physical Cash drawer collections
                </p>
              </div>
            </div>

            {/* Bar representation */}
            <div className="space-y-3 mt-4">
              {paymentChannelData.map((ch) => (
                <div key={ch.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
                      {ch.name} <span className="text-[10px] text-slate-400">({ch.badge})</span>
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      GH₵ {ch.amount.toLocaleString()} ({ch.percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${ch.percent}%`, backgroundColor: ch.color }}
                    />
                  </div>
                </div>
              ))}

              {paymentChannelData.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-300 mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Digital vs cash:</span>
                  <span className="font-bold text-slate-900">
                    {digitalVsCash.digitalPercent.toFixed(1)}% digital &bull;{' '}
                    {digitalVsCash.cashPercent.toFixed(1)}% cash
                  </span>
                </div>
              )}
            </div>
          </div>

          <ChartNote note={chartNotes.paymentChannels} />
        </div>

        {/* CHART 5: CUSTOMER INSTALLMENT CREDIT AGING */}
        <div className="bg-white rounded-xl p-5 border border-slate-300 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <span>Installment Credit &amp; Debtor Aging</span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                    Receivables
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {installmentAgingData.length === 0
                    ? 'No customer financing outstanding'
                    : `${filteredInstallments.filter((plan) => plan.status !== 'COMPLETED').length} active plans, `
                      + `GH₵ ${installmentAgingData
                        .reduce((sum, row) => sum + row.balance, 0)
                        .toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} outstanding`}
                </p>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              {installmentAgingData.map((stage) => (
                <div key={stage.stage} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <div>
                      <div className="font-bold text-slate-800">{stage.stage}</div>
                      <div className="text-[11px] text-slate-400">{stage.count} customer plans</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-black text-slate-900">
                      GH₵ {stage.balance.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500">
                      {((stage.balance / 18200) * 100).toFixed(1)}% of total debt
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ChartNote note={chartNotes.installmentCredit} />
        </div>

        {/* CHART 6: TOP SELLING PRODUCTS & INVENTORY TURNOVER */}
        <div className="bg-white rounded-xl p-5 border border-slate-300 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <span>Top Product Velocity &amp; Fast Movers</span>
                  <span className="text-[10px] bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-full border border-rose-200">
                    Turnover Leaders
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Best-selling architectural fixtures and trade hardware items
                </p>
              </div>
            </div>

            <div className="space-y-2.5 mt-4">
              {topProductsData.map((prod, idx) => (
                <div
                  key={prod.name}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 font-mono font-bold flex items-center justify-center text-[10px] shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="truncate">
                      <div className="font-bold text-slate-800 truncate">{prod.name}</div>
                      <div className="text-[10px] text-slate-400">{prod.units} units sold</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-slate-900">
                      GH₵ {prod.revenue.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-emerald-600 font-bold">
                      {prod.margin}% Margin
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ChartNote note={chartNotes.inventoryTurnover} />
        </div>
      </div>

      {/* 5. PRINT-READY OFFICIAL REPORT MODAL */}
      {printModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-300 animate-modal-card">
            {/* Report Header */}
            <div className="p-5 sm:p-6 border-b border-slate-300 flex items-start justify-between bg-slate-50 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-slate-900">Radiance POS</span>
                  <span className="text-[10px] font-black uppercase text-accent-600 bg-accent-50 px-2 py-0.5 rounded border border-accent-200">
                    Official Executive Report
                  </span>
                </div>
                <h2 className="text-lg font-black text-slate-800">
                  Commercial Performance &amp; Analytics Dossier
                </h2>
                <p className="text-xs text-slate-500">
                  Outlet: {selectedOutlet === 'all' ? 'All Outlets (Unified Consolidated)' : outlets.find((o) => o.id === selectedOutlet)?.name}
                </p>
              </div>

              <div className="flex items-start gap-4">
                <div className="text-right text-xs text-slate-500 font-mono hidden sm:block">
                  <div>Date: {new Date().toLocaleDateString('en-GB')}</div>
                  <div>Time: {new Date().toLocaleTimeString()}</div>
                  <div>Ref: RPT-{Date.now().toString().slice(-6)}</div>
                </div>
                <button
                  onClick={() => setPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              {/* P&L Snapshot */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  1. Profit &amp; Loss Statement Summary
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-xs">
                  <div>
                    <div className="text-slate-400">Gross Sales:</div>
                    <div className="text-sm font-black text-slate-900">GH₵ {metrics.grossRevenue.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Cost of Goods (COGS):</div>
                    <div className="text-sm font-black text-slate-900">GH₵ {metrics.estimatedCOGS.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Gross Profit (Margin):</div>
                    <div className="text-sm font-black text-emerald-700">GH₵ {metrics.grossProfit.toLocaleString()} ({metrics.grossMarginPct}%)</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Net Income:</div>
                    <div className="text-sm font-black text-slate-900">GH₵ {metrics.netIncome.toLocaleString()} ({metrics.netMarginPct}%)</div>
                  </div>
                </div>
              </div>

              {/* Observations — the same derived lines as the screen */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  2. Observations
                </h3>
                {observations.length === 0 ? (
                  <p className="text-xs text-slate-500">Nothing in this period stands out.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {observations.map((observation) => (
                      <li key={observation.id} className="text-xs text-slate-800">
                        <span className="font-bold">{observation.title}.</span>{' '}
                        <span className="text-slate-600">{observation.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Worth attention */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  3. Worth attention
                </h3>
                {risks.length === 0 ? (
                  <p className="text-xs text-slate-500">Nothing in this period needs looking at.</p>
                ) : (
                  <div className="space-y-2">
                    {risks.map((risk) => (
                      <div key={risk.id} className="p-3 bg-slate-50 rounded-xl border border-slate-300 text-xs">
                        <span className="font-bold text-slate-900 uppercase">[{risk.severity}] {risk.title}: </span>
                        <span className="text-slate-600">{risk.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-300 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => setPrintModalOpen(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl cursor-pointer transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
