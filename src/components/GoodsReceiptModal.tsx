import React, { useState } from 'react';
import { X, Truck, Calculator, CheckCircle2, AlertCircle } from 'lucide-react';
import { Product, Outlet, Supplier, StockMovement } from '../types';

interface GoodsReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  currentOutlet: Outlet;
  suppliers: Supplier[];
  onConfirmReceipt: (
    productId: string,
    qtyReceived: number,
    unitCost: number,
    newWeightedAvgCost: number,
    movement: StockMovement
  ) => void;
}

export const GoodsReceiptModal: React.FC<GoodsReceiptModalProps> = ({
  isOpen,
  onClose,
  products,
  currentOutlet,
  suppliers,
  onConfirmReceipt,
}) => {
  const outletId = currentOutlet.id === 'all-outlets' ? 'inco-hardware' : currentOutlet.id;
  
  const storeProducts = products.filter(
    (p) => !p.outletId || p.outletId === 'all-outlets' || p.outletId === outletId
  );
  const storeSuppliers = suppliers.filter(
    (s) => !s.outletId || s.outletId === 'all-outlets' || s.outletId === outletId
  );

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [qtyReceived, setQtyReceived] = useState('');
  const [unitCost, setUnitCost] = useState('');

  if (!isOpen) return null;

  const product = storeProducts.find((p) => p.id === selectedProductId);
  const currentStock = product ? product.stock[outletId] || 0 : 0;
  const currentAvgCost = product ? product.costPrice[outletId] || product.retailPrice * 0.7 : 0;
  const qtyReceivedNum = parseFloat(qtyReceived) || 0;
  const activeUnitCost = parseFloat(unitCost) || 0;

  // PRD BR-4: Weighted Average Costing Formula
  // new_avg = ((qty_on_hand * current_avg) + (qty_received * unit_cost)) / (qty_on_hand + qty_received)
  const totalQtyAfter = Math.max(1, currentStock + qtyReceivedNum);
  const weightedAvgCost =
    ((Math.max(0, currentStock) * currentAvgCost) + (qtyReceivedNum * activeUnitCost)) / totalQtyAfter;

  const handleReceive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !selectedSupplierId || !invoiceRef.trim() || qtyReceivedNum <= 0 || activeUnitCost <= 0) return;

    const movement: StockMovement = {
      id: `mvt-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      outletId,
      productId: product.id,
      productName: product.name,
      type: 'RECEIPT',
      quantity: qtyReceivedNum,
      previousStock: currentStock,
      newStock: currentStock + qtyReceivedNum,
      unitCost: activeUnitCost,
      referenceNumber: invoiceRef,
      reason: `Goods receipt from ${suppliers.find((s) => s.id === selectedSupplierId)?.name || 'Supplier'}`,
      user: 'Storekeeper (Yaw)',
    };

    onConfirmReceipt(product.id, qtyReceivedNum, activeUnitCost, Number(weightedAvgCost.toFixed(2)), movement);
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-300 animate-modal-card flex flex-col max-h-[92vh]"
      >
        <div className="bg-slate-900 text-white px-6 py-5 sm:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-500/20 border border-accent-500/40 text-accent-400 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-xl leading-tight">Goods Receipt Note (GRN)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Posting inbound warehouse inventory for {currentOutlet.name}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleReceive} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Originating Supplier *</label>
              <select
                required
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white font-medium text-slate-800 focus:outline-accent-500"
              >
                <option value="" disabled>Select supplier</option>
                {storeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.paymentTerms})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">Supplier Invoice / PO Ref *</label>
              <input
                type="text"
                required
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="e.g. INV-2025-0891"
                className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-800 focus:outline-accent-500 focus:ring-2 focus:ring-accent-500/20"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-slate-800 block mb-1.5">Catalogue Item Received *</label>
            <select
              required
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setUnitCost('');
              }}
              className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white font-medium text-slate-800 focus:outline-accent-500"
            >
              <option value="" disabled>Select product</option>
              {storeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} [{p.sku}] — Current Stock: {p.stock[outletId] || 0} {p.baseUnit}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">
                Quantity Inbound ({product?.baseUnit}) *
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={qtyReceived}
                onChange={(e) => setQtyReceived(e.target.value)}
                className="w-full text-base font-black border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 focus:outline-accent-500"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-800 block mb-1.5">
                Batch Unit Purchase Cost (GH₵) *
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="w-full text-base font-black border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 focus:outline-accent-500"
              />
            </div>
          </div>

          {/* PRD BR-4 Weighted Average Cost Calculation Box */}
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 font-black text-sm">
              <Calculator className="w-5 h-5 text-accent-500" />
              <span>Weighted Average Costing Valuation (AVCO)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Current Average Cost:</span>
                <strong className="text-slate-900 text-sm">GH₵ {currentAvgCost.toFixed(2)}</strong>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">New Unit Delivery Cost:</span>
                <strong className="text-slate-900 text-sm">GH₵ {activeUnitCost.toFixed(2)}</strong>
              </div>
              <div className="bg-accent-50/80 p-3 rounded-lg border border-accent-200">
                <span className="text-accent-700 block text-[11px] font-medium">Recomputed Moving Avg:</span>
                <strong className="text-accent-700 font-black text-base">GH₵ {weightedAvgCost.toFixed(2)}</strong>
              </div>
            </div>
            <div className="text-xs text-slate-500 border-t border-slate-200 pt-2.5 flex items-center justify-between">
              <span>On-hand stock at {currentOutlet.name}</span>
              <span className="font-bold text-slate-700">{currentStock} → {currentStock + qtyReceivedNum} {product?.baseUnit || ''}</span>
            </div>
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
              className="sm:w-2/3 py-3 rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-bold text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Post Goods Receipt to Inventory</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
