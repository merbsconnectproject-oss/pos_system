import React, { useMemo, useState } from 'react';
import { InfoHint } from './InfoHint';
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarDays, CheckCircle2, ClipboardList, EyeOff, Plus, Printer, Wallet } from 'lucide-react';
import { CashMovement, CashMovementReason, CompletedSale, Outlet, ShiftInfo, ShiftRecord } from '../types';
import { TablePagination } from './TablePagination';

type CashTab = 'shifts' | 'end-of-day' | 'movements';

interface CashControlViewProps {
  shiftInfo: ShiftInfo;
  sales: CompletedSale[];
  cashMovements: CashMovement[];
  shiftRecords: ShiftRecord[];
  currentOutlet: Outlet;
  outlets: Outlet[];
  onOpenShift: () => void;
  /**
   * Resolves when the shift is closed and rejects with the server's reason —
   * most often that the variance needs a note (BR-14). The screen keeps the
   * count until this resolves.
   */
  onCloseShift: (countedCash: number, note?: string) => Promise<void> | void;
  onAddMovement: (movement: CashMovement) => void;
}

import { formatMoney as money, roundMoney } from '../money';

export const CashControlView: React.FC<CashControlViewProps> = ({ shiftInfo, sales, cashMovements, shiftRecords, currentOutlet, outlets, onOpenShift, onCloseShift, onAddMovement }) => {
  const [tab, setTab] = useState<CashTab>('shifts');
  const [outlet, setOutlet] = useState('all');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [movementOpen, setMovementOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ShiftRecord | null>(null);
  const [movementDirection, setMovementDirection] = useState<'in' | 'out'>('out');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState<CashMovementReason>('Banking');
  const [movementNote, setMovementNote] = useState('');
  const [shiftPage, setShiftPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // H-01: all shifts, newest first, scoped to the chosen outlet.
  const scopedShifts = useMemo(
    () =>
      shiftRecords
        .filter((record) => outlet === 'all' || record.outletId === outlet)
        .slice()
        .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)),
    [shiftRecords, outlet],
  );
  const scopedCashMovements = useMemo(() => cashMovements.filter((item) => outlet === 'all' || item.outletId === outlet), [cashMovements, outlet]);
  const visibleShifts = scopedShifts.slice((shiftPage - 1) * pageSize, shiftPage * pageSize);
  const visibleCashMovements = scopedCashMovements.slice((movementPage - 1) * pageSize, movementPage * pageSize);
  const scopedSales = useMemo(() => sales.filter((sale) => sale.status !== 'VOIDED' && (outlet === 'all' || sale.outletId === outlet)), [sales, outlet]);
  const cashSales = scopedSales.reduce((sum, sale) => sum + sale.payments.filter((payment) => payment.method === 'cash').reduce((total, payment) => total + payment.amount, 0), 0);
  const methodTotals = ['cash', 'momo', 'card', 'transfer'].map((method) => ({ method, total: scopedSales.reduce((sum, sale) => sum + sale.payments.filter((payment) => payment.method === method).reduce((total, payment) => total + payment.amount, 0), 0) }));
  /**
   * BR-13/BR-14: submit the drawer count, and keep it until the server takes it.
   *
   * The count used to be cleared the moment it was submitted. When the server
   * refused — which it does when the variance passes the threshold and no note
   * explains it — the cashier's figure was already gone, and a *blind* count is
   * precisely the one they cannot reconstruct: they never saw what was expected
   * and may not remember what they typed. So nothing is cleared until it lands,
   * and the server's reason is shown beside the note it is asking for.
   */
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const closeOut = async () => {
    const value = Number(counted);
    if (!Number.isFinite(value) || value < 0) {
      setCloseError('Enter the counted cash before closing the shift.');
      return;
    }

    setClosing(true);
    setCloseError(null);
    try {
      await onCloseShift(value, note.trim() || undefined);
      setCounted('');
      setNote('');
    } catch (failure) {
      setCloseError(failure instanceof Error ? failure.message
              : 'The shift could not be closed. Check the count and try again.');
    } finally {
      setClosing(false);
    }
  };
  const recordMovement = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(movementAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !movementNote.trim()) return;
    // PRD §7.4: a drawer movement belongs to the shift, never to the stock ledger.
    onAddMovement({
      id: `cash-${Date.now()}`,
      shiftId: shiftInfo.id,
      outletId: currentOutlet.id,
      direction: movementDirection,
      amount: roundMoney(amount),
      reasonCode: movementReason,
      note: movementNote.trim(),
      createdBy: shiftInfo.cashier,
      createdAt: new Date().toLocaleString('en-GB'),
    });
    setMovementAmount('');
    setMovementNote('');
    setMovementOpen(false);
  };
  const tabs: Array<[CashTab, string]> = [['shifts', 'Shift list'], ['end-of-day', 'End of day'], ['movements', 'Cash movements']];

  return <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5 animate-fade-in">
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
      <div><p className="text-[11px] font-bold uppercase tracking-wider text-accent-600">Cash control</p><div className="flex items-center gap-2"><h1 className="text-2xl font-black text-slate-900">Shifts &amp; cash</h1><InfoHint text="Reconcile drawers, review cash movements, and close the trading day." /></div></div>
      <div className="flex gap-2"><select value={outlet} onChange={(e) => setOutlet(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><option value="all">All outlets</option>{outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={onOpenShift} className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-2 text-xs font-bold text-white"><Plus className="w-4 h-4" /> Open shift</button></div>
    </header>
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold ${tab === key ? 'border-accent-600 text-accent-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</nav>

    {tab === 'shifts' && <section className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">Current drawer</p><p className="mt-2 text-xl font-black text-slate-900">{shiftInfo.isOpen ? 'Open' : 'Closed'}</p><p className="text-xs text-slate-500">{currentOutlet.name} · Terminal {shiftInfo.terminalId}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">Expected cash</p><p className="mt-2 text-xl font-black text-slate-900">{money(shiftInfo.expectedCash)}</p><p className="text-xs text-slate-500">Opening float {money(shiftInfo.openingFloat)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">Cash sales</p><p className="mt-2 text-xl font-black text-slate-900">{money(cashSales)}</p><p className="text-xs text-slate-500">{scopedSales.length} completed sales</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-500">Shifts recorded</p><p className="mt-2 text-xl font-black text-slate-900">{scopedShifts.length}</p><p className="text-xs text-slate-500">{scopedShifts.filter((item) => item.status === 'open').length} still open</p></div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h2 className="text-sm font-black text-slate-900">Recorded shifts</h2>
            <p className="text-xs text-slate-500">Variance is revealed only after a blind count is submitted (BR-14).</p>
          </div>
          <ClipboardList className="w-5 h-5 text-slate-400" />
        </div>
        {scopedShifts.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">No shifts recorded</p>
            <p className="mt-1 text-xs text-slate-500">Open a drawer to start the first shift.</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Outlet / cashier</th>
                  <th className="px-4 py-3">Opened</th>
                  <th className="px-4 py-3">Closed</th>
                  <th className="px-4 py-3 text-right">Sales</th>
                  <th className="px-4 py-3 text-right">Expected</th>
                  <th className="px-4 py-3 text-right">Counted</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleShifts.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedShift(record)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {record.outletName}
                      <span className="block font-normal text-slate-500">{record.cashier} · Terminal {record.terminalId}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{record.openedAt}</td>
                    <td className="px-4 py-3 text-slate-600">{record.closedAt || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(record.salesTotal)}</td>
                    <td className="px-4 py-3 text-right">{record.status === 'open' ? '—' : money(record.expectedCash)}</td>
                    <td className="px-4 py-3 text-right">{record.countedCash === undefined ? '—' : money(record.countedCash)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${record.variance === undefined ? 'text-slate-400' : record.variance < 0 ? 'text-rose-600' : record.variance > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                      {record.variance === undefined ? 'Pending' : `${record.variance > 0 ? '+' : ''}${money(record.variance)}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${record.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {record.status === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={shiftPage} pageSize={pageSize} total={scopedShifts.length} onPageChange={setShiftPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </div>
    </section>}

    {tab === 'end-of-day' && <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5"><div className="space-y-4"><div className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-slate-900">Daily reconciliation</h2><p className="text-xs text-slate-500 mt-1">{outlet === 'all' ? 'All outlets' : outlets.find((item) => item.id === outlet)?.name} · today</p></div><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><Printer className="w-4 h-4" /> Print</button></div><div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">{methodTotals.map((item) => <div key={item.method} className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">{item.method}</p><p className="mt-1 text-sm font-black text-slate-900">{money(item.total)}</p></div>)}</div></div><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-black text-slate-900">Close-out status</h2><div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 p-4"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><div><p className="text-xs font-bold text-slate-800">Non-cash takings are ready for reconciliation</p><p className="text-xs text-slate-500">Cash expected is kept separate from card, MoMo, and transfer totals.</p></div></div></div></div><div className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><EyeOff className="w-4 h-4 text-accent-600" /><h2 className="text-sm font-black text-slate-900">Blind cash count</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">Expected cash stays hidden until you submit the physical drawer count.</p>{shiftInfo.isOpen ? <div className="mt-5 space-y-3"><input value={counted} onChange={(e) => setCounted(e.target.value)} type="number" min="0" placeholder="Enter counted cash" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Variance note, if required" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs" /><button onClick={() => void closeOut()} disabled={closing} className="w-full rounded-lg bg-slate-900 hover:bg-black disabled:opacity-50 px-3 py-2.5 text-xs font-bold text-white cursor-pointer">{closing ? 'Closing…' : 'Submit count & close shift'}</button>{closeError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{closeError}</p>}</div> : <div className="mt-5 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-600">Shift already closed. Corrections must be recorded as a cash movement.</div>}</div></section>}

    {tab === 'movements' && <section className="rounded-xl border border-slate-200 bg-white overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-sm font-black text-slate-900">Cash movement list</h2><p className="text-xs text-slate-500">Drawer movements linked to outlet activity.</p></div><button onClick={() => setMovementOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-3 py-2 text-xs font-bold text-white"><Plus className="w-4 h-4" /> Record movement</button></div>{scopedCashMovements.length === 0 ? <div className="p-12 text-center"><Wallet className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No cash movements recorded</p><p className="mt-1 text-xs text-slate-500">Banking, payouts and float transfers will appear here.</p></div> : <><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Outlet</th><th className="px-4 py-3">Direction</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Reason / user</th></tr></thead><tbody>{visibleCashMovements.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 text-slate-600">{item.createdAt}</td><td className="px-4 py-3 font-semibold text-slate-800">{outlets.find((outletItem) => outletItem.id === item.outletId)?.name || item.outletId}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 font-bold ${item.direction === 'in' ? 'text-emerald-700' : 'text-rose-600'}`}>{item.direction === 'in' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}{item.direction === 'in' ? 'In' : 'Out'}</span></td><td className="px-4 py-3 font-bold">{money(item.amount)}</td><td className="px-4 py-3 text-slate-600">{item.reasonCode}{item.note ? `: ${item.note}` : ''}<span className="block text-[10px] text-slate-400">{item.createdBy}</span></td></tr>)}</tbody></table></div><TablePagination page={movementPage} pageSize={pageSize} total={scopedCashMovements.length} onPageChange={setMovementPage} onPageSizeChange={setPageSize} /></>}{movementOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={recordMovement} className="w-full max-w-md rounded-xl border border-slate-300 bg-white shadow-xl"><div className="flex items-center justify-between rounded-t-xl bg-slate-900 px-5 py-4 text-white"><h2 className="text-sm font-black">Record cash movement</h2><button type="button" onClick={() => setMovementOpen(false)} className="text-xs text-slate-300">Close</button></div><div className="space-y-3 p-5"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setMovementDirection('in')} className={`rounded-lg border px-3 py-2 text-xs font-bold ${movementDirection === 'in' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600'}`}>Money in</button><button type="button" onClick={() => setMovementDirection('out')} className={`rounded-lg border px-3 py-2 text-xs font-bold ${movementDirection === 'out' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-300 text-slate-600'}`}>Money out</button></div><input required type="number" min="0.01" step="0.01" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} placeholder="Amount" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /><select value={movementReason} onChange={(event) => setMovementReason(event.target.value as CashMovementReason)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs"><option>Banking</option><option>Owner drawing</option><option>Supplier payment</option><option>Float transfer</option></select><textarea required value={movementNote} onChange={(event) => setMovementNote(event.target.value)} placeholder="Reason note" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs" /><button className="w-full rounded-lg bg-accent-600 px-3 py-2.5 text-xs font-bold text-white">Save movement</button></div></form></div>}</section>}
    {/* H-02: one shift in full */}
    {selectedShift && (
      <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={() => setSelectedShift(null)}>
        <div
          className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 flex items-start justify-between bg-slate-900 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-accent-300">Shift detail</p>
              <h2 className="mt-1 text-sm font-black">{selectedShift.outletName} · Terminal {selectedShift.terminalId}</h2>
              <p className="text-xs text-slate-300">{selectedShift.cashier}</p>
            </div>
            <button onClick={() => setSelectedShift(null)} className="text-xs font-bold text-slate-300 hover:text-white">
              Close
            </button>
          </div>

          <div className="space-y-5 p-5">
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Opened</p>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedShift.openedAt}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Closed</p>
                <p className="mt-1 text-xs font-bold text-slate-800">{selectedShift.closedAt || 'Still open'}</p>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-xs font-black text-slate-900">Close-out figures</h3>
              </div>
              <dl className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-500">Opening float</dt><dd className="font-bold text-slate-900">{money(selectedShift.openingFloat)}</dd></div>
                <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-500">Sales total</dt><dd className="font-bold text-slate-900">{money(selectedShift.salesTotal)}</dd></div>
                <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-500">Expected cash</dt><dd className="font-bold text-slate-900">{selectedShift.status === 'open' ? 'Hidden until count' : money(selectedShift.expectedCash)}</dd></div>
                <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-500">Counted cash</dt><dd className="font-bold text-slate-900">{selectedShift.countedCash === undefined ? '—' : money(selectedShift.countedCash)}</dd></div>
                <div className="flex justify-between px-4 py-2.5">
                  <dt className="text-slate-500">Variance</dt>
                  <dd className={`font-black ${selectedShift.variance === undefined ? 'text-slate-400' : selectedShift.variance < 0 ? 'text-rose-600' : selectedShift.variance > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {selectedShift.variance === undefined ? 'Pending' : `${selectedShift.variance > 0 ? '+' : ''}${money(selectedShift.variance)}`}
                  </dd>
                </div>
              </dl>
            </section>

            {/* FR-CASH-07: non-cash takings listed by method for reconciliation */}
            <section className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-xs font-black text-slate-900">Takings by method</h3>
                <p className="text-[11px] text-slate-500">Reconcile these against MoMo and card statements.</p>
              </div>
              {Object.keys(selectedShift.takingsByMethod).length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">No takings recorded for this shift.</p>
              ) : (
                <dl className="divide-y divide-slate-100 text-xs">
                  {Object.entries(selectedShift.takingsByMethod).map(([method, amount]) => (
                    <div key={method} className="flex justify-between px-4 py-2.5">
                      <dt className="capitalize text-slate-500">{method === 'momo' ? 'Mobile money' : method}</dt>
                      <dd className="font-bold text-slate-900">{money(amount || 0)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            {selectedShift.varianceNote && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-xs font-black text-amber-900">Variance explanation</h3>
                <p className="mt-1 text-xs leading-5 text-amber-800">{selectedShift.varianceNote}</p>
              </section>
            )}

            <p className="text-[11px] leading-5 text-slate-500">
              A closed shift cannot be reopened. Corrections are recorded as a separate cash movement (FR-CASH-09).
            </p>
          </div>
        </div>
      </div>
    )}
  </div>;
};
