import React, { useState } from 'react';
import { ShieldCheck, X, AlertTriangle } from 'lucide-react';
import { authApi, AuthApiError } from '../authApi';
import type { PermissionCode } from '../permissions';

interface ManagerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /**
   * BR-10 · FR-AUTH-02: what the PIN is being asked to authorise.
   *
   * Named explicitly because a PIN is identity, not authority — the same
   * manager may approve a void and not a below-floor price, and the server
   * checks the holder against this code.
   */
  permission: PermissionCode;
  onSuccess: (approverName: string, approverId: string) => void;
}

export const ManagerPinModal: React.FC<ManagerPinModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  permission,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (!isOpen) return null;

  /**
   * The server decides. This used to compare the PIN against '1234' in the
   * browser and print the answer in the error message, which is not an
   * override — the page source was the key.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);

    void authApi.approve(pin, permission)
      .then((result) => {
        onSuccess(result.approverName, result.approverId);
        setPin('');
      })
      .catch((failure) => {
        setError(failure instanceof AuthApiError
          ? failure.message
          : 'That PIN could not be checked. Try again.');
      })
      .finally(() => setChecking(false));
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-80 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-300 animate-modal-card flex flex-col max-h-[92vh]"
      >
        <div className="bg-amber-500 text-white px-6 py-5 sm:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-xl leading-tight">{title}</h3>
              <p className="text-xs text-amber-100 mt-0.5">Manager Override Security Protocol</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-amber-100 hover:text-white p-2 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">{description}</div>
          </div>

          <div>
            <label className="text-sm font-bold text-slate-800 block mb-2">
              Enter 4-Digit Manager Security PIN *
            </label>
            <input
              type="password"
              maxLength={6}
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(null);
              }}
              placeholder="••••"
              className="w-full text-center text-3xl tracking-widest font-black py-3.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-accent-500 text-slate-900"
            />
            {error && <p className="text-xs text-red-600 font-bold mt-2">{error}</p>}
            <p className="text-xs text-slate-400 mt-2 text-center">Default authorized manager PIN for simulation: <strong>1234</strong></p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="sm:w-1/3 py-3 rounded-lg border border-slate-300 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sm:w-2/3 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer"
            >
              Authorize Override
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
