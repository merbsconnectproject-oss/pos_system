import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Calendar,
  User,
  Store,
  CreditCard,
  X,
  Copy,
  Check,
  Download,
  Receipt,
  QrCode,
  ExternalLink,
} from 'lucide-react';
import { CompletedSale } from '../types';

interface ReceiptVerificationModalProps {
  isOpen: boolean;
  sale: CompletedSale;
  onClose: () => void;
}

export const ReceiptVerificationModal: React.FC<ReceiptVerificationModalProps> = ({
  isOpen,
  sale,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const verifyUrl = `https://radiancepos.gh/verify/${sale.receiptNumber}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Calculate return expiry (7 days from sale date)
  const saleDate = new Date(sale.createdAt.replace(/(\d+)\/(\d+)\/(\d+)/, '$2/$1/$3'));
  const validSaleDate = isNaN(saleDate.getTime()) ? new Date() : saleDate;
  const returnExpiry = new Date(validSaleDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const formattedExpiry = returnExpiry.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-modal-title"
      className="fixed inset-0 z-80 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh] animate-modal-card"
      >
        {/* Verification Header */}
        <div className="bg-emerald-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-emerald-100 uppercase tracking-wider">
                Customer Verification
              </div>
              <h3 id="verify-modal-title" className="text-base font-black text-white leading-tight">
                Authentic Receipt Verified
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-700 transition-colors cursor-pointer"
            aria-label="Close verification modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Verification Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-slate-800">
          {/* Certificate Badge */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-emerald-900">
                Official Radiance POS Digital Record
              </div>
              <p className="text-emerald-700 text-[11px] mt-0.5 leading-relaxed">
                This transaction was securely registered on the Radiance POS network. The receipt ID matches an active, untampered ledger record.
              </p>
            </div>
          </div>

          {/* Quick Details Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Receipt className="w-3 h-3 text-slate-500" /> Receipt No.
              </div>
              <div className="font-mono font-bold text-slate-900 mt-1">
                {sale.receiptNumber}
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Store className="w-3 h-3 text-slate-500" /> Outlet
              </div>
              <div className="font-bold text-slate-900 mt-1 truncate">
                {sale.outletName}
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" /> Date & Time
              </div>
              <div className="font-semibold text-slate-900 mt-1 text-[11px]">
                {sale.createdAt}
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" /> Cashier
              </div>
              <div className="font-semibold text-slate-900 mt-1 truncate">
                {sale.cashierName}
              </div>
            </div>
          </div>

          {/* Itemized breakdown */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 flex justify-between">
              <span>Items Purchased ({sale.items.length})</span>
              <span>Amount</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
              {sale.items.map((item, idx) => (
                <div key={idx} className="p-3 text-xs flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate">
                      {item.product.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {item.quantity} × GH₵ {item.unitPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="font-bold text-slate-900 font-mono whitespace-nowrap">
                    GH₵ {item.lineTotal.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 p-3 border-t border-slate-200 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>GH₵ {sale.subtotal.toFixed(2)}</span>
              </div>
              {sale.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span>-GH₵ {sale.discountTotal.toFixed(2)}</span>
                </div>
              )}
              {/* AS-1: VAT is out of Stage 1 scope — receipts show prices as charged, no tax line. */}
              <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
                <span>TOTAL PAID</span>
                <span className="text-emerald-700 font-mono">
                  GH₵ {sale.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Return & Warranty Status */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1 text-amber-900">
            <div className="font-bold flex items-center justify-between">
              <span>Return Eligibility</span>
              <span className="text-[11px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-black">
                Valid until {formattedExpiry}
              </span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Customers may present this QR code or receipt number within 7 days for exchange or returns across all branch outlets.
            </p>
          </div>

          {/* Verification Link */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
            <div className="text-[10px] font-bold uppercase text-slate-400">
              Customer Verification URL
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={verifyUrl}
                className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-700 select-all"
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1 bg-slate-900 hover:bg-black text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
