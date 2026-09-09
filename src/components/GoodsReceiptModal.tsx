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

  const [selectedProductId, setSelectedProductId] = useState<string>(storeProducts[0]?.id || products[0]?.id || '');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(storeSuppliers[0]?.id || suppliers[0]?.id || '');
  const [invoiceRef, setInvoiceRef] = useState(
    outletId === 'inco-hardware'
      ? 'GRN-INC-' + Date.now().toString().slice(-4)
      : 'GRN-APX-' + Date.now().toString().slice(-4)
  );
  const [qtyReceived, setQtyReceived] = useState<number>(50);
  const [unitCost, setUnitCost] = useState<number>(0);

  if (!isOpen) return null;

  const product = storeProducts.find((p) => p.id === selectedProductId) || storeProducts[0] || products[0];
  const currentStock = product ? product.stock[outletId] || 0 : 0;
  const currentAvgCost = product ? product.costPrice[outletId] || product.retailPrice * 0.7 : 0;

  // Initialize unit cost if 0
  const activeUnitCost = unitCost > 0 ? unitCost : currentAvgCost;

  // PRD BR-4: Weighted Average Costing Formula
  // new_avg = ((qty_on_hand * current_avg) + (qty_received * unit_cost)) / (qty_on_hand + qty_received)
  const totalQtyAfter = Math.max(1, currentStock + qtyReceived);
  const weightedAvgCost =
    ((Math.max(0, currentStock) * currentAvgCost) + (qtyReceived * activeUnitCost)) / totalQtyAfter;

  const handleReceive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || qtyReceived <= 0) return;

    const movement: StockMovement = {
      id: `mvt-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      outletId: outletId as 'inco-hardware' | 'apex-electricals',
      productId: product.id,
      productName: product.name,
      type: 'RECEIPT',
      quantity: qtyReceived,
      previousStock: currentStock,
      newStock: currentStock + qtyReceived,
      unitCost: activeUnitCost,
      referenceNumber: invoiceRef,
      reason: `Goods receipt from ${suppliers.find((s) => s.id === selectedSupplierId)?.name || 'Supplier'}`,
      user: 'Storekeeper (Yaw)',
    };

    onConfirmReceipt(product.id, qtyReceived, activeUnitCost, Number(weightedAvgCost.toFixed(2)), movement);
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-300 animate-modal-card"
      >
        <div className="bg-[#1e293b] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-400" />
            <div>
              <h3 className="font-black text-sm">Goods Receipt (GRN)</h3>
              <p className="text-[11px] text-slate-300">Receiving inventory at {currentOutlet.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleReceive} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Select Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 bg-white font-medium"
              >
                {storeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.paymentTerms})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Invoice / PO Reference *</label>
              <input
                type="text"
                required
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Select Product *</label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setUnitCost(0);
              }}
              className="w-full border border-slate-300 rounded-lg p-2 bg-white font-medium"
            >
              {storeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} [{p.sku}] — On Hand: {p.stock[outletId] || 0} {p.baseUnit}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Quantity Received ({product?.baseUnit}) *
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={qtyReceived}
                onChange={(e) => setQtyReceived(parseFloat(e.target.value) || 0)}
                className="w-full text-base font-black border border-slate-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Unit Purchase Cost (GH₵) *
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={activeUnitCost}
                onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                className="w-full text-base font-black border border-slate-300 rounded-lg p-2"
              />
            </div>
          </div>

          {/* PRD BR-4 Weighted Average Cost Calculation Box */}
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-slate-800 font-bold">
              <Calculator className="w-4 h-4 text-orange-500" />
              <span>Weighted Average Costing</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 pt-1">
              <div>
                <span className="text-slate-400 block">Current Avg Cost:</span>
                <strong className="text-slate-800">GH₵ {currentAvgCost.toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">New Unit Cost:</span>
                <strong className="text-slate-800">GH₵ {activeUnitCost.toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">New Recomputed Avg:</span>
                <strong className="text-orange-600 font-black">GH₵ {weightedAvgCost.toFixed(2)}</strong>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 border-t border-slate-300 pt-1.5">
              Stock at {currentOutlet.name} will increase from {currentStock} to {currentStock + qtyReceived} {product?.baseUnit}.
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-xs flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Post Goods Receipt</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
