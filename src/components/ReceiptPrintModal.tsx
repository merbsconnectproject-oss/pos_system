import React, { useState, useEffect } from 'react';
import {
  Printer,
  X,
  Copy,
  Check,
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Sliders,
  ShieldCheck,
  AlertCircle,
  QrCode,
  Barcode,
} from 'lucide-react';
import { CompletedSale } from '../types';
import { ThermalReceiptSlip, generateReceiptPlainText } from './ThermalReceiptSlip';
import { ReceiptVerificationModal } from './ReceiptVerificationModal';

interface ReceiptPrintModalProps {
  sale: CompletedSale;
  isOpen: boolean;
  onClose: () => void;
  onPrint: (sale: CompletedSale, width: '80mm' | '58mm') => void;
  isReprint?: boolean;
  allSales?: CompletedSale[];
  onSelectSale?: (sale: CompletedSale) => void;
}

export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  sale,
  isOpen,
  onClose,
  onPrint,
  isReprint = true,
  allSales = [],
  onSelectSale,
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [viewMode, setViewMode] = useState<'slip-only' | 'slip-audit'>('slip-only');
  const [verificationMode, setVerificationMode] = useState<'qr-only' | 'barcode-only' | 'both'>('qr-only');
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState<number>(100);

  // Close on Escape key & Print on Ctrl/Cmd+P
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onPrint(sale, paperWidth);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, sale, paperWidth, onClose, onPrint]);

  if (!isOpen) return null;

  // Navigation between receipts
  const currentIndex = allSales.findIndex((s) => s.id === sale.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allSales.length - 1;

  const handlePrev = () => {
    if (hasPrev && onSelectSale) {
      onSelectSale(allSales[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext && onSelectSale) {
      onSelectSale(allSales[currentIndex + 1]);
    }
  };

  const handleCopyText = async () => {
    const text = generateReceiptPlainText(sale, isReprint, paperWidth);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadTxt = () => {
    const text = generateReceiptPlainText(sale, isReprint, paperWidth);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt_${sale.receiptNumber}_${paperWidth}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
      className="fixed inset-0 z-70 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-modal-card"
      >
        {/* Modal Top Control Bar */}
        <header className="p-3.5 sm:px-5 sm:py-3.5 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="receipt-modal-title" className="text-sm font-bold text-white">
                  Receipt Print View
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-orange-400 font-bold">
                  {sale.receiptNumber}
                </span>
                {isReprint && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800 text-amber-300">
                    Reprint Mode
                  </span>
                )}
                {sale.status === 'VOIDED' && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300">
                    Voided
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Crisp ink-saving thermal layout • Pure B&amp;W typography • 0% background fill
              </p>
            </div>
          </div>

          {/* Quick Controls & Close */}
          <div className="flex items-center gap-2">
            {/* Previous / Next receipt navigation */}
            {allSales.length > 1 && onSelectSale && (
              <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={!hasPrev}
                  className="p-1 rounded text-slate-300 hover:text-white disabled:text-slate-600 disabled:cursor-not-allowed cursor-pointer"
                  title="Previous Receipt"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 text-[10px] text-slate-400 font-mono">
                  {currentIndex + 1}/{allSales.length}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!hasNext}
                  className="p-1 rounded text-slate-300 hover:text-white disabled:text-slate-600 disabled:cursor-not-allowed cursor-pointer"
                  title="Next Receipt"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Sub-bar: Configuration Tabs (Width, View Mode, Zoom) */}
        <div className="bg-slate-950/60 px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3">
            {/* Paper Roll Width Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px]">Paper Width:</span>
              <div className="inline-flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setPaperWidth('80mm')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    paperWidth === '80mm'
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  80mm (Standard)
                </button>
                <button
                  type="button"
                  onClick={() => setPaperWidth('58mm')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    paperWidth === '58mm'
                      ? 'bg-slate-100 text-slate-900 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  58mm (Compact)
                </button>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px] hidden sm:inline">View Mode:</span>
              <div className="inline-flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setViewMode('slip-only')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    viewMode === 'slip-only'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Slip Only
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('slip-audit')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    viewMode === 'slip-audit'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Slip + Audit
                </button>
              </div>
            </div>

            {/* Verification Code Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[11px] hidden md:inline">Verification:</span>
              <div className="inline-flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setVerificationMode('qr-only')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                    verificationMode === 'qr-only'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Dynamic Customer QR Code"
                >
                  <QrCode className="w-3 h-3" />
                  <span>QR Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationMode('barcode-only')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                    verificationMode === 'barcode-only'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="1D Optical Barcode"
                >
                  <Barcode className="w-3 h-3" />
                  <span>Barcode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationMode('both')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    verificationMode === 'both'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Include both QR Code and Barcode"
                >
                  Both
                </button>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsVerifyModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer text-xs font-medium"
              title="Test customer verification screen for this receipt"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Simulate Scan</span>
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copy plain-text slip for ESC/POS or sharing"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTxt}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download receipt as .txt file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">TXT</span>
            </button>

            {/* Print Primary Action */}
            <button
              type="button"
              onClick={() => onPrint(sale, paperWidth)}
              className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Send to physical receipt or desktop printer (Ctrl+P)"
            >
              <Printer className="w-4 h-4" />
              <span>Print Slip</span>
            </button>
          </div>
        </div>

        {/* Modal Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950 flex flex-col lg:flex-row gap-6 items-start justify-center">
          {/* Thermal Paper Slip Display Area */}
          <div className="w-full flex flex-col items-center justify-center">
            {/* Paper roll container with subtle realistic paper styling */}
            <div className="relative group">
              {/* Jagged / Perforated top receipt edge */}
              <div
                className="w-full h-2.5 bg-white mx-auto"
                style={{
                  clipPath:
                    'polygon(0% 100%, 2% 0%, 4% 100%, 6% 0%, 8% 100%, 10% 0%, 12% 100%, 14% 0%, 16% 100%, 18% 0%, 20% 100%, 22% 0%, 24% 100%, 26% 0%, 28% 100%, 30% 0%, 32% 100%, 34% 0%, 36% 100%, 38% 0%, 40% 100%, 42% 0%, 44% 100%, 46% 0%, 48% 100%, 50% 0%, 52% 100%, 54% 0%, 56% 100%, 58% 0%, 60% 100%, 62% 0%, 64% 100%, 66% 0%, 68% 100%, 70% 0%, 72% 100%, 74% 0%, 76% 100%, 78% 0%, 80% 100%, 82% 0%, 84% 100%, 86% 0%, 88% 100%, 90% 0%, 92% 100%, 94% 0%, 96% 100%, 98% 0%, 100% 100%)',
                }}
              />

              {/* White Thermal Paper Canvas */}
              <div
                className={`bg-white text-black p-4 sm:p-6 shadow-2xl border-x border-slate-300 transition-all ${
                  paperWidth === '58mm' ? 'w-[280px]' : 'w-[360px] sm:w-[380px]'
                }`}
                style={{
                  minHeight: '440px',
                }}
              >
                <ThermalReceiptSlip
                  sale={sale}
                  isReprint={isReprint}
                  paperWidth={paperWidth}
                  showQrCode={verificationMode === 'qr-only' || verificationMode === 'both'}
                  showBarcode={verificationMode === 'barcode-only' || verificationMode === 'both'}
                  onScanQrCode={() => setIsVerifyModalOpen(true)}
                />
              </div>

              {/* Jagged / Perforated bottom receipt cut edge */}
              <div
                className="w-full h-2.5 bg-white mx-auto shadow-md"
                style={{
                  clipPath:
                    'polygon(0% 0%, 2% 100%, 4% 0%, 6% 100%, 8% 0%, 10% 100%, 12% 0%, 14% 100%, 16% 0%, 18% 100%, 20% 0%, 22% 100%, 24% 0%, 26% 100%, 28% 0%, 30% 100%, 32% 0%, 34% 100%, 36% 0%, 38% 100%, 40% 0%, 42% 100%, 44% 0%, 46% 100%, 48% 0%, 50% 100%, 52% 0%, 54% 100%, 56% 0%, 58% 100%, 60% 0%, 62% 100%, 64% 0%, 66% 100%, 68% 0%, 70% 100%, 72% 0%, 74% 100%, 76% 0%, 78% 100%, 80% 0%, 82% 100%, 84% 0%, 86% 100%, 88% 0%, 90% 100%, 92% 0%, 94% 100%, 96% 0%, 98% 100%, 100% 0%)',
                }}
              />
            </div>

            {/* Quick print guideline note */}
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Optimized for 203 DPI direct thermal and desktop printing without margins</span>
            </div>
          </div>

          {/* Audit Details Panel (When viewMode === 'slip-audit') */}
          {viewMode === 'slip-audit' && (
            <div className="w-full lg:w-[380px] bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 shrink-0 text-xs">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-400" />
                  <span>Transaction Audit Trail</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Internal verification data stored for this receipt record.
                </p>
              </div>

              {/* Status and Identification */}
              <div className="space-y-2 p-3 bg-slate-950/60 rounded-lg border border-slate-800 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Internal UUID:</span>
                  <span className="text-slate-200 truncate max-w-[170px]" title={sale.id}>
                    {sale.id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Store Outlet:</span>
                  <span className="text-white font-sans font-semibold">{sale.outletName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Register Terminal:</span>
                  <span className="text-slate-200">TERM-{sale.terminalId || '01'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Cashier:</span>
                  <span className="text-slate-200 font-sans">{sale.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Transaction Time:</span>
                  <span className="text-slate-200">{sale.createdAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Audit Status:</span>
                  <span
                    className={
                      sale.status === 'COMPLETED' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                    }
                  >
                    {sale.status}
                  </span>
                </div>
              </div>

              {/* Cost & Margin Analysis */}
              <div className="space-y-2 p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  Cost &amp; Profit Audit
                </div>
                {(() => {
                  const totalCost = sale.items.reduce(
                    (sum, it) => sum + (it.frozenCostPrice || 0) * it.quantity,
                    0
                  );
                  const grossProfit = sale.total - totalCost;
                  const profitMargin = sale.total > 0 ? (grossProfit / sale.total) * 100 : 0;
                  return (
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Frozen Cost Total:</span>
                        <span className="text-slate-300">GH₵ {totalCost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Revenue Recognized:</span>
                        <span className="text-slate-100 font-bold">GH₵ {sale.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800">
                        <span className="text-slate-400 font-sans">Gross Profit:</span>
                        <span className="text-emerald-400 font-bold">
                          GH₵ {grossProfit.toFixed(2)} ({profitMargin.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Payment Verification */}
              <div className="space-y-2 p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  Tender Reconciliations
                </div>
                {sale.payments.map((p, idx) => (
                  <div key={idx} className="text-[11px] font-mono space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-slate-300 capitalize">{p.provider || p.method}:</span>
                      <span className="text-white font-bold">GH₵ {p.amount.toFixed(2)}</span>
                    </div>
                    {p.reference && (
                      <div className="text-[10px] text-slate-400">
                        External Ref: <span className="text-slate-200">{p.reference}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Void Audit Information */}
              {sale.status === 'VOIDED' && (
                <div className="space-y-1.5 p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-rose-200 text-[11px]">
                  <div className="flex items-center gap-1 font-bold text-rose-300">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Void Authorization Record</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Reason:</span> {sale.voidReason || 'Not stated'}
                  </div>
                  {sale.voidedBy && (
                    <div>
                      <span className="text-slate-400">Manager Auth:</span> {sale.voidedBy}
                    </div>
                  )}
                  {sale.voidedAt && (
                    <div>
                      <span className="text-slate-400">Voided At:</span> {sale.voidedAt}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <footer className="p-3.5 sm:px-5 border-t border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>ESC/POS print driver ready • Compatible with 80mm &amp; 58mm rolls</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Done / Close
            </button>

            <button
              type="button"
              onClick={() => onPrint(sale, paperWidth)}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-white text-slate-900 flex items-center gap-2 transition-colors cursor-pointer shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>Print Thermal Receipt</span>
            </button>
          </div>
        </footer>
      </div>

      {/* Customer Verification Simulator Modal */}
      <ReceiptVerificationModal
        isOpen={isVerifyModalOpen}
        sale={sale}
        onClose={() => setIsVerifyModalOpen(false)}
      />
    </div>
  );
};
