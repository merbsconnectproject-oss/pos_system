import React, { useState } from 'react';
import type { PermissionSet } from '../permissions';
import { ACCENT_PRESETS, DEFAULT_ACCENT, isBlue } from '../accent';
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
  permissions: PermissionSet;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  onOpen,
  accentColor,
  onChangeAccent,
  outlets,
  onOpenFullSettings,
  permissions,
}) => {
  const canSetAccent = permissions.has('settings.appearance');
  const canSetTerminal = permissions.has('settings.terminal');
  const canSeeOutlets = permissions.has('settings.general');
  const consoleSubtitle = permissions.has('user.manage')
    ? 'Users, roles, RBAC & hardware'
    : [canSeeOutlets && 'Store & branches', canSetTerminal && 'Hardware', canSetAccent && 'Theme']
        .filter(Boolean)
        .join(' · ') || 'Your available settings';
  const [customHex, setCustomHex] = useState(accentColor);
  const [hexError, setHexError] = useState<string | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<'80mm' | '58mm'>('80mm');

  const swatches = ACCENT_PRESETS.map((preset) => ({
    label: preset.hex === DEFAULT_ACCENT ? `${preset.name} (Default)` : preset.name,
    hex: preset.hex,
  }));

  const handleHexSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^#[0-9A-F]{6}$/i.test(customHex)) {
      setHexError('Enter a valid 6-digit hex code, e.g. #c55200.');
      return;
    }
    // Acceptance criterion 11: no blue appears anywhere in the palette.
    if (isBlue(customHex)) {
      setHexError('Blue is not part of the palette. Choose Orange, Amber, Crimson, Plum, Forest, Teal or Graphite.');
      return;
    }
    setHexError(null);
    onChangeAccent(customHex);
  };

  return (
    <>
      {/* Floating Orange Gear Tab on Right Screen Edge (Matches screenshots exactly!) */}
      <button
        onClick={onOpen}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-accent-500 hover:bg-accent-600 text-white p-2.5 rounded-l-xl shadow-xl transition-transform hover:-translate-x-1 flex items-center justify-center cursor-pointer"
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
            className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto border-l border-slate-300 animate-drawer-right"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-300 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent-500" />
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
                  className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-accent-500 to-amber-500 text-white rounded-xl shadow-xs hover:from-accent-600 hover:to-amber-600 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 text-left">
                    <Shield className="w-5 h-5 text-white shrink-0" />
                    <div>
                      <div className="text-xs font-black">Open Full Settings Console</div>
                      <div className="text-[10px] text-accent-100">{consoleSubtitle}</div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-white group-hover:translate-x-0.5 transition-transform">
                    →
                  </span>
                </button>
              )}

              {/* Section 1: Appearance & Accent Picker (Screen K-06, FR-SET-03) */}
              {canSetAccent && <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-accent-500" />
                    System Accent Color
                  </span>
                  <button
                    onClick={() => onChangeAccent(DEFAULT_ACCENT)}
                    className="text-[11px] text-accent-600 font-semibold hover:underline flex items-center gap-1"
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
                    onChange={(e) => { setCustomHex(e.target.value); setHexError(null); }}
                    placeholder={DEFAULT_ACCENT}
                    className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-900"
                  >
                    Apply
                  </button>
                </form>

                {hexError && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">
                    {hexError}
                  </p>
                )}

                {/* Live Preview Panel (Per Screen K-06 requirement) */}
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-xl space-y-2 text-xs">
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
              </div>}

              {canSetTerminal && <div className="space-y-3 pt-4 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-accent-500" />
                  Thermal Printer Layout
                </span>

                <div className="grid grid-cols-2 gap-2">
                  {(['80mm', '58mm'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setReceiptWidth(w)}
                      className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                        receiptWidth === w
                          ? 'border-accent-500 bg-accent-50 text-accent-600'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {w} Standard
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Default format used during POS checkout printing.
                </p>
              </div>}

              {canSeeOutlets && <div className="space-y-3 pt-4 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-accent-500" />
                  Configured Outlets ({outlets.length})
                </span>

                <div className="space-y-2">
                  {outlets.map((outlet) => (
                    <div
                      key={outlet.id}
                      className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs space-y-0.5"
                    >
                      <div className="font-bold text-slate-800 flex items-center justify-between">
                        <span>{outlet.name}</span>
                        <span className="text-[10px] font-mono text-accent-600 bg-accent-50 px-1.5 py-0.5 rounded">
                          {outlet.receiptPrefix}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">{outlet.town} • {outlet.phone}</div>
                    </div>
                  ))}
                </div>
              </div>}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-300 bg-slate-50 text-center">
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
