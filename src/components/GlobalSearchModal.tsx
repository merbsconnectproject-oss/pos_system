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
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-start justify-center pt-20 p-4 animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-300 animate-command-palette"
      >
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-300 flex items-center gap-3">
          <Search className="w-5 h-5 text-orange-500 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search electrical products, SKU, or shortcuts..."
            className="w-full text-sm font-semibold text-slate-800 focus:outline-none placeholder:text-slate-400"
          />
          <kbd className="text-[10px] bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded font-mono text-slate-500">
            ESC
          </kbd>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 max-h-96 overflow-y-auto space-y-4">
          {/* Quick Nav Actions */}
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2">
              Quick Shortcuts
            </span>
            <button
              onClick={() => {
                onOpenPos();
                onClose();
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-orange-50 text-xs font-bold text-slate-700 hover:text-orange-600 group transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-slate-900 text-orange-400 flex items-center justify-center">
                  <Monitor className="w-4 h-4" />
                </div>
                <span>Launch POS Terminal (F2)</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-orange-500" />
            </button>

            <button
              onClick={() => {
                onOpenShift();
                onClose();
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-orange-50 text-xs font-bold text-slate-700 hover:text-orange-600 group transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <span>Cash Drawer &amp; Shifts (Blind Count BR-14)</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-orange-500" />
            </button>
          </div>

          {/* Matched Products */}
          {matchedProducts.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2">
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
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="w-8 h-8 rounded-md object-cover bg-slate-100 border border-slate-300"
                      />
                      <div>
                        <div className="font-bold text-slate-800">{p.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {p.sku} • In Stock: {totalStock} {p.baseUnit} across outlets
                        </div>
                      </div>
                    </div>
                    <span className="font-black text-orange-600">GH₵ {p.retailPrice.toFixed(2)}</span>
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
