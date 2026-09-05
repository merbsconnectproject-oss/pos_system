import React, { useState } from 'react';
import { ShieldCheck, X, AlertTriangle } from 'lucide-react';

interface ManagerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  onSuccess: (approverName: string) => void;
}

export const ManagerPinModal: React.FC<ManagerPinModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Default Manager PIN is 1234
    if (pin === '1234') {
      onSuccess('Yaw Boakye (Manager)');
      setPin('');
      setError(null);
    } else {
      setError('Invalid Manager PIN. Please try again (Hint: 1234)');
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-80 flex items-center justify-center p-4 animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200 animate-modal-card"
      >
        <div className="bg-amber-500 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="font-black text-sm">{title}</h3>
          </div>
          <button onClick={onClose} className="text-amber-100 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>{description}</div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Enter Manager Authorization PIN
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
              className="w-full text-center text-2xl tracking-widest font-black py-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-orange-500"
            />
            {error && <p className="text-[11px] text-red-600 font-bold mt-1.5">{error}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs"
            >
              Authorize
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
