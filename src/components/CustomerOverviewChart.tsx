import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ArrowUpRight, Users, ShieldCheck } from 'lucide-react';
import { reportsApi, type ReportRow } from '../reportsApi';

interface CustomerOverviewChartProps {
  accentColor?: string;
  /** The branch in view, or null for every branch the caller may see. */
  outletId?: string | null;
  /** FR-RPT-05: the breakdown needs `report.view`; without it there is nothing to draw. */
  canViewReports?: boolean;
}

const LABELS: Record<string, string> = {
  electrician: 'Electricians (Trade)',
  contractor: 'Contractors',
  company: 'Companies',
  retail: 'Retail',
  'walk-in': 'Walk-ins',
};

export const CustomerOverviewChart: React.FC<CustomerOverviewChartProps> = ({
  accentColor, outletId, canViewReports = true,
}) => {
  const [filter, setFilter] = useState<'Today' | 'This Week' | 'This Month'>('Today');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const primaryColor = accentColor || 'var(--chart-1, #c55200)';
  const secondaryColor = 'var(--chart-2, #0f766e)';
  const tertiaryColor = 'var(--chart-4, #7c3f8f)';

  /**
   * FR-CUST-04 · FR-RPT-04: takings by the kind of customer, from the server.
   *
   * <p>These three rows used to be literals — 45% electricians, GH₵ 22.5K, 184
   * of them — on the owner's dashboard, whatever the shop had actually sold.
   */
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewReports) { setRows([]); setLoading(false); return; }

    let current = true;
    const to = new Date();
    const days = filter === 'Today' ? 1 : filter === 'This Week' ? 7 : 30;
    const from = new Date(to.getTime() - days * 86400000);

    setLoading(true);
    reportsApi.breakdown('customer_type', { from, to, outletId })
      .then((result) => { if (current) setRows(result); })
      .catch(() => { if (current) setRows([]); })
      .finally(() => { if (current) setLoading(false); });

    return () => { current = false; };
  }, [filter, outletId, canViewReports]);

  const palette = [primaryColor, secondaryColor, tertiaryColor];

  const { segments, receipts } = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + Number(row.revenue), 0);
    const count = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
    return {
      receipts: count,
      segments: rows.map((row, index) => ({
        label: LABELS[row.key] || row.name,
        // No takings is 0%, not a division by zero drawn as a full ring.
        pct: total > 0 ? Math.round((Number(row.revenue) / total) * 100) : 0,
        color: palette[index % palette.length],
        amount: `GH₵ ${Number(row.revenue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        count: Number(row.quantity),
      })),
    };
  }, [rows, primaryColor, secondaryColor, tertiaryColor]);

  // The donut's two rings, drawn from the real shares rather than from
  // offsets somebody worked out once by hand.
  const OUTER = 2 * Math.PI * 38;
  const INNER = 2 * Math.PI * 25;
  const outer = segments[0]?.pct ?? 0;
  const inner = segments[1]?.pct ?? 0;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-300 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-accent-500" />
            <span>Customer Demographics</span>
          </h3>
          <p className="text-[11px] text-slate-400 font-medium">Trade vs Retail revenue mix</p>
        </div>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            {filter}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-300 rounded-xl shadow-xl z-20 py-1 text-xs font-medium text-slate-700 animate-in fade-in zoom-in-95">
              {(['Today', 'This Week', 'This Month'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setFilter(t);
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-accent-50 hover:text-accent-600 font-bold"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Donut and metrics */}
      <div className="flex flex-col sm:flex-row items-center justify-between py-4 gap-6">
        {/* Dual Ring Donut */}
        <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background circle track */}
            <circle
              cx="50"
              cy="50"
              r="38"
              className="text-slate-100"
              strokeWidth="9"
              stroke="currentColor"
              fill="transparent"
            />
            {/* The largest share, on the outer ring. */}
            <circle
              cx="50"
              cy="50"
              r="38"
              stroke={primaryColor}
              strokeWidth={hoveredSegment === segments[0]?.label ? '11' : '9'}
              strokeDasharray={OUTER}
              strokeDashoffset={OUTER * (1 - outer / 100)}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-300 cursor-pointer"
              onMouseEnter={() => setHoveredSegment(segments[0]?.label ?? null)}
              onMouseLeave={() => setHoveredSegment(null)}
            />

            {/* Inner track */}
            <circle
              cx="50"
              cy="50"
              r="25"
              className="text-slate-100"
              strokeWidth="7"
              stroke="currentColor"
              fill="transparent"
            />
            {/* The second share, on the inner ring. */}
            <circle
              cx="50"
              cy="50"
              r="25"
              stroke={secondaryColor}
              strokeWidth={hoveredSegment === segments[1]?.label ? '9' : '7'}
              strokeDasharray={INNER}
              strokeDashoffset={INNER * (1 - inner / 100)}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-300 cursor-pointer"
              onMouseEnter={() => setHoveredSegment(segments[1]?.label ?? null)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xs font-black text-slate-800">{receipts}</span>
            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Receipts</span>
          </div>
        </div>

        {/* Legend & Breakdown stats */}
        <div className="flex flex-col gap-2.5 flex-1 w-full">
          {!loading && segments.length === 0 && (
            <div className="py-6 text-center text-xs font-semibold text-slate-400">
              {canViewReports
                ? 'No sales in this period yet.'
                : 'Customer figures need the reporting permission.'}
            </div>
          )}
          {segments.map((s) => (
            <div
              key={s.label}
              onMouseEnter={() => setHoveredSegment(s.label)}
              onMouseLeave={() => setHoveredSegment(null)}
              className={`p-2 rounded-xl transition-all cursor-pointer border ${
                hoveredSegment === s.label
                  ? 'bg-slate-50 border-slate-300 shadow-2xs'
                  : 'border-transparent hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  ></span>
                  <span className="font-bold text-slate-700">{s.label}</span>
                </div>
                <span className="font-black text-slate-900 font-mono">{s.amount}</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                <span>{s.count} registered accounts</span>
                <span className="font-semibold text-slate-600">{s.pct}% of total</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Banner */}
      <div className="mt-2 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Auto-Trade Price Rule (FR-CUST-04)</span>
        </span>
        <span className="font-bold text-emerald-600">Active</span>
      </div>
    </div>
  );
};
