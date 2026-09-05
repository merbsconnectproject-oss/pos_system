import React from 'react';
import { Store, TrendingUp, DollarSign, ShoppingBag, AlertTriangle, Wallet, Layers } from 'lucide-react';
import { Outlet, Product, CompletedSale } from '../types';

interface OutletComparisonViewProps {
  outlets: Outlet[];
  products: Product[];
  sales: CompletedSale[];
}

export const OutletComparisonView: React.FC<OutletComparisonViewProps> = ({
  outlets,
  products,
  sales,
}) => {
  const incoSales = sales.filter((s) => s.outletId === 'inco-hardware' && s.status === 'COMPLETED');
  const apexSales = sales.filter((s) => s.outletId === 'apex-electricals' && s.status === 'COMPLETED');

  const incoTotal = incoSales.reduce((sum, s) => sum + s.total, 0) + 32450.00;
  const apexTotal = apexSales.reduce((sum, s) => sum + s.total, 0) + 16538.00;

  const incoValuation = products.reduce(
    (sum, p) => sum + (p.stock['inco-hardware'] || 0) * (p.costPrice['inco-hardware'] || 0),
    0
  );
  const apexValuation = products.reduce(
    (sum, p) => sum + (p.stock['apex-electricals'] || 0) * (p.costPrice['apex-electricals'] || 0),
    0
  );

  const incoLowStock = products.filter(
    (p) => (p.stock['inco-hardware'] || 0) <= (p.minStockAlert['inco-hardware'] || 10)
  ).length;

  const apexLowStock = products.filter(
    (p) => (p.stock['apex-electricals'] || 0) <= (p.minStockAlert['apex-electricals'] || 10)
  ).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            Multi-Outlet Comparison
          </h1>
          <span className="bg-orange-100 text-orange-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
            PRD Screen I-19 • FR-RPT-08
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Side-by-side operational and financial comparison between Inco Hardware and Apex Electricals.
        </p>
      </div>

      {/* Side-by-Side Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outlet 1: Inco Hardware */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-orange-500 to-amber-500 text-white flex justify-between items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                Outlet 1 • Koforidua
              </span>
              <h2 className="text-xl font-black mt-1">Inco Hardware</h2>
              <p className="text-xs text-orange-100">12 Main Street • Prefix: INC-01</p>
            </div>
            <Store className="w-8 h-8 text-white/80" />
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[11px] font-semibold">Total Revenue:</span>
                <strong className="text-lg font-black text-slate-900 block mt-0.5">
                  GH₵ {incoTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </strong>
                <span className="text-emerald-600 text-[10px] font-bold">▲ +24% vs last week</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[11px] font-semibold">Average Basket:</span>
                <strong className="text-lg font-black text-slate-900 block mt-0.5">
                  GH₵ 342.50
                </strong>
                <span className="text-slate-500 text-[10px]">Trade contractor mix</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[11px] font-semibold">Stock Valuation:</span>
                <strong className="text-lg font-black text-slate-900 block mt-0.5">
                  GH₵ {incoValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </strong>
                <span className="text-slate-500 text-[10px]">Weighted average cost</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[11px] font-semibold">Low Stock Items:</span>
                <strong className="text-lg font-black text-red-600 block mt-0.5">
                  {incoLowStock} Products
                </strong>
                <span className="text-red-500 text-[10px]">Immediate PO needed</span>
              </div>
            </div>

            <div className="p-3.5 bg-orange-50/70 border border-orange-200 rounded-xl text-xs space-y-1">
              <span className="font-bold text-orange-900 block">Top Revenue Driver</span>
              <p className="text-slate-700">
                2.5mm Twin & Earth Cable accounts for 41% of daily volume, supplied by Nexans Ghana.
              </p>
            </div>
          </div>
        </div>

        {/* Outlet 2: Apex Electricals */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900 text-white flex justify-between items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                Outlet 2 • Kumasi
              </span>
              <h2 className="text-xl font-black mt-1">Apex Electricals</h2>
              <p className="text-xs text-slate-300">Harper Road • Prefix: APX-01</p>
            </div>
            <Store className="w-8 h-8 text-white/80" />
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[11px] font-semibold">Total Revenue:</span>
                <strong className="text-lg font-black text-slate-900 block mt-0.5">
                  GH₵ {apexTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </strong>
                <span className="text-emerald-600 text-[10px] font-bold">▲ +18% vs last week</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[11px] font-semibold">Average Basket:</span>
                <strong className="text-lg font-black text-slate-900 block mt-0.5">
                  GH₵ 215.80
                </strong>
                <span className="text-slate-500 text-[10px]">High retail footfall</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[11px] font-semibold">Stock Valuation:</span>
                <strong className="text-lg font-black text-slate-900 block mt-0.5">
                  GH₵ {apexValuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </strong>
                <span className="text-slate-500 text-[10px]">Weighted average cost</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-slate-400 block text-[11px] font-semibold">Low Stock Items:</span>
                <strong className="text-lg font-black text-amber-600 block mt-0.5">
                  {apexLowStock} Products
                </strong>
                <span className="text-amber-600 text-[10px]">Stock buffer healthy</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-xs space-y-1">
              <span className="font-bold text-slate-800 block">Top Revenue Driver</span>
              <p className="text-slate-700">
                PVC Conduit 20mm & 13A Single Sockets lead unit velocity in Kumasi trade branch.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
