import React, { useState } from 'react';
import { formatMoney, roundMoney } from '../money';
import { X, Wallet, DollarSign, CheckCircle2, AlertTriangle, Clock, Printer } from 'lucide-react';
import { ShiftInfo, Outlet } from '../types';

interface ShiftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shiftInfo: ShiftInfo;
  onStartShift: (openingFloat: number) => void;
  onCloseShift: (countedCash: number, note?: string) => void;
  currentOutlet: Outlet;
  /** FR-CASH-06: variance beyond this needs a written explanation (K-08). */
  varianceExplainThreshold: number;
}

export const ShiftsModal: React.FC<ShiftsModalProps> = ({
  isOpen,
  onClose,
  shiftInfo,
  varianceExplainThreshold,
  onStartShift,
  onCloseShift,
  currentOutlet,
}) => {
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState<string>('');
  const [varianceNote, setVarianceNote] = useState<string>('');
  const [showVarianceResult, setShowVarianceResult] = useState<boolean>(false);

  if (!isOpen) return null;

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
              <div className="font-black text-slate-900">{currentOutlet.name} • Terminal #01</div>
              <div className="text-xs text-slate-500 mt-0.5">Active Cashier: Kwame A.</div>
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
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-800 block">
                  Opening Float Declaration (Ghana Cedis GH₵) *
                </label>
                <div className="relative">
                  <span className="w-10 h-10 flex items-center justify-center font-bold text-slate-500 absolute left-1.5 top-1 text-lg">
                    GH₵
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
                onClick={() => {
                  const openingFloatValue = parseFloat(openingFloat);
                  if (Number.isNaN(openingFloatValue)) return;
                  onStartShift(openingFloatValue);
                  onClose();
                }}
                className="w-full bg-accent-500 hover:bg-accent-600 text-white font-bold py-3.5 rounded-lg shadow-xs transition-colors text-sm cursor-pointer"
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
                  Total Counted Cash in Drawer (GH₵) *
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
                    GH₵ {shiftInfo.expectedCash.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-sm">Your Counted Cash:</span>
                  <span className="font-bold text-base text-slate-800">GH₵ {countedNum.toFixed(2)}</span>
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
                    {variance > 0 ? `+GH₵ ${variance.toFixed(2)} (Over)` : variance < 0 ? `-GH₵ ${Math.abs(variance).toFixed(2)} (Short)` : 'GH₵ 0.00 (Perfect Match)'}
                  </span>
                </div>
              </div>

              {variance !== 0 && (
                <div>
                  <label className="text-sm font-bold text-slate-800 block mb-1.5">
                    Variance explanation{' '}
                    {explanationRequired ? (
                      <span className="text-rose-600">
                        (required — variance exceeds {formatMoney(varianceExplainThreshold)})
                      </span>
                    ) : (
                      <span className="font-normal text-slate-500">
                        (optional — within the {formatMoney(varianceExplainThreshold)} threshold)
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
