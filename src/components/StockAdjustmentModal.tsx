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
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-300 animate-modal-card"
      >
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-orange-400" />
            <div>
              <h3 className="font-black text-sm">Stock Adjustment</h3>
              <p className="text-[11px] text-slate-300">Target Store: <strong>{storeName}</strong></p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAdjust} className="p-5 space-y-4 text-xs">
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-3 space-y-1">
            <div className="font-bold text-slate-800 text-sm">{product.name}</div>
            <div className="text-slate-500 font-mono">{product.sku}</div>
            <div className="text-slate-600 pt-1">
              Current recorded stock: <strong className="text-slate-800">{currentStock} {product.baseUnit}</strong>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Reason Code (Mandatory) *</label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as any)}
              className="w-full border border-slate-300 rounded-lg p-2 bg-white font-medium"
            >
              <option value="PHYSICAL_COUNT">Physical Count Audit Discrepancy</option>
              <option value="DAMAGED">Damaged / Defective Stock</option>
              <option value="SHOP_USE">Store Maintenance / Internal Use</option>
              <option value="SUPPLIER_RETURN">Supplier Warranty Return</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Verified Physical Count ({product.baseUnit}) *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={actualCount}
              onChange={(e) => setActualCount(parseFloat(e.target.value) || 0)}
              className="w-full text-xl font-black border border-slate-300 rounded-lg p-2.5"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center text-xs">
            <span className="font-bold text-amber-900">Computed Variance:</span>
            <span
              className={`font-black text-sm ${
                variance > 0 ? 'text-emerald-700' : variance < 0 ? 'text-red-600' : 'text-slate-600'
              }`}
            >
              {variance > 0 ? `+${variance}` : variance} {product.baseUnit}
            </span>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Audit Explanation Note (Required) *
            </label>
            <textarea
              required
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Recounted drum on spool stand during weekly audit..."
              className="w-full border border-slate-300 rounded-lg p-2"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-xs"
            >
              Commit Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
