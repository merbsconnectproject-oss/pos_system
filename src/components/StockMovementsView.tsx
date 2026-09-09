import React, { useState } from 'react';
import { Layers, Search, Filter, ArrowDownRight, ArrowUpRight, AlertCircle, FileText } from 'lucide-react';
import { StockMovement, Outlet } from '../types';

interface StockMovementsViewProps {
  movements: StockMovement[];
  currentOutlet: Outlet;
  outlets: Outlet[];
}

export const StockMovementsView: React.FC<StockMovementsViewProps> = ({
  movements,
  currentOutlet,
  outlets: _outlets,
}) => {
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filtered = movements.filter((m) => {
    const matchesOutlet =
      currentOutlet.id === 'all-outlets' || m.outletId === currentOutlet.id;
    const matchesType = typeFilter === 'ALL' || m.type === typeFilter;
    const matchesSearch =
      m.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.referenceNumber && m.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.reason && m.reason.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesOutlet && matchesType && matchesSearch;
  });

  const getTypeBadge = (type: StockMovement['type']) => {
    switch (type) {
      case 'RECEIPT':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
            <ArrowUpRight className="w-3 h-3" /> RECEIPT
          </span>
        );
      case 'SALE':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
            <ArrowDownRight className="w-3 h-3" /> SALE
          </span>
        );
      case 'SALE_VOID':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
            <ArrowUpRight className="w-3 h-3" /> SALE VOID
          </span>
        );
      case 'DAMAGE':
        return (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
            <AlertCircle className="w-3 h-3" /> DAMAGE
          </span>
        );
      case 'ADJUSTMENT_IN':
        return (
          <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
            ADJ (+)
          </span>
        );
      case 'ADJUSTMENT_OUT':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
            ADJ (-)
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Stock Movements Log</h1>
            <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
              Immutable Audit Trail
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Every inventory change is recorded as an immutable ledger movement.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-300 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search product, ref #, or reason..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-orange-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500">Filter Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
          >
            <option value="ALL">All Movement Types</option>
            <option value="RECEIPT">RECEIPT (Goods In)</option>
            <option value="SALE">SALE (Customer Out)</option>
            <option value="SALE_VOID">SALE_VOID (Reversed Sale)</option>
            <option value="DAMAGE">DAMAGE (Broken / Defective)</option>
            <option value="ADJUSTMENT_IN">ADJUSTMENT_IN</option>
            <option value="ADJUSTMENT_OUT">ADJUSTMENT_OUT</option>
          </select>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-300">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Outlet</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Qty Changed</th>
                <th className="py-3 px-4 text-right">Balance (Before → After)</th>
                <th className="py-3 px-4">Reference / Receipt</th>
                <th className="py-3 px-4">Reason / Notes</th>
                <th className="py-3 px-4">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No stock movements found matching filters.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">{m.timestamp}</td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {m.outletId === 'inco-hardware' ? 'Inco Hardware' : 'Apex Electricals'}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">{m.productName}</td>
                    <td className="py-3 px-4">{getTypeBadge(m.type)}</td>
                    <td
                      className={`py-3 px-4 text-right font-black ${
                        m.quantity > 0 ? 'text-emerald-600' : 'text-slate-800'
                      }`}
                    >
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {m.previousStock} → <strong className="text-slate-900">{m.newStock}</strong>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">{m.referenceNumber || '—'}</td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{m.reason || '—'}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{m.user}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
