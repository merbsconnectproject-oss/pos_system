import React, { useState, useEffect } from 'react';
import { Search, Printer, X, Download, Filter, Eye, FileText } from 'lucide-react';
import { CompletedSale, Outlet, StockMovement } from '../types';
import { ManagerPinModal } from './ManagerPinModal';
import { exportToCsv } from '../utils/csvExport';
import { ThermalReceiptSlip } from './ThermalReceiptSlip';
import { ReceiptPrintModal } from './ReceiptPrintModal';

interface SalesHistoryViewProps {
  sales: CompletedSale[];
  currentOutlet: Outlet;
  onVoidSale: (saleId: string, reason: string, approver: string, reversingMovements: StockMovement[]) => void;
}

export const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({
  sales,
  currentOutlet,
  onVoidSale,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'VOIDED'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'CUSTOM'>('ALL');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [cashierFilter, setCashierFilter] = useState('ALL');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [viewingReceipt, setViewingReceipt] = useState<CompletedSale | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<CompletedSale | null>(null);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [isReprint, setIsReprint] = useState(false);
  const [voidingSale, setVoidingSale] = useState<CompletedSale | null>(null);
  const [voidReasonCode, setVoidReasonCode] = useState<'CASHIER_ERROR' | 'CUSTOMER_RETURN' | 'DEFECTIVE_PRODUCT' | 'DUPLICATE_ENTRY'>('CASHIER_ERROR');
  const [voidNote, setVoidNote] = useState('');
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const outletSales = sales.filter((s) => currentOutlet.id === 'all-outlets' || s.outletId === currentOutlet.id);
  const completedSales = outletSales.filter((s) => s.status === 'COMPLETED');
  const voidedSales = outletSales.filter((s) => s.status === 'VOIDED');
  const totalCompletedValue = completedSales.reduce((sum, s) => sum + s.total, 0);
  const totalVoidedValue = voidedSales.reduce((sum, s) => sum + s.total, 0);
  const avgTicket = completedSales.length > 0 ? totalCompletedValue / completedSales.length : 0;
  const cashiers = Array.from(new Set(outletSales.map((sale) => sale.cashierName))).sort();

  const filteredSales = outletSales.filter((s) => {
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    const now = new Date();
    const todayGb = now.toLocaleDateString('en-GB');
    const todayIso = now.toISOString().slice(0, 10);
    const saleDate = s.createdAt.includes('/')
      ? s.createdAt.slice(0, 10).split('/').reverse().join('-')
      : s.createdAt.slice(0, 10);
    const matchesDate = dateFilter === 'ALL'
      || (dateFilter === 'TODAY' && (s.createdAt.startsWith(todayGb) || s.createdAt.startsWith(todayIso)))
      || (dateFilter === 'CUSTOM' && (!dateStart || saleDate >= dateStart) && (!dateEnd || saleDate <= dateEnd));
    const matchesPayment = paymentFilter === 'ALL' || s.payments.some((payment) => payment.method === paymentFilter);
    const matchesCashier = cashierFilter === 'ALL' || s.cashierName === cashierFilter;
    const matchesMin = !minAmount || s.total >= Number(minAmount);
    const matchesMax = !maxAmount || s.total <= Number(maxAmount);
    const matchesSearch =
      s.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customerPhone && s.customerPhone.includes(searchTerm));
    return matchesStatus && matchesDate && matchesPayment && matchesCashier && matchesMin && matchesMax && matchesSearch;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setDateFilter('ALL');
    setDateStart('');
    setDateEnd('');
    setPaymentFilter('ALL');
    setCashierFilter('ALL');
    setMinAmount('');
    setMaxAmount('');
  };

  const selectedSale = filteredSales.find((s) => s.id === selectedSaleId) || null;

  // Fires the browser print dialog once the isolated receipt node has been rendered.
  useEffect(() => {
    if (!printTarget) return;
    const clearTarget = () => setPrintTarget(null);
    window.addEventListener('afterprint', clearTarget);
    const timer = window.setTimeout(() => window.print(), 60);
    return () => {
      window.removeEventListener('afterprint', clearTarget);
      window.clearTimeout(timer);
    };
  }, [printTarget]);

  // Prints the currently selected receipt (or the one open in the preview modal).
  const handlePrintReceipt = (sale?: CompletedSale, width?: '80mm' | '58mm') => {
    const target = sale || viewingReceipt || selectedSale;
    if (!target) return;
    setSelectedSaleId(target.id);
    if (width) setPaperWidth(width);
    // Anything printed from the history log is by definition a reprint.
    setIsReprint(true);
    setPrintTarget(target);
  };

  const handleExportSalesCsv = () => {
    const filename = `sales_history_${currentOutlet.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'Receipt Number',
      'Transaction Date',
      'Store Outlet',
      'Cashier',
      'Customer Name',
      'Customer Phone',
      'Customer Tier',
      'Payment Method',
      'Items Count',
      'Items Breakdown',
      'Subtotal (GHS)',
      'Discount (GHS)',
      'Tax (GHS)',
      'Total Amount (GHS)',
      'Transaction Status',
      'Void Reason',
      'Void Approved By',
    ];

    const rows = filteredSales.map((s) => {
      const itemsCount = s.items.reduce((sum, item) => sum + item.quantity, 0);
      const itemsBreakdown = s.items
        .map(
          (item) =>
            `${item.product.name} (Qty: ${item.quantity} ${item.selectedUnit || item.product.baseUnit} @ GHS ${item.unitPrice.toFixed(2)})`
        )
        .join('; ');

      return [
        s.receiptNumber,
        s.timestamp,
        s.outletName,
        s.cashierName,
        s.customerName,
        s.customerPhone || '',
        s.customerTier || 'Retail',
        s.paymentMethod,
        itemsCount,
        itemsBreakdown,
        s.subtotal.toFixed(2),
        s.discount.toFixed(2),
        s.tax.toFixed(2),
        s.total.toFixed(2),
        s.status,
        s.voidReason || '',
        s.voidedBy || '',
      ];
    });

    exportToCsv(filename, headers, rows);
  };

  const handleStartVoid = (sale: CompletedSale) => {
    setVoidingSale(sale);
    setPinModalOpen(true);
  };

  const handlePinSuccess = (approver: string) => {
    setPinModalOpen(false);
    if (!voidingSale) return;

    // Generate reversing movements for each item (BR-3)
    const reversingMovements: StockMovement[] = voidingSale.items.map((item) => ({
      id: `rev-${Date.now()}-${item.product.id}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      outletId: voidingSale.outletId,
      productId: item.product.id,
      productName: item.product.name,
      type: 'SALE_VOID',
      quantity: item.quantity,
      previousStock: item.product.stock[voidingSale.outletId] || 0,
      newStock: (item.product.stock[voidingSale.outletId] || 0) + item.quantity,
      referenceNumber: voidingSale.receiptNumber,
      reason: `Sale voided: [${voidReasonCode}] ${voidNote || 'Correcting erroneous sale'}`,
      user: approver,
    }));

    onVoidSale(voidingSale.id, `[${voidReasonCode}] ${voidNote || 'Voided by manager'}`, approver, reversingMovements);
    setVoidingSale(null);
    setVoidNote('');
    alert(`Receipt #${voidingSale.receiptNumber} has been voided. Stock returned to ${voidingSale.outletName}.`);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-300">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Sales & Receipts History</h1>
            <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-300">
              Audit Trail
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Completed sales are immutable. Corrections are made via Void with manager PIN approval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              if (selectedSale) {
                setViewingReceipt(selectedSale);
                setIsReprint(true);
              }
            }}
            disabled={!selectedSale}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-700 border border-slate-300 text-xs font-bold px-3.5 py-2 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title={
              selectedSale
                ? `Open dedicated thermal slip view for ${selectedSale.receiptNumber}`
                : 'Select a receipt row in the table below to view thermal slip'
            }
          >
            <Eye className="w-4 h-4 text-slate-600" />
            <span>View Thermal Slip</span>
          </button>

          <button
            onClick={() => handlePrintReceipt()}
            disabled={!selectedSale}
            className="flex items-center gap-2 bg-slate-900 hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
            title={
              selectedSale
                ? `Print receipt ${selectedSale.receiptNumber}`
                : 'Select a receipt row in the table below to print it'
            }
          >
            <Printer className="w-4 h-4 stroke-[2.5]" />
            <span>{selectedSale ? `Print ${selectedSale.receiptNumber}` : 'Print Thermal Slip'}</span>
          </button>

          <button
            onClick={handleExportSalesCsv}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Export sales transactions to CSV for accounting software (QuickBooks, Sage, Xero, Excel)"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>Export Sales (CSV)</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards (Solid Darker Shade) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Sales */}
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold tracking-wide uppercase text-slate-400">Total Net Sales</span>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-2">
              GH₵ {totalCompletedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
            From {completedSales.length} valid transactions
          </div>
        </div>

        {/* Completed Receipts */}
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold tracking-wide uppercase text-slate-400">Completed Receipts</span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-2">
              {completedSales.length}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-emerald-400 font-medium">
            Active verified receipts
          </div>
        </div>

        {/* Voided Sales */}
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold tracking-wide uppercase text-slate-400">Voided Transactions</span>
            <div className="text-2xl sm:text-3xl font-black text-rose-400 font-mono mt-2">
              {voidedSales.length}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-rose-400 font-medium">
            GH₵ {totalVoidedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} reversed
          </div>
        </div>

        {/* Average Ticket */}
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold tracking-wide uppercase text-slate-400">Average Order Ticket</span>
            <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono mt-2">
              GH₵ {avgTicket.toFixed(2)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
            Per completed customer sale
          </div>
        </div>
      </div>

      {/* Search & transaction filter bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-300 shadow-xs space-y-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by receipt #, customer, phone..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-orange-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500 mr-1">
            <Filter className="w-3.5 h-3.5" /> Filters
          </div>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'ALL' | 'TODAY' | 'CUSTOM')}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-orange-500"
            aria-label="Filter sales by date"
          >
            <option value="ALL">All dates</option>
            <option value="TODAY">Today</option>
            <option value="CUSTOM">Custom range</option>
          </select>
          {dateFilter === 'CUSTOM' && <>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-orange-500" aria-label="Sales start date" />
            <span className="text-xs text-slate-400 font-bold">to</span>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-orange-500" aria-label="Sales end date" />
          </>}
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-orange-500" aria-label="Filter sales by payment method">
            <option value="ALL">All payment methods</option>
            <option value="cash">Cash</option>
            <option value="momo">Mobile Money</option>
            <option value="card">Card</option>
            <option value="transfer">Bank Transfer</option>
          </select>
          <select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-orange-500" aria-label="Filter sales by cashier">
            <option value="ALL">All cashiers</option>
            {cashiers.map((cashier) => <option key={cashier} value={cashier}>{cashier}</option>)}
          </select>
          <input type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min GH₵" className="w-24 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-orange-500" aria-label="Minimum sale amount" />
          <input type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Max GH₵" className="w-24 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-orange-500" aria-label="Maximum sale amount" />
          <button type="button" onClick={clearFilters} className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">Clear</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-[11px] text-slate-500 font-medium">
            {selectedSale ? (
              <>
                Selected: <strong className="text-slate-800 font-mono">{selectedSale.receiptNumber}</strong>
              </>
            ) : (
              'Click a row to select a receipt for printing'
            )}
          </span>

          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-300">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({filteredSales.length})
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                statusFilter === 'COMPLETED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Completed ({completedSales.length})
            </button>
            <button
              onClick={() => setStatusFilter('VOIDED')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                statusFilter === 'VOIDED'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Voided ({voidedSales.length})
            </button>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-300 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Outlet</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items Count</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Total (GH₵)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No receipts found for {currentOutlet.name} matching the current filters.
                  </td>
                </tr>
              )}
              {filteredSales.map((sale) => (
                <tr
                  key={sale.id}
                  onClick={() => setSelectedSaleId(sale.id)}
                  className={`transition-colors cursor-pointer ${
                    selectedSaleId === sale.id
                      ? 'bg-orange-50/80 ring-1 ring-inset ring-orange-300'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{sale.receiptNumber}</td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{sale.createdAt}</td>
                  <td className="py-3 px-4 font-semibold text-slate-700">{sale.outletName}</td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800">{sale.customerName}</div>
                    {sale.customerPhone && (
                      <div className="text-[11px] text-slate-400 font-mono">{sale.customerPhone}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {sale.items.reduce((sum, it) => sum + it.quantity, 0)} units ({sale.items.length} lines)
                  </td>
                  <td className="py-3 px-4">
                    {sale.payments.map((p, idx) => (
                      <span key={idx} className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold mr-1">
                        {p.provider || p.method.toUpperCase()}
                      </span>
                    ))}
                  </td>
                  <td className="py-3 px-4 text-right font-black text-slate-900">
                    GH₵ {sale.total.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {sale.status === 'COMPLETED' ? (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        Completed
                      </span>
                    ) : (
                      <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        Voided
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSaleId(sale.id);
                          setViewingReceipt(sale);
                          setIsReprint(true);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Open dedicated print-friendly thermal receipt slip"
                      >
                        <FileText className="w-3.5 h-3.5 text-orange-600" />
                        <span>Receipt Slip</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintReceipt(sale);
                        }}
                        className="p-1 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors cursor-pointer"
                        title="Direct print thermal slip"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {sale.status === 'COMPLETED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartVoid(sale);
                          }}
                          className="px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-300 rounded-md transition-colors cursor-pointer"
                          title="Void Sale with Manager PIN"
                        >
                          Void
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dedicated Print-Friendly Receipt Modal (PRD §9) */}
      {viewingReceipt && (
        <ReceiptPrintModal
          isOpen={Boolean(viewingReceipt)}
          sale={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
          onPrint={(targetSale, width) => handlePrintReceipt(targetSale, width)}
          isReprint={isReprint}
          allSales={filteredSales}
          onSelectSale={(newSale) => {
            setSelectedSaleId(newSale.id);
            setViewingReceipt(newSale);
          }}
        />
      )}

      {/* Isolated print surface — the only node the print stylesheet keeps visible */}
      {printTarget && (
        <div id="printable-receipt" aria-hidden="true">
          <ThermalReceiptSlip
            sale={printTarget}
            isReprint={isReprint}
            paperWidth={paperWidth}
            showBarcode={true}
          />
        </div>
      )}

      {/* Manager PIN Modal for Void */}
      <ManagerPinModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        title="Manager Authorization: Void Sale"
        description="Sale voiding is an irreversible auditing action. Reversing inventory movements will be generated automatically."
        onSuccess={handlePinSuccess}
      />
    </div>
  );
};
