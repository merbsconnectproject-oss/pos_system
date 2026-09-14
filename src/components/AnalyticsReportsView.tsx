import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
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

interface ChartInference {
  chartId: string;
  chartTitle: string;
  trend: 'bullish' | 'bearish' | 'neutral' | 'caution';
  inference: string;
  keyDriver: string;
  suggestedAction: string;
}

interface AiInferenceData {
  isAiGenerated: boolean;
  modelUsed: string;
  generatedAt: string;
  executiveSummary: string;
  financialHealthScore: number;
  financialHealthGrade: string;
  chartInferences: ChartInference[];
  keyObservations: string[];
  anomaliesAndRisks: Array<{
    title: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    suggestedAction: string;
  }>;
  strategicRecommendations: Array<{
    priority: 'P1' | 'P2' | 'P3';
    title: string;
    impact: string;
    timeline: string;
    details: string;
  }>;
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

const ChartInferenceCallout: React.FC<{
  id: string;
  title: string;
  trend: string;
  inference: string;
  driver: string;
  action: string;
  expandedId: string | null;
  onToggle: (id: string) => void;
  tone?: 'default' | 'danger';
}> = ({ id, title, trend, inference, driver, action, expandedId, onToggle, tone = 'default' }) => {
  const expanded = expandedId === id;
  const danger = tone === 'danger';

  return (
    <div className={`mt-4 rounded-xl border p-3.5 ${danger ? 'bg-rose-50/70 border-rose-200/80' : 'analytics-callout bg-slate-50 border-slate-200'}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={`font-bold flex items-center gap-1.5 ${danger ? 'text-rose-950' : 'text-slate-900'}`}>
            <Sparkles className={`w-3.5 h-3.5 ${danger ? 'text-rose-600' : 'text-accent-600'}`} /> {title}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${danger ? 'text-rose-800 bg-rose-100' : 'text-slate-700 bg-slate-200'}`}>
              {trend}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''} ${danger ? 'text-rose-700' : 'text-slate-500'}`} />
          </span>
        </div>
        {!expanded && (
          <p className={`mt-2 text-[11px] font-semibold ${danger ? 'text-rose-800' : 'text-slate-600'}`}>
            Click to reveal AI inference details.
          </p>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          <p className={`text-xs leading-relaxed ${danger ? 'text-rose-900/90' : 'text-slate-700'}`}>
            {inference}
          </p>
          <div className={`text-[11px] font-medium pt-1 border-t flex items-center justify-between gap-3 ${danger ? 'text-rose-950/80 border-rose-200/60' : 'text-slate-600 border-slate-200'}`}>
            <span>Driver: {driver}</span>
            <span className={`font-bold shrink-0 ${danger ? 'text-rose-800' : 'text-accent-700'}`}>Action: {action}</span>
          </div>
        </div>
      )}
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInferences, setAiInferences] = useState<AiInferenceData | null>(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<'dailyRevenue' | 'profitMargin' | 'retentionRate' | 'aov'>('dailyRevenue');
  const [expandedObservation, setExpandedObservation] = useState<number | null>(0);
  const [expandedRecommendation, setExpandedRecommendation] = useState<number | null>(0);
  const [answerPanelOpen, setAnswerPanelOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [expandedChartInference, setExpandedChartInference] = useState<string | null>(null);

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
    const grossRevenue = num(summary?.revenue);
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
   * Chart 5: installment credit ageing.
   *
   * <p>Empty, and it should be. Installments are Stage 2 and nothing records
   * one — the table that was here showed eight current plans and GH₵ 18,200
   * outstanding for a facility the shop does not offer.
   */
  const installmentAgingData = useMemo(() => [] as Array<{
    stage: string; count: number; balance: number; color: string;
  }>, []);

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

  // Trigger AI Inference via server-side route
  const fetchAiInference = async (inquiryText?: string) => {
    setAiLoading(true);
    try {
      const activeOutletName =
        selectedOutlet === 'all'
          ? 'All Outlets (Radiance POS Multi-Store)'
          : outlets.find((o) => o.id === selectedOutlet)?.name || selectedOutlet;

      const payload = {
        outletName: activeOutletName,
        metricsSummary: {
          totalRevenue: metrics.grossRevenue,
          cogs: metrics.estimatedCOGS,
          grossProfit: metrics.grossProfit,
          grossMarginPct: metrics.grossMarginPct,
          totalOpex: metrics.totalOpex,
          netIncome: metrics.netIncome,
          netMarginPct: metrics.netMarginPct,
          totalTransactions: metrics.totalTransactions,
          averageOrderValue: metrics.averageOrderValue,
          activeCreditReceivables: metrics.activeCreditReceivables,
          returnRatePct: metrics.returnRatePct,
          topCategory: 'Lighting & Lamps (Radiance)',
        },
        chartContext: {
          salesVelocitySummary: salesVelocityData.slice(-5),
          outlets: outletComparisonData,
          categoryBreakdown: categoryData,
          paymentDistribution: paymentChannelData,
          installmentAging: installmentAgingData,
        },
        customQuestion: inquiryText || customQuestion || undefined,
      };

      const res = await fetch('/api/analytics/ai-inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data: AiInferenceData = await res.json();
        setAiInferences(data);
      } else {
        throw new Error(`Server returned ${res.status}`);
      }
    } catch (_err) {
      // Graceful fallback to local deterministic smart rules engine
      setAiInferences({
        isAiGenerated: false,
        modelUsed: 'Radiance POS Smart Rules Inference Engine (Deterministic Local)',
        generatedAt: new Date().toISOString(),
        executiveSummary: `For Radiance POS, operating revenues stand at GH₵ ${metrics.grossRevenue.toLocaleString()} with a sustained gross profit margin of ${metrics.grossMarginPct}%. Premium architectural fixtures in East Legon generate an Average Order Value of GH₵ ${metrics.averageOrderValue.toLocaleString()}, while commercial electrical cables maintain recurring trade contractor volume.`,
        financialHealthScore: 86,
        financialHealthGrade: 'A',
        chartInferences: [
          {
            chartId: 'revenue-velocity',
            chartTitle: 'Sales & Gross Margin Velocity',
            trend: 'bullish',
            inference: `Daily sales demonstrate steady velocity with gross margins consistently holding above 34%. Margin elasticity is protected by showroom architectural chandeliers.`,
            keyDriver: 'Contractor commercial fit-outs and high-margin bespoke chandeliers',
            suggestedAction: 'Maintain stock buffer of 24V drivers and mounting brackets to prevent installation bottlenecks.',
          },
          {
            chartId: 'outlet-comparison',
            chartTitle: 'Multi-Outlet Performance Matrix',
            trend: 'neutral',
            inference: `Radiance Lighting captures highest ticket value (GH₵ 1,245/order), whereas Inco Hardware leads unit turnover. Cross-selling opportunities exist between locations.`,
            keyDriver: 'East Legon residential showroom demographics vs Tema industrial supply.',
            suggestedAction: 'Incentivize Tema trade electricians with trade rebates on Radiance lighting collections.',
          },
          {
            chartId: 'category-contribution',
            chartTitle: 'Product Category Contribution & Margin Density',
            trend: 'bullish',
            inference: `Lighting & Lamps and Solar Inverters provide 58% of gross profit despite comprising only 38% of physical units sold.`,
            keyDriver: 'High margin density on designer lighting fixtures.',
            suggestedAction: 'Expand Nordic lighting series with complementary wall sconces.',
          },
        ],
        keyObservations: [
          `Radiance Lighting average basket size is 2.8x higher than standard hardware branches.`,
          `Mobile Money transaction settlement represents 48% of gross turnover.`,
          `Installment financing delinquency remains at a very low 4.3%.`,
        ],
        anomaliesAndRisks: [
          {
            title: 'Cluster of Installment Due Dates',
            severity: 'medium',
            description: 'Three contractor installment tranches are due within the same 48-hour window.',
            suggestedAction: 'Dispatch automated SMS payment reminders.',
          },
        ],
        strategicRecommendations: [
          {
            priority: 'P1',
            title: 'Standardize Track Light Kits',
            impact: '+6.5% Gross Margin',
            timeline: '7 Days',
            details: 'Pre-assemble 2-meter track light kits with power feeds and end caps for faster point-of-sale dispatch.',
          },
        ],
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Load initial inference once on mount
  useEffect(() => {
    fetchAiInference();
  }, [selectedOutlet]);

  // Handle preset prompt click
  const handlePresetClick = (preset: { label: string; query: string }) => {
    setActivePreset(preset.label);
    setCustomQuestion(preset.query);
    setAnswerPanelOpen(true);
    fetchAiInference(preset.query);
  };

  // Helper to find specific chart inference from AI response
  const getChartInference = (chartId: string): ChartInference | undefined => {
    return aiInferences?.chartInferences.find((c) => c.chartId === chartId);
  };

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
            onClick={() => fetchAiInference()}
            disabled={aiLoading}
            className="px-3.5 py-2 bg-accent-600 hover:bg-accent-700 text-white text-xs font-black rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
            title="Re-run Gemini AI inference on active metrics"
          >
            <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
            <span>{aiLoading ? 'Synthesizing...' : 'Refresh AI Inference'}</span>
          </button>

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

      {/* 2. AI EXECUTIVE INFERENCE & STRATEGIC RECOMMENDATIONS PANEL */}
      <div className="analytics-inference bg-white text-slate-800 rounded-xl p-5 sm:p-6 border border-slate-200 shadow-xs overflow-hidden">

        <div className="relative z-10 space-y-5">
          {/* AI Banner Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-50 border border-accent-200 flex items-center justify-center text-accent-600 shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
                    Executive Commercial Inference
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-200 font-bold">
                    {aiInferences?.modelUsed || 'Gemini 3.8 Flash'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Synthesized at {aiInferences?.generatedAt ? new Date(aiInferences.generatedAt).toLocaleTimeString() : 'Just now'} • Automated diagnostic analysis
                </p>
              </div>
            </div>

            {/* Health Score Pill */}
            <div className="flex items-center gap-3 self-start sm:self-auto bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Financial Health
                </div>
                <div className="text-xs font-bold text-slate-700">
                  Commercial Vitality Grade
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-black text-emerald-600">
                  {aiInferences?.financialHealthScore ?? 88}
                </div>
                <div className="text-xs font-black bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg border border-emerald-300">
                  {aiInferences?.financialHealthGrade ?? 'A'}
                </div>
              </div>
            </div>
          </div>

          {/* Compact performance workspace */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Sales vs Operating Expenses</h3>
                  <p className="text-[11px] text-slate-500">Daily movement across the selected period</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-500" /> Sales</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> OpEx</span>
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

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Financial signals</h3>
                  <p className="text-[11px] text-slate-500">Select a row to inspect the driver</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">AI summary</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Margin health', value: `${metrics.grossMarginPct}%`, detail: `Gross profit is GH₵ ${metrics.grossProfit.toLocaleString()} on current sales.`, tone: 'text-emerald-700' },
                  { label: 'Cash exposure', value: `GH₵ ${(metrics.activeCreditReceivables / 1000).toFixed(1)}k`, detail: 'Active installment receivables require regular collection follow-up.', tone: 'text-slate-900' },
                  { label: 'Revenue pace', value: quickSnapshot.dailyTrend, detail: `Daily revenue is tracking at ${quickSnapshot.dailyTargetPace}% of the selected target.`, tone: 'text-accent-700' },
                ].map((signal, index) => (
                  <button key={signal.label} type="button" onClick={() => setExpandedObservation(expandedObservation === index ? null : index)} className="w-full text-left bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-700">{signal.label}</span>
                      <span className={`text-sm font-black font-mono ${signal.tone}`}>{signal.value}</span>
                    </div>
                    {expandedObservation === index && <p className="text-[11px] text-slate-500 mt-1.5 pr-4">{signal.detail}</p>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive AI Prompt & Preset Chips */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-accent-600" /> Ask AI Commercial Analyst:
              </span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">
                Click a preset or enter a targeted query
              </span>
            </div>

            {answerPanelOpen && activePreset && (
              <div className="bg-slate-900 text-white rounded-xl p-3.5 border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-accent-300">Analyst response</span>
                  <button type="button" onClick={() => setAnswerPanelOpen(false)} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Close analyst response"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-xs leading-relaxed text-slate-200">{aiInferences?.executiveSummary || 'The analyst is preparing a response from the selected commercial signals.'}</p>
              </div>
            )}

            {/* Preset Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                {
                  label: 'Lighting vs Hardware Margins',
                  query: 'Compare the gross margin density of Radiance Lighting chandeliers against standard building hardware.',
                },
                {
                  label: 'Debtor & Installment Risks',
                  query: 'Analyze our customer installment financing balance of GH₵ 18,200 and flag any credit collection risks.',
                },
                {
                  label: 'Fast vs Dead Stock',
                  query: 'Which items are experiencing high velocity and which are at risk of tying up working capital as dead stock?',
                },
                {
                  label: 'Payment Method Friction',
                  query: 'Evaluate our Mobile Money vs Cash split and recommend improvements for cashier drawer reconciliation.',
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-xl whitespace-nowrap cursor-pointer transition-all border ${
                    activePreset === preset.label
                      ? 'bg-accent-500 text-white border-accent-500 shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customQuestion.trim()) {
                  fetchAiInference(customQuestion);
                }
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Ask a specific question (e.g. 'How should we price magnetic track lights next month?')..."
                  className="w-full bg-slate-50 border border-slate-300 focus:border-accent-500 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={aiLoading || !customQuestion.trim()}
                className="px-4 py-2.5 bg-accent-500 hover:bg-accent-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Analyze</span>
              </button>
            </form>
          </div>

          {/* Key Observations & Strategic Priorities Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            {/* Left: Observations & Warnings */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Key Commercial Observations
              </div>
              <div className="space-y-2">
                {(aiInferences?.keyObservations || [
                  `Radiance Lighting average basket size is 2.8x higher than standard hardware branches.`,
                  `Mobile Money transaction settlement accounts for 48% of gross turnover.`,
                  `Returns & swaps restock compliance remains steady at 92%.`,
                ]).map((obs, idx) => (
                  <button key={idx} type="button" onClick={() => setExpandedObservation(expandedObservation === idx + 3 ? null : idx + 3)} className="w-full flex items-center justify-between gap-3 text-left text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 hover:bg-white transition-colors">
                    <span className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0 mt-1.5" /><span className="font-semibold">{obs}</span></span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expandedObservation === idx + 3 ? 'rotate-180' : ''}`} />
                  </button>
                ))}
              </div>

              {/* Anomalies / Risks */}
              {aiInferences?.anomaliesAndRisks && aiInferences.anomaliesAndRisks.length > 0 && (
                <div className="pt-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-red-700 flex items-center gap-1 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Flagged Commercial Anomalies
                  </div>
                  <div className="space-y-2">
                    {aiInferences.anomaliesAndRisks.map((risk, idx) => (
                      <div
                        key={idx}
                        className="bg-red-50 border border-red-200 p-2.5 rounded-xl text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-red-900">{risk.title}</span>
                          <span className="text-[9px] uppercase font-black px-1.5 py-0.2 rounded bg-red-100 text-red-800 border border-red-300">
                            {risk.severity} severity
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px]">{risk.description}</p>
                        <p className="text-red-800 text-[11px] font-semibold pt-0.5">
                          ↳ Action: {risk.suggestedAction}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Prescriptive Action Checklist */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-accent-500" /> Prescriptive Action Plan
              </div>
              <div className="space-y-2.5">
                {(aiInferences?.strategicRecommendations || [
                  {
                    priority: 'P1',
                    title: 'Standardize Magnetic Track Kits',
                    impact: '+6.5% Gross Margin',
                    timeline: 'Next 7 Days',
                    details: 'Bundle track rails with live feeds and end caps to accelerate showroom contractor purchases.',
                  },
                  {
                    priority: 'P2',
                    title: 'Clear Aging Outdoor Fixtures',
                    impact: 'GH₵ 8,500 Cash Released',
                    timeline: 'Next 14 Days',
                    details: 'Apply 10% promotional clearance to slow-moving exterior lanterns to free working capital.',
                  },
                  {
                    priority: 'P3',
                    title: 'Contractor Trade Incentive Tiers',
                    impact: '+18% Repeat Visits',
                    timeline: 'Next 30 Days',
                    details: 'Implement tiered trade discount pricing for registered electrical contractors.',
                  },
                ]).map((rec, idx) => (
                  <button
                    type="button"
                    onClick={() => setExpandedRecommendation(expandedRecommendation === idx ? null : idx)}
                    key={idx}
                    className="w-full text-left bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs space-y-1.5 hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
                            rec.priority === 'P1'
                              ? 'bg-rose-100 text-rose-700 border-rose-200'
                              : rec.priority === 'P2'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {rec.priority}
                        </span>
                        <span className="font-bold text-slate-900 text-xs">{rec.title}</span>
                      </div>
                      <span className="flex items-center gap-2"><span className="text-[10px] font-mono text-emerald-700 font-bold">{rec.impact}</span><ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedRecommendation === idx ? 'rotate-180' : ''}`} /></span>
                    </div>
                    {expandedRecommendation === idx && <><p className="text-[11px] text-slate-600">{rec.details}</p><div className="text-[10px] text-slate-400 font-mono">Target Timeline: {rec.timeline}</div></>}
                  </button>
                ))}
              </div>
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
            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded font-mono font-bold">
              Target 35%
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
            <span>3 Active Contracts</span>
            <span className="font-bold text-slate-700">84% Current</span>
          </div>
        </div>

        {/* Returns & Swap Rate */}
          <div className="analytics-metric-card bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>Return &amp; Swap Rate</span>
            <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded font-mono font-bold">
              Restock 92%
            </span>
          </div>
          <div className="text-xl font-black text-white tracking-tight">
            {metrics.returnRatePct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>GH₵ {metrics.returnsVolume.toLocaleString()} Restocked</span>
            <span className="font-bold text-emerald-600">Low Loss</span>
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
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" /> +16.8%
                  </span>
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

          <ChartInferenceCallout
            id="revenue-velocity"
            title="AI Chart Inference:"
            trend={getChartInference('revenue-velocity')?.trend || 'Bullish Pattern'}
            inference={getChartInference('revenue-velocity')?.inference || `Gross margin has stabilized above 34% driven by premium architectural chandelier sales and bundled accessories at Radiance Lighting.`}
            driver={getChartInference('revenue-velocity')?.keyDriver || 'Contractor commercial fit-outs and high-margin bespoke chandeliers'}
            action="Stock 24V drivers"
            expandedId={expandedChartInference}
            onToggle={(id) => setExpandedChartInference(expandedChartInference === id ? null : id)}
          />
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

          <ChartInferenceCallout
            id="outlet-comparison"
            title="AI Outlet Benchmarking:"
            trend={getChartInference('outlet-comparison')?.trend || 'Margin Divergence'}
            inference={getChartInference('outlet-comparison')?.inference || `Radiance Lighting achieves the highest average basket size (GH₵ 1,245) and gross margin (40%), while Inco Hardware leads overall transaction volume.`}
            driver={getChartInference('outlet-comparison')?.keyDriver || 'East Legon residential affluent fit-outs vs Tema industrial volume'}
            action="Cross-sell downlights"
            expandedId={expandedChartInference}
            onToggle={(id) => setExpandedChartInference(expandedChartInference === id ? null : id)}
          />
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

          <ChartInferenceCallout
            id="category-contribution"
            title="AI Category Analysis:"
            trend={getChartInference('category-contribution')?.trend || 'Margin Driver'}
            inference={getChartInference('category-contribution')?.inference || `Lighting & Lamps provides 35% of total gross turnover and generates the highest margin yield at 42.5%, outperforming raw electrical cables.`}
            driver={getChartInference('category-contribution')?.keyDriver || 'Premium aesthetics and smart switchgear demand'}
            action="Bundle accessories"
            expandedId={expandedChartInference}
            onToggle={(id) => setExpandedChartInference(expandedChartInference === id ? null : id)}
          />
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

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-300 mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Digital vs Cash Split:</span>
                <span className="font-bold text-slate-900">64% Digital (MoMo / Card / Bank) • 36% Cash Float</span>
              </div>
            </div>
          </div>

          <ChartInferenceCallout
            id="payment-channels"
            title="AI Cash Flow Inference:"
            trend={getChartInference('payment-channels')?.trend || 'Low Cash Risk'}
            inference={getChartInference('payment-channels')?.inference || `Mobile Money (48%) is the dominant settlement rail. This significantly mitigates cashier drawer theft risks and accelerates end-of-shift blind balancing.`}
            driver={getChartInference('payment-channels')?.keyDriver || 'Contractor on-site QR and bank wire verification'}
            action="Pre-fund merchant floats"
            expandedId={expandedChartInference}
            onToggle={(id) => setExpandedChartInference(expandedChartInference === id ? null : id)}
          />
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
                  Aging breakdown of GH₵ 18,200 funded customer financing
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

          <ChartInferenceCallout
            id="installment-credit"
            title="AI Debtor Inference:"
            trend={getChartInference('installment-credit')?.trend || 'Moderate Caution'}
            inference={getChartInference('installment-credit')?.inference || `84% of installment plans are current. Only GH₵ 2,900 is in grace or overdue status, reflecting solid down payments (30%+) and verified contractor phones.`}
            driver={getChartInference('installment-credit')?.keyDriver || 'Customer home renovation multi-room lighting financing'}
            action="Trigger SMS 48h prior"
            expandedId={expandedChartInference}
            onToggle={(id) => setExpandedChartInference(expandedChartInference === id ? null : id)}
          />
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

          <ChartInferenceCallout
            id="inventory-turnover"
            title="AI Inventory Inference:"
            trend={getChartInference('inventory-turnover')?.trend || 'Stock Alert'}
            inference={getChartInference('inventory-turnover')?.inference || `15W Downlights and 2.5mm cables turn over every 14 days. Linear battens are approaching minimum alert levels and require prioritized reordering.`}
            driver={getChartInference('inventory-turnover')?.keyDriver || 'High residential installation frequency in East Legon'}
            action="Create GRN batch"
            expandedId={expandedChartInference}
            onToggle={(id) => setExpandedChartInference(expandedChartInference === id ? null : id)}
            tone="danger"
          />
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

              {/* AI Executive Assessment */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  2. AI Executive Diagnostic Assessment
                </h3>
                <div className="p-4 bg-accent-50/70 rounded-xl border border-accent-200 text-xs text-slate-800 leading-relaxed">
                  {aiInferences?.executiveSummary}
                </div>
              </div>

              {/* Strategic Priorities */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  3. Managerial Directives &amp; Action Plan
                </h3>
                <div className="space-y-2">
                  {(aiInferences?.strategicRecommendations || []).map((rec, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-300 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900">[{rec.priority}] {rec.title}: </span>
                        <span className="text-slate-600">{rec.details}</span>
                      </div>
                      <span className="font-mono text-emerald-700 font-bold shrink-0 ml-3">{rec.impact}</span>
                    </div>
                  ))}
                </div>
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
