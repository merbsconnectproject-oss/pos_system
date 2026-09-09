import React, { useState } from 'react';
import { X, Sliders, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Product, Outlet, StockMovement } from '../types';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  currentOutlet: Outlet;
  onConfirmAdjustment: (productId: string, newStock: number, movement: StockMovement) => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  product,
  currentOutlet,
  onConfirmAdjustment,
}) => {
  const [reasonCode, setReasonCode] = useState<'PHYSICAL_COUNT' | 'DAMAGED' | 'SHOP_USE' | 'SUPPLIER_RETURN'>('PHYSICAL_COUNT');
  const [notes, setNotes] = useState('');
  const [actualCount, setActualCount] = useState<number>(0);

  if (!isOpen || !product) return null;

  const outletId = (product.outletId && product.outletId !== 'all-outlets')
    ? product.outletId
    : (currentOutlet.id === 'all-outlets' ? 'inco-hardware' : currentOutlet.id);
  const currentStock = product.stock[outletId] || 0;
  const variance = actualCount - currentStock;

  const storeName = outletId === 'inco-hardware' ? 'Inco Hardware' : 'Apex Electricals';

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (variance === 0) {
      alert('Count matches current stock, no adjustment needed.');
      return;
    }
    if (!notes.trim()) {
      alert('Mandatory audit note is required for stock adjustments.');
      return;
    }

    const type =
      reasonCode === 'DAMAGED'
        ? 'DAMAGE'
        : variance > 0
        ? 'ADJUSTMENT_IN'
        : 'ADJUSTMENT_OUT';

    const movement: StockMovement = {
      id: `adj-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      outletId: outletId as 'inco-hardware' | 'apex-electricals',
      productId: product.id,
      productName: product.name,
      type,
      quantity: variance,
      previousStock: currentStock,
      newStock: actualCount,
      referenceNumber: `ADJ-${Date.now().toString().slice(-6)}`,
      reason: `[${reasonCode}] ${notes}`,
      user: 'Manager (Yaw Boakye)',
    };

    onConfirmAdjustment(product.id, actualCount, movement);
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-300 animate-modal-card flex flex-col max-h-[92vh]"
      >
        <div className="bg-slate-900 text-white px-6 py-5 sm:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-xl leading-tight">Stock Balance Adjustment</h3>
              <p className="text-xs text-slate-400 mt-0.5">Physical audit reconciliation for <strong>{storeName}</strong></p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAdjust} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 sm:p-5 flex items-center justify-between">
            <div>
              <div className="font-black text-base text-slate-900">{product.name}</div>
              <div className="text-xs text-slate-500 font-mono mt-0.5 uppercase tracking-wider">{product.sku}</div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block">Recorded System Stock:</span>
              <strong className="text-lg font-black text-slate-900">{currentStock} {product.baseUnit}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Audit Reason Code (Mandatory) *</label>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as any)}
                className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white font-medium text-slate-800 focus:outline-orange-500"
              >
                <option value="PHYSICAL_COUNT">Physical Count Audit Discrepancy</option>
                <option value="DAMAGED">Damaged / Defective Stock</option>
                <option value="SHOP_USE">Store Maintenance / Internal Use</option>
                <option value="SUPPLIER_RETURN">Supplier Warranty Return</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">
                Verified Physical Count ({product.baseUnit}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={actualCount}
                onChange={(e) => setActualCount(parseFloat(e.target.value) || 0)}
                className="w-full text-lg font-black border border-slate-300 rounded-lg px-3.5 py-2 text-slate-900 focus:outline-orange-500"
              />
            </div>
          </div>

          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 sm:p-5 flex justify-between items-center text-sm">
            <div>
              <span className="font-black text-amber-900 block">Calculated Variance Balance:</span>
              <span className="text-xs text-amber-700">Adjustment posted to branch audit ledger</span>
            </div>
            <span
              className={`font-black text-xl ${
                variance > 0 ? 'text-emerald-700' : variance < 0 ? 'text-red-600' : 'text-slate-600'
              }`}
            >
              {variance > 0 ? `+${variance}` : variance} {product.baseUnit}
            </span>
          </div>

          <div>
            <label className="text-sm font-bold text-slate-800 block mb-1.5">
              Audit Explanation &amp; Sign-off Note (Required) *
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Recounted coil on spool stand during weekly Monday audit; 3 meters removed for damaged end cut..."
              className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-orange-500 focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="sm:w-1/3 py-3 rounded-lg border border-slate-300 font-bold text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sm:w-2/3 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-xs cursor-pointer transition-colors"
            >
              Commit Stock Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
