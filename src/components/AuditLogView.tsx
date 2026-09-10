import React, { useMemo, useState } from 'react';
import { ShieldCheck, Search, X } from 'lucide-react';
import { AuditLogEntry } from '../types';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [outletFilter, setOutletFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const actions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))), [logs]);
  const outlets = useMemo(() => Array.from(new Set(logs.map((log) => log.outletName))), [logs]);

  const filteredLogs = logs.filter(
    (l) =>
      (actionFilter === 'ALL' || l.action === actionFilter) &&
      (outletFilter === 'ALL' || l.outletName === outletFilter) &&
      l.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.entity.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Security & Audit Trail</h1>
          <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
            Immutable Log
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Immutable event log tracking manager overrides, price adjustments, voids, and shift reconciliations.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-300 shadow-xs flex flex-col lg:flex-row gap-3 items-center justify-between">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search actor, action, or details..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-orange-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-700"><option value="ALL">All actions</option>{actions.map((action) => <option key={action} value={action}>{action}</option>)}</select>
          <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-700"><option value="ALL">All outlets</option>{outlets.map((outlet) => <option key={outlet} value={outlet}>{outlet}</option>)}</select>
          <span className="text-xs text-slate-500 font-bold">{filteredLogs.length} events</span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-300">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">Outlet</th>
                <th className="py-3 px-4">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLogs.map((log) => (
                <tr key={log.id} onClick={() => setSelectedLog(log)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                  <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">{log.actor}</td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-700">{log.entity}</td>
                  <td className="py-3 px-4 text-slate-600">{log.outletName}</td>
                  <td className="py-3 px-4 text-slate-700 max-w-md">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedLog && <div className="fixed inset-0 z-50 bg-slate-950/40 p-4 flex items-center justify-center" onClick={() => setSelectedLog(null)}><div className="w-full max-w-xl rounded-xl border border-slate-300 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wider text-orange-300">Read-only audit entry</p><h2 className="mt-1 text-sm font-black">{selectedLog.action}</h2></div><button onClick={() => setSelectedLog(null)} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10" aria-label="Close audit detail"><X className="w-4 h-4" /></button></div><div className="grid grid-cols-2 gap-4 p-5 text-xs"><div><p className="text-slate-500">Actor</p><p className="mt-1 font-bold text-slate-900">{selectedLog.actor}</p></div><div><p className="text-slate-500">Timestamp</p><p className="mt-1 font-bold text-slate-900">{selectedLog.timestamp}</p></div><div><p className="text-slate-500">Entity</p><p className="mt-1 font-bold text-slate-900">{selectedLog.entity}</p></div><div><p className="text-slate-500">Outlet</p><p className="mt-1 font-bold text-slate-900">{selectedLog.outletName}</p></div><div className="col-span-2 rounded-lg bg-slate-50 p-4"><p className="text-slate-500">Recorded details</p><p className="mt-2 leading-5 text-slate-700">{selectedLog.details}</p></div></div></div></div>}
    </div>
  );
};
