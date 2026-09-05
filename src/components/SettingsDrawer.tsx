import React, { useState } from 'react';
import { Settings, X, RotateCcw, Check, Palette, Store, Printer, Shield } from 'lucide-react';
import { Outlet } from '../types';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  accentColor: string;
  onChangeAccent: (color: string) => void;
  outlets: Outlet[];
  onOpenFullSettings?: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  onOpen,
  accentColor,
  onChangeAccent,
  outlets,
  onOpenFullSettings,
}) => {
  const [customHex, setCustomHex] = useState(accentColor);
  const [receiptWidth, setReceiptWidth] = useState<'80mm' | '58mm'>('80mm');

  const swatches = [
    { label: 'Dreams Orange', hex: '#ff9f43' },
    { label: 'Emerald Green', hex: '#28c76f' },
    { label: 'Royal Blue', hex: '#00cfe8' },
    { label: 'Vibrant Purple', hex: '#7367f0' },
    { label: 'Crimson Red', hex: '#ea5455' },
    { label: 'Warm Amber', hex: '#f59e0b' },
    { label: 'Deep Slate', hex: '#1e293b' },
  ];

  const handleHexSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^#[0-9A-F]{6}$/i.test(customHex)) {
      onChangeAccent(customHex);
    } else {
      alert('Please enter a valid 6-digit hex code, e.g. #ff9f43');
    }
  };

  return (
    <>
      {/* Floating Orange Gear Tab on Right Screen Edge (Matches screenshots exactly!) */}
      <button
        onClick={onOpen}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-orange-500 hover:bg-orange-600 text-white p-2.5 rounded-l-xl shadow-xl transition-transform hover:-translate-x-1 flex items-center justify-center cursor-pointer"
        title="Settings & Appearance"
      >
        <Settings className="w-5 h-5 animate-spin-slow" />
      </button>

      {/* Drawer Overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex justify-end animate-modal-backdrop"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto border-l border-slate-200 animate-drawer-right"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-orange-500" />
                <h3 className="font-extrabold text-slate-800 text-base">Settings & Appearance</h3>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-5 space-y-6 flex-1">
              {/* Full Settings Hub Shortcut Banner */}
              {onOpenFullSettings && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenFullSettings();
                  }}
                  className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl shadow-xs hover:from-orange-600 hover:to-amber-600 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 text-left">
                    <Shield className="w-5 h-5 text-white shrink-0" />
                    <div>
                      <div className="text-xs font-black">Open Full Settings Console</div>
                      <div className="text-[10px] text-orange-100">Users, Roles, RBAC &amp; Hardware</div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-white group-hover:translate-x-0.5 transition-transform">
                    →
                  </span>
                </button>
              )}

              {/* Section 1: Appearance & Accent Picker (Screen K-06) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-orange-500" />
                    System Accent Color
                  </span>
                  <button
                    onClick={() => onChangeAccent('#ff9f43')}
                    className="text-[11px] text-orange-600 font-semibold hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>

                {/* Swatches Grid */}
                <div className="grid grid-cols-7 gap-2">
                  {swatches.map((s) => (
                    <button
                      key={s.hex}
                      onClick={() => onChangeAccent(s.hex)}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow-2xs relative"
                      style={{ backgroundColor: s.hex }}
                      title={s.label}
                    >
                      {accentColor === s.hex && <Check className="w-4 h-4 text-white stroke-[3]" />}
                    </button>
                  ))}
                </div>

                {/* Hex Code Input */}
                <form onSubmit={handleHexSubmit} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={customHex}
                    onChange={(e) => setCustomHex(e.target.value)}
                    placeholder="#ff9f43"
                    className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-900"
                  >
                    Apply
                  </button>
                </form>

                {/* Live Preview Panel (Per Screen K-06 requirement) */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Live Token Preview</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-1 text-white text-xs font-bold rounded-md shadow-2xs"
                      style={{ backgroundColor: accentColor }}
                    >
                      Active Button
                    </button>
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-bold"
                      style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                    >
                      Selected Pill
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Receipt & Printer Configuration */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-orange-500" />
                  Thermal Printer Layout
                </span>

                <div className="grid grid-cols-2 gap-2">
                  {(['80mm', '58mm'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setReceiptWidth(w)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        receiptWidth === w
                          ? 'border-orange-500 bg-orange-50 text-orange-600'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {w} Standard
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Default format used during POS checkout printing.
                </p>
              </div>

              {/* Section 3: Two Outlets Configuration */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-orange-500" />
                  Configured Outlets ({outlets.length})
                </span>

                <div className="space-y-2">
                  {outlets.map((outlet) => (
                    <div
                      key={outlet.id}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-0.5"
                    >
                      <div className="font-bold text-slate-800 flex items-center justify-between">
                        <span>{outlet.name}</span>
                        <span className="text-[10px] font-mono text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                          {outlet.receiptPrefix}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">{outlet.town} • {outlet.phone}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 text-center">
              <span className="text-[11px] text-slate-400">
                DreamsPOS v1.0 • Stage 1 Certified
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
