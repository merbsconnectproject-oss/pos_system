import React, { useState, useEffect } from 'react';
import { Search, X, Package, Monitor, ArrowRight, Wallet, Users, BarChart3 } from 'lucide-react';
import { Product } from '../types';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct: (p: Product) => void;
  onOpenPos: () => void;
  onOpenShift: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct,
  onOpenPos,
  onOpenShift,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const matchedProducts = products
    .filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 5);

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-start justify-center pt-16 sm:pt-24 p-4 sm:p-6 animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-300 animate-command-palette flex flex-col max-h-[85vh]"
      >
        {/* Search Input Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-300 flex items-center gap-3.5 bg-white">
          <Search className="w-5 h-5 text-orange-500 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search electrical products, SKU, or shortcuts..."
            className="w-full text-base font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400"
          />
          <kbd className="text-xs bg-slate-100 border border-slate-300 px-2 py-1 rounded-md font-mono text-slate-500 font-bold">
            ESC
          </kbd>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Quick Nav Actions */}
          <div className="space-y-2">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider px-2">
              Quick Shortcuts
            </span>
            <button
              onClick={() => {
                onOpenPos();
                onClose();
              }}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-orange-50 text-sm font-bold text-slate-700 hover:text-orange-600 group transition-colors cursor-pointer border border-transparent hover:border-orange-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-orange-400 flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <span className="block font-bold">Launch POS Terminal</span>
                  <span className="text-xs text-slate-400 font-normal">Press F2 from any screen</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-orange-500" />
            </button>

            <button
              onClick={() => {
                onOpenShift();
                onClose();
              }}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-orange-50 text-sm font-bold text-slate-700 hover:text-orange-600 group transition-colors cursor-pointer border border-transparent hover:border-orange-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <span className="block font-bold">Cash Drawer &amp; Shifts</span>
                  <span className="text-xs text-slate-400 font-normal">Blind Count (BR-14 compliance)</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-orange-500" />
            </button>
          </div>

          {/* Matched Products */}
          {matchedProducts.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider px-2">
                Products Matching Query
              </span>
              {matchedProducts.map((p) => {
                const totalStock = (Object.values(p.stock) as number[]).reduce((a: number, b: number) => a + b, 0);
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProduct(p);
                      onClose();
                    }}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-slate-200 hover:border-slate-300 cursor-pointer text-sm transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-300 shrink-0"
                      />
                      <div>
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {p.sku} • In Stock: {totalStock} {p.baseUnit} across outlets
                        </div>
                      </div>
                    </div>
                    <span className="font-black text-orange-600 text-base font-mono">GH₵ {p.retailPrice.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
