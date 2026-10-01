import React, { useState } from 'react';
import { formatMoney, roundMoney } from '../money';
import { X, Wallet, DollarSign, CheckCircle2, AlertTriangle, Clock, Printer } from 'lucide-react';
import { ShiftInfo, Outlet } from '../types';
import type { TerminalWire } from '../salesApi';

interface ShiftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shiftInfo: ShiftInfo;
  /**
   * BR-6: the tills at this branch, so the drawer can be opened on the counter
   * the cashier is actually standing at. One till needs no decision; two or
   * more do, because the receipt numbers come from whichever is chosen.
   */
  terminals: TerminalWire[];
  onStartShift: (openingFloat: number, terminalId?: string) => void;
  onCloseShift: (countedCash: number, note?: string) => void;
  currentOutlet: Outlet;
  /** FR-CASH-06: variance beyond this needs a written explanation (K-08). */
  varianceExplainThreshold: number;
  /**
   * Who is signed in.
   *
   * Only used before a shift exists. Once one is open the drawer belongs to
   * whoever opened it, and that name is the server's — a cashier reading their
   * own name above somebody else's drawer is how a count gets signed off by
   * the wrong person.
   */
  currentUserName: string;
  /** FR-SET-01: the configured currency, not a compiled-in one. */
  currencySymbol: string;
}

export const ShiftsModal: React.FC<ShiftsModalProps> = ({
  isOpen,
  onClose,
  shiftInfo,
  terminals,
  varianceExplainThreshold,
  onStartShift,
  onCloseShift,
  currentOutlet,
  currentUserName,
  currencySymbol,
}) => {
  const [openingFloat, setOpeningFloat] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [countedCash, setCountedCash] = useState<string>('');
  const [varianceNote, setVarianceNote] = useState<string>('');
  const [showVarianceResult, setShowVarianceResult] = useState<boolean>(false);

  if (!isOpen) return null;

  /** BR-6: how a till is named to the person standing at it. */
  const namedTill = (id: string) => {
    const till = terminals.find((item) => item.id === id);
    return till ? `Till ${till.code} · ${till.name}` : `Terminal #${id}`;
  };

  // One till is not a decision. The picker appears only where there is
  // something to pick, so the everyday counter keeps the two-field form it had.
  const mustChooseTill = !shiftInfo.isOpen && terminals.length > 1;
  const chosenTill = terminals.find((till) => till.id === terminalId) || null;
  const tillReady = !mustChooseTill || chosenTill !== null;

  const countedNum = parseFloat(countedCash) || 0;
  const variance = roundMoney(countedNum - shiftInfo.expectedCash);
  // FR-CASH-06: an explanation is required only past the configured threshold.
  const explanationRequired = Math.abs(variance) > varianceExplainThreshold;
  const canFinalize = !explanationRequired || varianceNote.trim().length > 0;

  const handlePerformBlindCount = (e: React.FormEvent) => {
    e.preventDefault();
    setShowVarianceResult(true);
  };

  const handleFinalizeClose = () => {
    if (!canFinalize) return;
    onCloseShift(countedNum, varianceNote);
    setShowVarianceResult(false);
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 sm:p-6 select-none animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-300 animate-modal-card flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 py-5 sm:px-8 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-500/20 border border-accent-500/40 text-accent-400 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-xl leading-tight">Cashier Shift &amp; Drawer</h3>
              <p className="text-xs text-slate-400 mt-0.5">End-of-Day Blind Reconciliation Protocol</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 text-sm flex justify-between items-center">
            <div>
              {/*
                The open shift's own terminal and cashier, as the server
                recorded them. Both used to be written in: every till in every
                shop claimed terminal 01 and a cashier called Kwame A., so the
                one screen whose job is to say whose drawer this is said the
                same thing to everybody.
              */}
              <div className="font-black text-slate-900">
                {currentOutlet.name}
                {/*
                  The till by the name written on it, not its database id. This
                  printed "Terminal #a3f2c891-4e0d-..." at a counter, which is
                  not something a cashier can check against the sticker on the
                  machine in front of them. Falls back to the id only when the
                  till list has not arrived.
                */}
                {shiftInfo.terminalId && (
                  <> • {namedTill(shiftInfo.terminalId)}</>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {shiftInfo.isOpen && shiftInfo.cashier ? (
                  <>
                    Active cashier: <span className="font-bold text-slate-700">{shiftInfo.cashier}</span>
                    {shiftInfo.openedAt && <> · opened {shiftInfo.openedAt}</>}
                  </>
                ) : (
                  <>
                    No shift open · signed in as{' '}
                    <span className="font-bold text-slate-700">{currentUserName}</span>
                  </>
                )}
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full font-black text-xs ${
                shiftInfo.isOpen
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-slate-200 text-slate-800 border border-slate-300'
              }`}
            >
              {shiftInfo.isOpen ? '● Active Shift' : '○ No Shift Open'}
            </span>
          </div>

          {!shiftInfo.isOpen ? (
            /* Open Shift Form */
            <div className="space-y-5">
              {/*
                BR-6: which counter this drawer belongs to. The receipt numbers
                come from the till's own block, so opening every shift on the
                first till would put two cashiers on one block and make "which
                till issued this receipt" unanswerable.
              */}
              {mustChooseTill && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-800 block" htmlFor="shift-till">
                    Which till are you on? *
                  </label>
                  <select
                    id="shift-till"
                    value={terminalId}
                    onChange={(event) => setTerminalId(event.target.value)}
                    className="w-full px-4 py-3 text-sm font-bold border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-accent-500"
                  >
                    <option value="">Select a till…</option>
                    {terminals.map((till) => (
                      <option key={till.id} value={till.id}>
                        Till {till.code} · {till.name}
                      </option>
                    ))}
                  </select>
                  {chosenTill && (
                    <p className="text-xs text-slate-500">
                      Receipts from this counter are numbered from its own block —{' '}
                      <span className="font-bold text-slate-700">
                        {chosenTill.remaining.toLocaleString()} numbers left
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}

              {terminals.length === 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="leading-relaxed">
                    <strong className="font-bold">No till is configured for this branch.</strong> A
                    sale cannot be numbered without one. Register a counter in Settings &rsaquo;
                    Hardware &amp; Receipts before opening a drawer.
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-800 block">
                  Opening float declaration ({currencySymbol}) *
                </label>
                <div className="relative">
                  <span className="w-10 h-10 flex items-center justify-center font-bold text-slate-500 absolute left-1.5 top-1 text-lg">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-14 pr-4 py-3 text-xl font-black border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-accent-500"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Enter the verified physical cash present in the drawer prior to accepting transactions.
                </p>
              </div>

              <button
                disabled={!tillReady || terminals.length === 0}
                onClick={() => {
                  const openingFloatValue = parseFloat(openingFloat);
                  if (Number.isNaN(openingFloatValue)) return;
                  if (!tillReady) return;
                  onStartShift(openingFloatValue, chosenTill?.id);
                  onClose();
                }}
                className="w-full bg-accent-500 hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-slate-300 text-white font-bold py-3.5 rounded-lg shadow-xs transition-colors text-sm cursor-pointer"
              >
                Start Shift &amp; Unlock POS Terminal
              </button>
            </div>
          ) : !showVarianceResult ? (
            /* Blind Count Shift Close (PRD BR-14) */
            <form onSubmit={handlePerformBlindCount} className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-900 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="font-bold">Blind Cash Count Protocol:</strong> Expected drawer sales are strictly hidden until you count and submit your actual physical cash.
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-800 block mb-2">
                  Total counted cash in drawer ({currencySymbol}) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-3xl font-black text-center py-3.5 border border-slate-300 rounded-lg focus:outline-accent-500 text-slate-900"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 rounded-lg text-sm cursor-pointer transition-colors shadow-xs"
              >
                Submit Count &amp; Reveal Reconciliation Variance
              </button>
            </form>
          ) : (
            /* Variance Revealed Screen */
            <div className="space-y-5 text-sm">
              <div className="bg-slate-50 border border-slate-300 rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-sm">Expected Drawer Cash:</span>
                  <span className="font-bold text-base text-slate-800">
                    {formatMoney(shiftInfo.expectedCash, currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-sm">Your Counted Cash:</span>
                  <span className="font-bold text-base text-slate-800">
                    {formatMoney(countedNum, currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-300 text-base font-black">
                  <span>Reconciliation Variance:</span>
                  <span
                    className={
                      variance === 0
                        ? 'text-emerald-700'
                        : variance > 0
                        ? 'text-blue-700'
                        : 'text-red-600'
                    }
                  >
                    {variance > 0
                      ? `+${formatMoney(variance, currencySymbol)} (over)`
                      : variance < 0
                      ? `-${formatMoney(Math.abs(variance), currencySymbol)} (short)`
                      : `${formatMoney(0, currencySymbol)} (perfect match)`}
                  </span>
                </div>
              </div>

              {variance !== 0 && (
                <div>
                  <label className="text-sm font-bold text-slate-800 block mb-1.5">
                    Variance explanation{' '}
                    {explanationRequired ? (
                      <span className="text-rose-600">
                        (required — variance exceeds{' '}
                        {formatMoney(varianceExplainThreshold, currencySymbol)})
                      </span>
                    ) : (
                      <span className="font-normal text-slate-500">
                        (optional — within the{' '}
                        {formatMoney(varianceExplainThreshold, currencySymbol)} threshold)
                      </span>
                    )}
                  </label>
                  <textarea
                    rows={3}
                    value={varianceNote}
                    onChange={(e) => setVarianceNote(e.target.value)}
                    placeholder="Provide detailed explanation for cash drawer discrepancy..."
                    className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-accent-500"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowVarianceResult(false)}
                  className="sm:w-1/2 py-3 border border-slate-300 rounded-lg font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Recount Cash
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeClose}
                  disabled={!canFinalize}
                  title={canFinalize ? undefined : 'A written explanation is required for this variance.'}
                  className="sm:w-1/2 py-3 bg-red-600 hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300 text-white rounded-lg font-bold text-sm transition-colors cursor-pointer shadow-xs"
                >
                  Finalize &amp; Close Shift
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
