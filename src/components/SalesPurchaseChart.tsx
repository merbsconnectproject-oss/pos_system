import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, TrendingUp, ArrowUpRight, ArrowDownRight, BarChart3 } from 'lucide-react';
import { reportsApi, type SeriesPoint } from '../reportsApi';

interface SalesPurchaseChartProps {
  accentColor?: string;
  /** The branch in view, or null for every branch the caller may see. */
  outletId?: string | null;
}

type Range = '1D' | '1W' | '1M' | '3M' | '1Y';

/** How far back each range reaches, and how the server should bucket it. */
const RANGES: Record<Range, { days: number; bucket: 'DAY' | 'WEEK' | 'MONTH' }> = {
  '1D': { days: 1, bucket: 'DAY' },
  '1W': { days: 7, bucket: 'DAY' },
  '1M': { days: 30, bucket: 'DAY' },
  '3M': { days: 90, bucket: 'WEEK' },
  '1Y': { days: 365, bucket: 'MONTH' },
};

export const SalesPurchaseChart: React.FC<SalesPurchaseChartProps> = ({ accentColor, outletId }) => {
  const [activeRange, setActiveRange] = useState<Range>('1M');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  /**
   * FR-RPT-04: takings and purchases, from the server.
   *
   * <p>This chart used to draw a fixed array from `mockData` — the same twelve
   * bars whatever the shop had done, on the owner's dashboard.
   */
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    const { days, bucket } = RANGES[activeRange];
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);

    setLoading(true);
    setFailed(false);
    reportsApi.series(bucket, { from, to, outletId })
      .then((series) => { if (current) setPoints(series); })
      .catch(() => { if (current) { setPoints([]); setFailed(true); } })
      .finally(() => { if (current) setLoading(false); });

    return () => { current = false; };
  }, [activeRange, outletId]);

  const ranges: Range[] = ['1D', '1W', '1M', '3M', '1Y'];

  /**
   * The axis is scaled to what the shop actually did.
   *
   * <p>A fixed 100K ceiling drew every real day as a sliver at the bottom, and
   * a day that beat it off the top of the chart.
   */
  const { maxVal, yTicks } = useMemo(() => {
    const largest = points.reduce(
      (most, point) => Math.max(most, Number(point.sales) + Number(point.purchases)), 0);
    // Round up to something a person reads off an axis.
    const step = Math.max(1, Math.ceil(largest / 4 / 1000) * 1000);
    const top = step * 4;
    return { maxVal: top, yTicks: [top, step * 3, step * 2, step] };
  }, [points]);

  const summary = useMemo(() => {
    const sales = points.reduce((sum, point) => sum + Number(point.sales), 0);
    const purchases = points.reduce((sum, point) => sum + Number(point.purchases), 0);
    const midpoint = Math.floor(points.length / 2);
    const previous = points.slice(0, midpoint).reduce((sum, point) => sum + Number(point.sales), 0);
    const recent = points.slice(midpoint).reduce((sum, point) => sum + Number(point.sales), 0);
    const change = previous > 0 ? ((recent - previous) / previous) * 100 : null;
    return { sales, purchases, change };
  }, [points]);

  const formatCompactMoney = (value: number) => `GH₵ ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-300 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between h-full">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-2xs"
            style={{
              backgroundColor: 'var(--accent-50, #fff7ed)',
              color: 'var(--accent, #c55200)',
              borderColor: 'var(--accent-200, #fed7aa)',
            }}
          >
            <BarChart3 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <span>Sales &amp; Procurement Velocity</span>
              {summary.change !== null && Number.isFinite(summary.change) && (
                <span className={`text-[10px] ${summary.change >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'} font-bold px-2 py-0.5 rounded-full border flex items-center gap-1`}>
                  {summary.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />} {summary.change >= 0 ? '+' : ''}{summary.change.toFixed(1)}%
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              Daily revenue generated vs inventory purchased (GH₵ in Thousands)
            </p>
          </div>
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl self-start sm:self-auto border border-slate-300">
          {ranges.map((range) => (
            <button
              key={range}
              onClick={() => setActiveRange(range)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeRange === range
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              style={
                activeRange === range
                  ? { backgroundColor: accentColor || 'var(--accent, #c55200)' }
                  : undefined
              }
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-header Legend */}
      <div className="flex flex-wrap items-center gap-2 py-3">
        <div className="flex min-w-0 items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: accentColor || 'var(--chart-1, #c55200)' }}
          ></span>
          <span className="text-xs text-slate-500 font-medium">Total POS Sales</span>
          <span className="text-xs font-black text-slate-900 ml-1 font-mono shrink-0">{formatCompactMoney(summary.sales)}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: 'var(--chart-2, #0f766e)' }}
          ></span>
          <span className="text-xs text-slate-500 font-medium">Goods Received (GRN)</span>
          <span className="text-xs font-black text-slate-900 ml-1 font-mono shrink-0">{formatCompactMoney(summary.purchases)}</span>
        </div>
      </div>

      {/* Stacked Bar Chart Graphic */}
      <div className="relative pt-4 pb-2 flex-1 min-h-[220px]">
        {/* Y Axis Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-7">
          {yTicks.map((tick) => (
            <div key={tick} className="flex items-center w-full">
              <span className="text-[10px] font-mono font-bold text-slate-400 w-10 text-right pr-2">
                {tick >= 1000 ? `${Math.round(tick / 1000)}K` : tick}
              </span>
              <div className="flex-1 border-b border-dashed border-slate-300"></div>
            </div>
          ))}
        </div>

        {/* Nothing to draw is said, not drawn as a flat line at zero. */}
        {!loading && points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-400">
            {failed ? 'This chart could not be loaded.' : 'No trade recorded in this period yet.'}
          </div>
        )}

        {/* Bars Container */}
        <div className="ml-10 h-full flex items-end justify-between px-2 pt-2 pb-7 relative">
          {points.map((item, idx) => {
            const sales = Number(item.sales);
            const purchases = Number(item.purchases);
            const total = sales + purchases;
            const totalHeightPct = maxVal > 0 ? (total / maxVal) * 100 : 0;
            // A bucket with no trade is a gap on the axis, not a divide by zero.
            const salesHeightPct = total > 0 ? (sales / total) * 100 : 0;
            const purchaseHeightPct = 100 - salesHeightPct;
            const isHovered = hoveredIndex === idx;

            return (
              <div
                key={item.bucket}
                className="flex flex-col items-center flex-1 h-full justify-end group cursor-pointer relative"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Tooltip on hover */}
                {isHovered && (
                  <div className="absolute -top-14 z-30 bg-slate-900 text-white text-[11px] rounded-xl p-2 shadow-2xl pointer-events-none whitespace-nowrap border border-slate-700 animate-in fade-in zoom-in-95">
                    <div
                      className="font-bold mb-0.5"
                      style={{ color: 'var(--accent, #c55200)' }}
                    >
                      {item.bucket}
                    </div>
                    <div className="text-[10px] space-y-0.5">
                      <div className="flex justify-between gap-3 text-slate-300">
                        <span>Sales:</span>
                        <strong className="text-white">GH₵ {sales.toFixed(2)}</strong>
                      </div>
                      <div className="flex justify-between gap-3 text-slate-300">
                        <span>Purchase:</span>
                        <strong className="text-white">GH₵ {purchases.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stacked Bar */}
                <div
                  className={`w-4 sm:w-6 md:w-7 flex flex-col overflow-hidden rounded-t-lg transition-all duration-200 ${
                    isHovered ? 'scale-105 shadow-md filter brightness-110' : ''
                  }`}
                  style={{ height: `${totalHeightPct}%` }}
                >
                  {/* Top segment: Purchase (Deep Teal --chart-2) */}
                  <div
                    className="w-full"
                    style={{
                      height: `${purchaseHeightPct}%`,
                      backgroundColor: 'var(--chart-2, #0f766e)',
                    }}
                  ></div>
                  {/* Bottom segment: Sales (Primary Accent --chart-1) */}
                  <div
                    className="w-full"
                    style={{
                      height: `${salesHeightPct}%`,
                      backgroundColor: accentColor || 'var(--chart-1, #c55200)',
                    }}
                  ></div>
                </div>

                {/* X Axis Label */}
                <span className="absolute -bottom-6 text-[10px] font-mono font-semibold text-slate-400 whitespace-nowrap">
                  {/* Only the day, or the axis is unreadable at thirty bars. */}
                  {item.bucket.length > 7 ? item.bucket.slice(-2) : item.bucket.slice(-5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
