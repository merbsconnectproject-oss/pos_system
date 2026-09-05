import React, { useState } from 'react';
import { ShoppingCart, TrendingUp, ArrowUpRight, BarChart3 } from 'lucide-react';
import { SALES_PURCHASE_DATA } from '../mockData';

interface SalesPurchaseChartProps {
  accentColor?: string;
}

export const SalesPurchaseChart: React.FC<SalesPurchaseChartProps> = () => {
  const [activeRange, setActiveRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1M');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const ranges: Array<'1D' | '1W' | '1M' | '3M' | '1Y'> = ['1D', '1W', '1M', '3M', '1Y'];
  const maxVal = 100;
  const yTicks = [100, 75, 50, 25, 0];

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between h-full">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 border border-orange-100">
            <BarChart3 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <span>Sales &amp; Procurement Velocity</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> +18.4%
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              Daily revenue generated vs inventory purchased (GH₵ in Thousands)
            </p>
          </div>
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl self-start sm:self-auto border border-slate-200/60">
          {ranges.map((range) => (
            <button
              key={range}
              onClick={() => setActiveRange(range)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeRange === range
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-header Legend */}
      <div className="flex items-center gap-3 py-3">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
          <span className="text-xs text-slate-500 font-medium">Total POS Sales</span>
          <span className="text-xs font-black text-slate-900 ml-1 font-mono">GH₵ 48.9K</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-200"></span>
          <span className="text-xs text-slate-500 font-medium">Goods Received (GRN)</span>
          <span className="text-xs font-black text-slate-900 ml-1 font-mono">GH₵ 24.1K</span>
        </div>
      </div>

      {/* Stacked Bar Chart Graphic */}
      <div className="relative pt-4 pb-2 flex-1 min-h-[220px]">
        {/* Y Axis Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-7">
          {yTicks.map((tick) => (
            <div key={tick} className="flex items-center w-full">
              <span className="text-[10px] font-mono font-bold text-slate-400 w-10 text-right pr-2">
                {tick}K
              </span>
              <div className="flex-1 border-b border-dashed border-slate-200/90"></div>
            </div>
          ))}
        </div>

        {/* Bars Container */}
        <div className="ml-10 h-full flex items-end justify-between px-2 pt-2 pb-7 relative">
          {SALES_PURCHASE_DATA.map((item, idx) => {
            const totalHeightPct = (item.total / maxVal) * 100;
            const salesHeightPct = (item.sales / item.total) * 100;
            const purchaseHeightPct = 100 - salesHeightPct;
            const isHovered = hoveredIndex === idx;

            return (
              <div
                key={item.time}
                className="flex flex-col items-center flex-1 h-full justify-end group cursor-pointer relative"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Tooltip on hover */}
                {isHovered && (
                  <div className="absolute -top-14 z-30 bg-slate-900 text-white text-[11px] rounded-xl p-2 shadow-2xl pointer-events-none whitespace-nowrap border border-slate-700 animate-in fade-in zoom-in-95">
                    <div className="font-bold text-orange-400 mb-0.5">{item.time} September</div>
                    <div className="text-[10px] space-y-0.5">
                      <div className="flex justify-between gap-3 text-slate-300">
                        <span>Sales:</span>
                        <strong className="text-white">GH₵ {item.sales * 1000}</strong>
                      </div>
                      <div className="flex justify-between gap-3 text-slate-300">
                        <span>Purchase:</span>
                        <strong className="text-white">GH₵ {item.purchase * 1000}</strong>
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
                  {/* Top segment: Purchase */}
                  <div
                    className="w-full bg-orange-200"
                    style={{ height: `${purchaseHeightPct}%` }}
                  ></div>
                  {/* Bottom segment: Sales */}
                  <div
                    className="w-full bg-orange-500"
                    style={{ height: `${salesHeightPct}%` }}
                  ></div>
                </div>

                {/* X Axis Label */}
                <span className="absolute -bottom-6 text-[10px] font-mono font-semibold text-slate-400 whitespace-nowrap">
                  {item.time}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
