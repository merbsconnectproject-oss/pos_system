import React, { useState } from 'react';
import { X, Wallet, DollarSign, CheckCircle2, AlertTriangle, Clock, Printer } from 'lucide-react';
import { ShiftInfo, Outlet } from '../types';

interface ShiftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shiftInfo: ShiftInfo;
  onStartShift: (openingFloat: number) => void;
  onCloseShift: (countedCash: number, note?: string) => void;
  currentOutlet: Outlet;
}

export const ShiftsModal: React.FC<ShiftsModalProps> = ({
  isOpen,
  onClose,
  shiftInfo,
  onStartShift,
  onCloseShift,
  currentOutlet,
}) => {
  const [openingFloat, setOpeningFloat] = useState<number>(200);
  const [countedCash, setCountedCash] = useState<string>('');
  const [varianceNote, setVarianceNote] = useState<string>('');
  const [showVarianceResult, setShowVarianceResult] = useState<boolean>(false);

  if (!isOpen) return null;

  const countedNum = parseFloat(countedCash) || 0;
  const variance = countedNum - shiftInfo.expectedCash;

  const handlePerformBlindCount = (e: React.FormEvent) => {
    e.preventDefault();
    setShowVarianceResult(true);
  };

  const handleFinalizeClose = () => {
    onCloseShift(countedNum, varianceNote);
    setShowVarianceResult(false);
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 select-none animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-modal-card"
      >
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-orange-400" />
            <div>
              <h3 className="font-black text-sm">Cashier Shift &amp; Drawer</h3>
              <p className="text-[10px] text-slate-400">PRD Screen C-30 • Blind Count (BR-14)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex justify-between items-center">
            <div>
              <div className="font-bold text-slate-800">{currentOutlet.name} • Terminal #01</div>
              <div className="text-slate-500">Cashier: Kwame A.</div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                shiftInfo.isOpen
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {shiftInfo.isOpen ? '● Active Shift' : '○ No Shift Open'}
            </span>
          </div>

          {!shiftInfo.isOpen ? (
            /* Open Shift Form */
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Opening Float Declaration (GH₵)
                </label>
                <div className="relative">
                  <span className="w-8 h-8 flex items-center justify-center font-bold text-slate-400 absolute left-1 top-1">
                    ₵
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 text-lg font-black border border-slate-300 rounded-xl bg-white text-slate-800"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Enter physical cash present in the drawer before taking sales.
                </p>
              </div>

              <button
                onClick={() => {
                  onStartShift(openingFloat);
                  onClose();
                }}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl shadow-xs transition-colors text-xs cursor-pointer"
              >
                Start Shift &amp; Open POS
              </button>
            </div>
          ) : !showVarianceResult ? (
            /* Blind Count Shift Close (PRD BR-14) */
            <form onSubmit={handlePerformBlindCount} className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Blind Cash Count (BR-14):</strong> Expected drawer takings are strictly hidden until you count and submit your physical cash.
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Counted Cash in Drawer (GH₵) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-2xl font-black text-center py-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 hover:bg-black text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer"
              >
                Submit Count &amp; Reveal Variance
              </button>
            </form>
          ) : (
            /* Variance Revealed Screen */
            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Drawer Cash:</span>
                  <span className="font-bold text-slate-800">
                    GH₵ {shiftInfo.expectedCash.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Your Counted Cash:</span>
                  <span className="font-bold text-slate-800">GH₵ {countedNum.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black">
                  <span>Variance:</span>
                  <span
                    className={
                      variance === 0
                        ? 'text-emerald-600'
                        : variance > 0
                        ? 'text-blue-600'
                        : 'text-red-600'
                    }
                  >
                    {variance > 0 ? `+GH₵ ${variance.toFixed(2)} (Over)` : variance < 0 ? `-GH₵ ${Math.abs(variance).toFixed(2)} (Short)` : 'GH₵ 0.00 (Perfect Match)'}
                  </span>
                </div>
              </div>

              {variance !== 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Explanation Note (Audit Required) *
                  </label>
                  <textarea
                    rows={2}
                    value={varianceNote}
                    onChange={(e) => setVarianceNote(e.target.value)}
                    placeholder="Provide reason for cash drawer variance..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowVarianceResult(false)}
                  className="flex-1 py-2 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                >
                  Recount Cash
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeClose}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
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
