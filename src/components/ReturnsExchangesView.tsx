import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  RefreshCw,
  Search,
  Filter,
  Plus,
  Printer,
  ChevronDown,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileSpreadsheet,
  Download,
  Trash2,
  Package,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  XCircle,
  Clock,
  Sparkles,
  DollarSign,
} from 'lucide-react';
import {
  ReturnExchangeRecord,
  ReturnedItemDetail,
  SwappedItemDetail,
  ReturnReason,
  ReturnDisposition,
  CompletedSale,
  Product,
  Outlet,
  OutletId,
  StockMovement,
} from '../types';
import { exportToCsv } from '../utils/csvExport';

interface ReturnsExchangesViewProps {
  records: ReturnExchangeRecord[];
  onAddRecord: (
    record: ReturnExchangeRecord,
    stockAdjustments: Array<{ productId: string; quantityDelta: number; reason: string }>
  ) => void;
  sales: CompletedSale[];
  products: Product[];
  currentOutlet: Outlet;
  outlets: Outlet[];
  accentColor?: string;
}

const RETURN_REASONS: ReturnReason[] = [
  'Defective / Faulty Item',
  'Wrong Specification / Color',
  'Customer Changed Mind',
  'Excess Project Quantity',
  'Warranty Claim',
];

export const ReturnsExchangesView: React.FC<ReturnsExchangesViewProps> = ({
  records = [],
  onAddRecord,
  sales = [],
  products = [],
  currentOutlet,
  outlets,
  accentColor,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'EXCHANGE_SWAP' | 'RETURN_REFUND'>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>(
    currentOutlet?.id === 'all-outlets' ? 'all' : (currentOutlet?.id || 'all')
  );

  // New Return/Swap Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string>(sales[0]?.id || '');
  const [customReceiptNumber, setCustomReceiptNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [outletId, setOutletId] = useState<OutletId>(
    currentOutlet.id === 'all-outlets' ? 'radiance-lighting' : currentOutlet.id
  );

  // Returned Items Form State
  const [returnItems, setReturnItems] = useState<
    Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      reason: ReturnReason;
      disposition: ReturnDisposition;
      conditionNotes: string;
    }>
  >([]);

  // Swapped (Replacement) Items Form State
  const [isSwapping, setIsSwapping] = useState(true);
  const [swapItems, setSwapItems] = useState<
    Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
    }>
  >([]);

  const [settlementMethod, setSettlementMethod] = useState<'Cash' | 'Mobile Money' | 'Card' | 'Store Credit' | 'Even Swap'>('Mobile Money');
  const [transactionNotes, setTransactionNotes] = useState('');

  // Printable Voucher Modal
  const [selectedVoucher, setSelectedVoucher] = useState<ReturnExchangeRecord | null>(null);

  // Prepopulate return items when sale changes
  const handleSelectSale = (saleId: string) => {
    setSelectedSaleId(saleId);
    const sale = sales.find((s) => s.id === saleId);
    if (sale) {
      setCustomReceiptNumber(sale.receiptNumber);
      setCustomerName(sale.customerName || 'Walk-in Customer');
      setCustomerPhone(sale.customerPhone || '');
      setOutletId(sale.outletId);

      // Populate default returnable item from the sale
      if (sale.items.length > 0) {
        const first = sale.items[0];
        setReturnItems([
          {
            productId: first.productId,
            productName: first.product.name,
            sku: first.product.sku,
            quantity: 1,
            unitPrice: first.unitPrice,
            reason: 'Wrong Specification / Color',
            disposition: 'RESTOCK',
            conditionNotes: 'Box opened, fixture uninstalled and in brand new working order.',
          },
        ]);
      }
    }
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesOutlet = outletFilter === 'all' || r.outletId === outletFilter;
      const matchesType = typeFilter === 'ALL' || r.type === typeFilter;
      const matchesSearch =
        r.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.originalReceiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerPhone.includes(searchTerm);
      return matchesOutlet && matchesType && matchesSearch;
    });
  }, [records, outletFilter, typeFilter, searchTerm]);

  // Aggregate Metrics
  const totalSwapsCount = useMemo(() => records.filter((r) => r.type === 'EXCHANGE_SWAP').length, [records]);
  const totalPureReturnsCount = useMemo(() => records.filter((r) => r.type === 'RETURN_REFUND').length, [records]);
  const totalReturnedValue = useMemo(() => records.reduce((s, r) => s + r.returnedSubtotal, 0), [records]);
  const totalSwappedValue = useMemo(() => records.reduce((s, r) => s + r.swappedSubtotal, 0), [records]);

  // Calculations for current form
  const currentReturnSubtotal = useMemo(() => {
    return returnItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [returnItems]);

  const currentSwapSubtotal = useMemo(() => {
    if (!isSwapping) return 0;
    return swapItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [isSwapping, swapItems]);

  const netDifference = currentSwapSubtotal - currentReturnSubtotal;

  // Open modal with initial values
  const handleOpenModal = () => {
    if (sales.length > 0) {
      handleSelectSale(sales[0].id);
    } else {
      const defaultProd = products[0];
      setReturnItems([
        {
          productId: defaultProd?.id || '',
          productName: defaultProd?.name || 'Fixture',
          sku: defaultProd?.sku || 'SKU-01',
          quantity: 1,
          unitPrice: defaultProd?.retailPrice || 100,
          reason: 'Wrong Specification / Color',
          disposition: 'RESTOCK',
          conditionNotes: 'Box intact, architect altered room requirements.',
        },
      ]);
    }

    // Default replacement product
    const replacementProd = products[1] || products[0];
    setSwapItems([
      {
        productId: replacementProd?.id || '',
        quantity: 1,
        unitPrice: replacementProd?.retailPrice || 110,
      },
    ]);
    setIsSwapping(true);
    setModalOpen(true);
  };

  // Submit Return or Swap
  const handleSubmitReturnOrSwap = (e: React.FormEvent) => {
    e.preventDefault();
    if (returnItems.length === 0) return;

    const matchedOutlet = outlets.find((o) => o.id === outletId) || outlets[0];
    const isExchange = isSwapping && swapItems.length > 0;
    const refPrefix = isExchange ? 'SWAP-2026' : 'RET-2026';
    const refNumber = `${refPrefix}-00${records.length + 1}`;
    const now = new Date();

    const formattedReturnedItems: ReturnedItemDetail[] = returnItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.quantity * item.unitPrice,
      reason: item.reason,
      disposition: item.disposition,
      conditionNotes: item.conditionNotes,
    }));

    const formattedSwappedItems: SwappedItemDetail[] = isExchange
      ? swapItems.map((item) => {
          const p = products.find((prod) => prod.id === item.productId);
          return {
            productId: item.productId,
            productName: p ? p.name : 'Replacement Fixture',
            sku: p ? p.sku : 'SKU-REP',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.quantity * item.unitPrice,
          };
        })
      : [];

    const newRecord: ReturnExchangeRecord = {
      id: `ret-${Date.now()}`,
      referenceNumber: refNumber,
      type: isExchange ? 'EXCHANGE_SWAP' : 'RETURN_REFUND',
      originalReceiptNumber: customReceiptNumber || 'RAD-01-OFFLINE',
      customerId: `cust-${Date.now()}`,
      customerName: customerName.trim() || 'Walk-in Customer',
      customerPhone: customerPhone.trim() || 'N/A',
      outletId: matchedOutlet.id,
      outletName: matchedOutlet.name,
      cashierName: 'Ama Serwaa',
      timestamp: `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      returnedItems: formattedReturnedItems,
      swappedItems: formattedSwappedItems,
      returnedSubtotal: currentReturnSubtotal,
      swappedSubtotal: currentSwapSubtotal,
      netDifference: netDifference,
      settlementMethod: netDifference === 0 ? 'Even Swap' : settlementMethod,
      settlementStatus: 'SETTLED',
      notes: transactionNotes.trim(),
    };

    // Calculate Stock Adjustments
    const stockAdjustments: Array<{ productId: string; quantityDelta: number; reason: string }> = [];

    // For Restocked items, increase inventory
    returnItems.forEach((ri) => {
      if (ri.disposition === 'RESTOCK') {
        stockAdjustments.push({
          productId: ri.productId,
          quantityDelta: ri.quantity, // + adds back to inventory
          reason: `Customer return restock [Ref: ${refNumber}]`,
        });
      }
    });

    // For Swapped items, decrease inventory
    if (isExchange) {
      swapItems.forEach((si) => {
        stockAdjustments.push({
          productId: si.productId,
          quantityDelta: -si.quantity, // - deducts from inventory
          reason: `Customer exchange swap deduction [Ref: ${refNumber}]`,
        });
      });
    }

    onAddRecord(newRecord, stockAdjustments);
    setModalOpen(false);
    setSelectedVoucher(newRecord);
  };

  // Export CSV
  const handleExportCsv = () => {
    const filename = `returns_exchanges_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'Reference #',
      'Transaction Type',
      'Original Receipt #',
      'Customer Name',
      'Customer Phone',
      'Outlet',
      'Returned Value (GHS)',
      'Swapped Value (GHS)',
      'Net Difference (GHS)',
      'Settlement Method',
      'Status',
      'Date & Time',
    ];

    const rows = filteredRecords.map((r) => [
      r.referenceNumber,
      r.type,
      r.originalReceiptNumber,
      r.customerName,
      r.customerPhone,
      r.outletName,
      r.returnedSubtotal.toFixed(2),
      r.swappedSubtotal.toFixed(2),
      r.netDifference.toFixed(2),
      r.settlementMethod,
      r.settlementStatus,
      r.timestamp,
    ]);

    exportToCsv(filename, headers, rows);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* 1. TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-300">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Goods Returns &amp; Swaps (Exchanges)
            </h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
              Inventory Reconciled
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Process customer goods returns, product swaps with price difference balancing, and automated stock restocks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-white shadow-xs transition-all cursor-pointer hover:opacity-95"
            style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Process Return or Swap</span>
          </button>
        </div>
      </div>

      {/* 2. SUMMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Swaps & Exchanges */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold tracking-wide uppercase">Swaps &amp; Exchanges</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <RefreshCw className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-purple-700 font-mono">{totalSwapsCount} Swaps</div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">
              Replacement merchandise provided
            </div>
          </div>
        </div>

        {/* Pure Returns (Refunds) */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold tracking-wide uppercase">Refunds Processed</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {totalPureReturnsCount} Returns
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">
              Direct refund or store credit
            </div>
          </div>
        </div>

        {/* Total Returned Goods Value */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold tracking-wide uppercase">Returned Value</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-600 font-mono">
              GH₵ {totalReturnedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">
              Credited to customers
            </div>
          </div>
        </div>

        {/* Swapped Out Merchandise */}
        <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold tracking-wide uppercase">Swapped Outflow</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600 font-mono">
              GH₵ {totalSwappedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium mt-1">
              New replacement merchandise
            </div>
          </div>
        </div>
      </div>

      {/* 3. FILTERS & SEARCH */}
      <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by reference # (SWAP/RET), receipt #, customer, or phone..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {(['ALL', 'EXCHANGE_SWAP', 'RETURN_REFUND'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                typeFilter === t
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'ALL'
                ? 'All Logs'
                : t === 'EXCHANGE_SWAP'
                ? 'Swaps & Exchanges'
                : 'Pure Returns'}
            </button>
          ))}
        </div>

        <select
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-700 focus:outline-hidden"
        >
          <option value="all">All Outlets</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {/* 4. TRANSACTIONS LEDGER TABLE */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 border-b border-slate-300 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Ref # / Date</th>
                <th className="py-3 px-4">Original Sale / Customer</th>
                <th className="py-3 px-4">Returned Item(s)</th>
                <th className="py-3 px-4">Swapped / Replacement Item(s)</th>
                <th className="py-3 px-4 text-right">Net Financial Balance</th>
                <th className="py-3 px-4 text-center">Voucher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No returns or swap records match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono">
                      <div className="font-bold text-slate-900">{record.referenceNumber}</div>
                      <div className="text-[10px] text-slate-400">{record.timestamp}</div>
                      <span
                        className={`inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.2 rounded-md ${
                          record.type === 'EXCHANGE_SWAP'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {record.type === 'EXCHANGE_SWAP' ? 'Exchange / Swap' : 'Return & Refund'}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{record.customerName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Receipt: {record.originalReceiptNumber}
                      </div>
                      <div className="text-[10px] text-slate-400">{record.outletName}</div>
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      {record.returnedItems.map((item, i) => (
                        <div key={i} className="mb-1 text-xs">
                          <span className="font-bold text-slate-800">
                            {item.quantity}× {item.productName}
                          </span>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                            <span>Reason: {item.reason}</span>
                            <span>•</span>
                            <span
                              className={`font-bold ${
                                item.disposition === 'RESTOCK' ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {item.disposition === 'RESTOCK' ? 'Restocked' : 'Write-Off'}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="font-mono text-[11px] text-rose-600 font-bold mt-0.5">
                        Credit: GH₵ {record.returnedSubtotal.toFixed(2)}
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      {record.swappedItems.length === 0 ? (
                        <span className="text-slate-400 text-[11px]">No swap items (Refund only)</span>
                      ) : (
                        record.swappedItems.map((item, i) => (
                          <div key={i} className="mb-1 text-xs">
                            <span className="font-bold text-slate-800">
                              {item.quantity}× {item.productName}
                            </span>
                            <div className="text-[10px] text-slate-400 font-mono">
                              GH₵ {item.lineTotal.toFixed(2)}
                            </div>
                          </div>
                        ))
                      )}
                      {record.swappedItems.length > 0 && (
                        <div className="font-mono text-[11px] text-emerald-600 font-bold mt-0.5">
                          Total Swapped: GH₵ {record.swappedSubtotal.toFixed(2)}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-mono">
                      {record.netDifference > 0 ? (
                        <div>
                          <div className="font-bold text-emerald-700">
                            + GH₵ {record.netDifference.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Customer paid via {record.settlementMethod}
                          </div>
                        </div>
                      ) : record.netDifference < 0 ? (
                        <div>
                          <div className="font-bold text-rose-600">
                            - GH₵ {Math.abs(record.netDifference).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Store refunded via {record.settlementMethod}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-bold text-slate-800">GH₵ 0.00</div>
                          <div className="text-[10px] text-emerald-600 font-bold">Even Swap</div>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedVoucher(record)}
                        className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                        title="Print Official Return/Swap Voucher"
                      >
                        Voucher
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. MODAL: PROCESS RETURN OR SWAP */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card max-h-[92vh] flex flex-col">
            <div className="px-6 py-5 sm:px-8 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center">
                  <ArrowRightLeft className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-black text-xl leading-tight">Process Goods Return &amp; Swap</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Return goods to stock, replace with alternate fixtures, and reconcile payment difference
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitReturnOrSwap} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              {/* Section 1: Original Receipt & Customer */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-300 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-orange-500" />
                  <span>1. Original Purchase Reference</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-1.5">
                      Choose from Recent Sale:
                    </label>
                    <select
                      value={selectedSaleId}
                      onChange={(e) => handleSelectSale(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-medium text-slate-900"
                    >
                      {sales.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.receiptNumber} - {s.customerName || 'Walk-in'} (GH₵ {s.total.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-1.5">
                      Receipt Number:
                    </label>
                    <input
                      type="text"
                      value={customReceiptNumber}
                      onChange={(e) => setCustomReceiptNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-mono text-slate-900"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-1.5">
                      Customer Name &amp; Phone:
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer Name"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 text-slate-900"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Items Being Returned */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-rose-500" />
                    <span>2. Items Being Returned by Customer</span>
                  </h4>
                  <span className="text-sm font-mono font-black text-rose-600">
                    Return Credit: GH₵ {currentReturnSubtotal.toFixed(2)}
                  </span>
                </div>

                {returnItems.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-300 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-bold text-slate-800 mb-1.5">
                          Product Returned:
                        </label>
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const p = products.find((prod) => prod.id === e.target.value);
                            const updated = [...returnItems];
                            updated[idx] = {
                              ...updated[idx],
                              productId: e.target.value,
                              productName: p ? p.name : item.productName,
                              unitPrice: p ? p.retailPrice : item.unitPrice,
                            };
                            setReturnItems(updated);
                          }}
                          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 text-slate-900"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (GH₵ {p.retailPrice.toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-bold text-slate-800 mb-1.5">
                            Qty:
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...returnItems];
                              updated[idx].quantity = parseInt(e.target.value) || 1;
                              setReturnItems(updated);
                            }}
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-center font-mono font-bold text-slate-900"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-slate-800 mb-1.5">
                            Unit Price:
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => {
                              const updated = [...returnItems];
                              updated[idx].unitPrice = parseFloat(e.target.value) || 0;
                              setReturnItems(updated);
                            }}
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-right font-mono font-bold text-slate-900"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-bold text-slate-800 mb-1.5">
                          Return Reason:
                        </label>
                        <select
                          value={item.reason}
                          onChange={(e) => {
                            const updated = [...returnItems];
                            updated[idx].reason = e.target.value as ReturnReason;
                            setReturnItems(updated);
                          }}
                          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 text-slate-900"
                        >
                          {RETURN_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-800 mb-1.5">
                          Stock Disposition:
                        </label>
                        <select
                          value={item.disposition}
                          onChange={(e) => {
                            const updated = [...returnItems];
                            updated[idx].disposition = e.target.value as ReturnDisposition;
                            setReturnItems(updated);
                          }}
                          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 font-bold text-slate-900"
                        >
                          <option value="RESTOCK">✓ Restock Into Inventory (Increases Stock)</option>
                          <option value="DAMAGED_WRITE_OFF">⚠ Damaged / Write-Off (Do Not Restock)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={item.conditionNotes}
                        onChange={(e) => {
                          const updated = [...returnItems];
                          updated[idx].conditionNotes = e.target.value;
                          setReturnItems(updated);
                        }}
                        placeholder="Condition notes / inspection findings..."
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 text-slate-900"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Section 3: Swapping Goods (Replacement) */}
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="toggleSwap"
                      checked={isSwapping}
                      onChange={(e) => setIsSwapping(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer"
                    />
                    <label
                      htmlFor="toggleSwap"
                      className="text-xs font-black uppercase tracking-wider text-slate-700 cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-4 h-4 text-purple-500" />
                      <span>3. Customer is Swapping for Replacement Goods</span>
                    </label>
                  </div>
                  {isSwapping && (
                    <span className="text-sm font-mono font-black text-emerald-600">
                      Swapped Total: GH₵ {currentSwapSubtotal.toFixed(2)}
                    </span>
                  )}
                </div>

                {isSwapping && (
                  <div className="bg-purple-50/50 p-5 rounded-xl border border-purple-200 space-y-3">
                    {swapItems.map((item, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const p = products.find((prod) => prod.id === e.target.value);
                            const updated = [...swapItems];
                            updated[idx] = {
                              ...updated[idx],
                              productId: e.target.value,
                              unitPrice: p ? p.retailPrice : 100,
                            };
                            setSwapItems(updated);
                          }}
                          className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 text-slate-900"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (GH₵ {p.retailPrice.toFixed(2)})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...swapItems];
                              updated[idx].quantity = parseInt(e.target.value) || 1;
                              setSwapItems(updated);
                            }}
                            className="w-20 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-center font-mono font-bold text-slate-900"
                            title="Quantity"
                          />

                          <span className="text-sm font-mono font-bold text-slate-900 w-28 text-right shrink-0">
                            GH₵ {(item.quantity * item.unitPrice).toFixed(2)}
                          </span>

                          {swapItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSwapItems(swapItems.filter((_, i) => i !== idx))}
                              className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setSwapItems([
                          ...swapItems,
                          {
                            productId: products[0]?.id || '',
                            quantity: 1,
                            unitPrice: products[0]?.retailPrice || 100,
                          },
                        ])
                      }
                      className="text-sm font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1.5 cursor-pointer pt-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Another Replacement Fixture</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Section 4: Settlement Reconciliation */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-300 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  4. Financial Settlement &amp; Net Reconciliation
                </h4>

                <div className="p-4 rounded-xl bg-white border border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      Returned Value:{' '}
                      <strong className="text-rose-600 font-mono">GH₵ {currentReturnSubtotal.toFixed(2)}</strong> |
                      Replacement Value:{' '}
                      <strong className="text-emerald-600 font-mono">GH₵ {currentSwapSubtotal.toFixed(2)}</strong>
                    </div>

                    <div className="text-base font-black mt-1">
                      {netDifference > 0 ? (
                        <span className="text-emerald-700">
                          Customer Owes Difference: + GH₵ {netDifference.toFixed(2)}
                        </span>
                      ) : netDifference < 0 ? (
                        <span className="text-rose-600">
                          Store Refund to Customer: - GH₵ {Math.abs(netDifference).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-800">Even Swap (No Difference Due)</span>
                      )}
                    </div>
                  </div>

                  {netDifference !== 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold text-slate-700 shrink-0">
                        {netDifference > 0 ? 'Customer Pays Via:' : 'Refund Method:'}
                      </label>
                      <select
                        value={settlementMethod}
                        onChange={(e) => setSettlementMethod(e.target.value as any)}
                        className="px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800 focus:outline-orange-500"
                      >
                        <option value="Mobile Money">Mobile Money (MoMo)</option>
                        <option value="Cash">Cash (Drawer Float)</option>
                        <option value="Card">Card POS</option>
                        <option value="Store Credit">Store Credit Voucher</option>
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    value={transactionNotes}
                    onChange={(e) => setTransactionNotes(e.target.value)}
                    placeholder="Transaction authorization notes or comments..."
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-orange-500 text-slate-900"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex flex-col sm:flex-row items-center justify-end gap-3 shrink-0 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-black text-white rounded-lg shadow-xs transition-all cursor-pointer hover:opacity-95"
                  style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
                >
                  Confirm &amp; Execute Inventory Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: PRINTABLE OFFICIAL RETURN & SWAP VOUCHER */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card p-6 sm:p-8 space-y-5 font-mono text-sm">
            <div className="text-center border-b border-dashed border-slate-300 pb-4 space-y-1.5 font-sans">
              <h3 className="font-black text-lg text-slate-900">RADIANCE LIGHTING</h3>
              <p className="text-xs text-slate-500">Showroom East Legon • Accra, Ghana</p>
              <div className="text-xs bg-slate-100 px-3 py-1 rounded-full inline-block font-mono font-bold text-slate-800">
                {selectedVoucher.type === 'EXCHANGE_SWAP'
                  ? 'MERCHANDISE EXCHANGE & SWAP VOUCHER'
                  : 'GOODS RETURN & REFUND RECEIPT'}
              </div>
            </div>

            <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Voucher #:</span>
                <span className="font-bold text-slate-900">{selectedVoucher.referenceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Original Receipt #:</span>
                <span className="text-slate-800">{selectedVoucher.originalReceiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Customer:</span>
                <span className="font-bold text-slate-900">{selectedVoucher.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Date:</span>
                <span className="text-slate-700">{selectedVoucher.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Cashier:</span>
                <span className="text-slate-700">{selectedVoucher.cashierName}</span>
              </div>
            </div>

            {/* Returned Lines */}
            <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
              <div className="font-sans font-bold text-rose-600 text-xs uppercase">
                [ - ] Returned Goods Credited:
              </div>
              {selectedVoucher.returnedItems.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {item.quantity}× {item.productName}
                  </span>
                  <span className="font-bold">GH₵ {item.lineTotal.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-rose-600 pt-1">
                <span className="font-sans">Returned Subtotal:</span>
                <span>- GH₵ {selectedVoucher.returnedSubtotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Swapped Lines */}
            {selectedVoucher.swappedItems.length > 0 && (
              <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
                <div className="font-sans font-bold text-emerald-600 text-xs uppercase">
                  [ + ] Replacement Goods Issued:
                </div>
                {selectedVoucher.swappedItems.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {item.quantity}× {item.productName}
                    </span>
                    <span className="font-bold">GH₵ {item.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-emerald-600 pt-1">
                  <span className="font-sans">Replacement Subtotal:</span>
                  <span>+ GH₵ {selectedVoucher.swappedSubtotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Net Balance */}
            <div className="space-y-2 border-b border-dashed border-slate-300 pb-4">
              <div className="flex justify-between font-black text-base">
                <span className="font-sans">NET SETTLEMENT:</span>
                <span>
                  {selectedVoucher.netDifference > 0
                    ? `+ GH₵ ${selectedVoucher.netDifference.toFixed(2)}`
                    : selectedVoucher.netDifference < 0
                    ? `- GH₵ ${Math.abs(selectedVoucher.netDifference).toFixed(2)}`
                    : 'GH₵ 0.00 (EVEN)'}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 text-xs">
                <span className="font-sans">Settled via:</span>
                <span className="font-bold">{selectedVoucher.settlementMethod}</span>
              </div>
            </div>

            <div className="text-center text-xs text-slate-500 font-sans space-y-1 pt-1">
              <p>Inventory counts updated automatically.</p>
              <p className="text-[11px] text-slate-400">Radiance Lighting • Verified Customer Service</p>
            </div>

            <div className="flex items-center gap-3 pt-3 font-sans">
              <button
                onClick={() => setSelectedVoucher(null)}
                className="flex-1 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black text-white rounded-lg shadow-xs cursor-pointer"
                style={{ backgroundColor: accentColor || 'var(--accent, #c55200)' }}
              >
                <Printer className="w-4 h-4" />
                <span>Print Voucher</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
