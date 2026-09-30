import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRightLeft,
  BarChart3,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Package,
  RotateCcw,
  Search,
  ShieldAlert,
  Sliders,
  Truck,
} from 'lucide-react';
import { InfoHint } from './InfoHint';
import { TablePagination } from './TablePagination';
import { Outlet, Product, StockMovement } from '../types';
import type { PermissionSet } from '../permissions';
import {
  downloadStockCountCsv,
  downloadStockCountPdf,
  type StockCountSheetMeta,
  type StockCountSheetRow,
} from '../stockCountSheet';

type InventoryMode = 'stock' | 'low-stock' | 'valuation' | 'exceptions' | 'count' | 'transfer';

interface InventoryViewProps {
  products: Product[];
  movements: StockMovement[];
  currentOutlet: Outlet;
  outlets: Outlet[];
  mode?: InventoryMode;
  onOpenGoodsReceipt: (productId?: string) => void;
  onOpenAdjustment: (product: Product) => void;
  permissions: PermissionSet;
}

const formatMoney = (amount: number) => `GH₵ ${amount.toFixed(2)}`;

const newCountReference = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  return `COUNT-${date}-${time}`;
};

const productOutletKey = (product: Product, outlet: Outlet) =>
  product.outletId || (outlet.id === 'all-outlets' ? Object.keys(product.stock)[0] : outlet.id);

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  movements,
  currentOutlet,
  outlets,
  mode = 'stock',
  onOpenGoodsReceipt,
  onOpenAdjustment,
  permissions,
}) => {
  const canViewCost = permissions.has('price.view_cost');
  const canViewValuation = permissions.has('report.view_profit');
  const [activeMode, setActiveMode] = useState<InventoryMode>(mode);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [countSession, setCountSession] = useState(false);
  const [countReview, setCountReview] = useState(false);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [countOutletId, setCountOutletId] = useState(() => currentOutlet.id === 'all-outlets' ? '' : currentOutlet.id);
  const [countReference, setCountReference] = useState(newCountReference);
  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [countedBy, setCountedBy] = useState('');
  const [countNotes, setCountNotes] = useState('');
  const [countSearch, setCountSearch] = useState('');
  const [countError, setCountError] = useState('');
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferProduct, setTransferProduct] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(25);
  const realOutlets = outlets.filter((outlet) => outlet.id !== 'all-outlets');

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  useEffect(() => {
    if (!countSession) setCountOutletId(currentOutlet.id === 'all-outlets' ? '' : currentOutlet.id);
  }, [countSession, currentOutlet.id]);

  const scopedProducts = useMemo(
    () =>
      products.filter((product) => {
        if (currentOutlet.id !== 'all-outlets' && product.outletId && product.outletId !== 'all-outlets' && product.outletId !== currentOutlet.id) {
          return false;
        }
        const haystack = `${product.name} ${product.sku} ${product.category} ${product.brand}`.toLowerCase();
        return searchTerm
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
          .every((term) => haystack.includes(term));
      }),
    [currentOutlet.id, products, searchTerm]
  );

  const inventoryRows = scopedProducts.map((product) => {
    const key = productOutletKey(product, currentOutlet);
    const quantity = product.stock[key] || 0;
    const reorder = product.minStockAlert[key] || 0;
    const avgCost = product.costPrice[key] || 0;
    return {
      product,
      key,
      quantity,
      reorder,
      avgCost,
      value: quantity * avgCost,
      shortfall: Math.max(0, reorder - quantity),
      low: quantity <= reorder,
    };
  });

  const lowRows = inventoryRows.filter((row) => row.low);
  const valuationTotal = inventoryRows.reduce((sum, row) => sum + row.value, 0);
  const exceptionRows = movements.filter((movement) => {
    const largeAdjustment = Math.abs(movement.quantity * (movement.unitCost || 0)) >= 1000;
    const writeOff = ['DAMAGE', 'LOSS', 'ADJUSTMENT_OUT'].includes(movement.type);
    const oversell = movement.newStock < 0;
    const outletMatches = currentOutlet.id === 'all-outlets' || movement.outletId === currentOutlet.id;
    return outletMatches && (largeAdjustment || writeOff || oversell);
  });

  const countRows = useMemo(() => {
    const needle = countSearch.trim().toLowerCase();
    return products
      .filter((product) => product.active)
      .filter((product) => !countOutletId
        || !product.outletId
        || product.outletId === 'all-outlets'
        || product.outletId === countOutletId)
      .filter((product) => !needle || `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(needle))
      .map((product) => ({
        product,
        quantity: countOutletId ? product.stock[countOutletId] || 0 : 0,
        key: `${product.id}-${countOutletId}`,
      }));
  }, [countOutletId, countSearch, products]);

  const allCountRows = useMemo(() => products
    .filter((product) => product.active)
    .filter((product) => !countOutletId
      || !product.outletId
      || product.outletId === 'all-outlets'
      || product.outletId === countOutletId)
    .map((product) => ({
      product,
      quantity: countOutletId ? product.stock[countOutletId] || 0 : 0,
      key: `${product.id}-${countOutletId}`,
    })), [countOutletId, products]);

  const completedCounts = allCountRows.filter((row) => {
    const value = counted[row.key];
    return value !== '' && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0;
  }).length;
  const stockCountRows: StockCountSheetRow[] = allCountRows.map((row) => {
    const countedQuantity = Number(counted[row.key]);
    return {
      sku: row.product.sku,
      product: row.product.name,
      category: row.product.category,
      systemQuantity: row.quantity,
      countedQuantity,
      variance: countedQuantity - row.quantity,
      unit: row.product.baseUnit,
    };
  });
  const countSummary = stockCountRows.reduce((summary, row) => {
    if (row.variance > 0) summary.over += 1;
    else if (row.variance < 0) summary.short += 1;
    else summary.matched += 1;
    summary.netVariance += row.variance;
    return summary;
  }, { over: 0, short: 0, matched: 0, netVariance: 0 });
  const countMeta: StockCountSheetMeta = {
    reference: countReference.trim(),
    outlet: realOutlets.find((outlet) => outlet.id === countOutletId)?.name || countOutletId,
    countDate,
    countedBy: countedBy.trim(),
    notes: countNotes.trim(),
  };

  const title =
    activeMode === 'low-stock'
      ? 'Low Stock'
      : activeMode === 'valuation'
      ? 'Inventory Valuation'
      : activeMode === 'exceptions'
      ? 'Inventory Exceptions'
      : activeMode === 'count'
      ? 'Stock Count'
      : activeMode === 'transfer'
      ? 'Stock Transfer'
      : 'Stock On Hand';

  const startCount = (event: React.FormEvent) => {
    event.preventDefault();
    if (!countOutletId || !countReference.trim() || !countDate || !countedBy.trim()) return;
    setCountSession(true);
    setCountReview(false);
    setCounted({});
    setCountSearch('');
    setCountError('');
  };
  const reviewCount = () => {
    if (completedCounts !== allCountRows.length) {
      setCountError(`Enter a physical quantity for all ${allCountRows.length} products. ${allCountRows.length - completedCounts} remain.`);
      return;
    }
    setCountError('');
    setCountReview(true);
  };
  const resetCount = () => {
    setCountSession(false);
    setCountReview(false);
    setCounted({});
    setCountSearch('');
    setCountError('');
    setCountReference(newCountReference());
    setCountDate(new Date().toISOString().slice(0, 10));
  };
  const submitTransfer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!transferFrom || !transferTo || transferFrom === transferTo || !transferProduct || Number(transferQuantity) <= 0) return;
    setTransferMessage(`Transfer draft created for ${transferQuantity} units. It is ready for despatch approval.`);
    setTransferQuantity('');
  };

  const renderStockTable = (rows = inventoryRows) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-black border-b border-slate-200 uppercase text-[10px] tracking-wide">
            <tr>
              <th className="py-3 px-4">Product</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4 text-right">Quantity</th>
              <th className="py-3 px-4 text-right">Reorder</th>
              {canViewCost && <th className="py-3 px-4 text-right">Average Cost</th>}
              {canViewCost && <th className="py-3 px-4 text-right">Value</th>}
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice((stockPage - 1) * stockPageSize, stockPage * stockPageSize).map((row) => (
              <tr key={`${row.product.id}-${row.key}`} className="hover:bg-slate-50">
                <td className="py-3 px-4">
                  <button onClick={() => setSelectedProduct(row.product)} className="font-bold text-slate-800 text-left hover:text-accent-600">
                    {row.product.name}
                  </button>
                  <div className="font-mono text-[10px] text-slate-400">{row.product.sku}</div>
                </td>
                <td className="py-3 px-4 text-slate-600">{row.product.category}</td>
                <td className="py-3 px-4 text-right font-black text-slate-900">{row.quantity} {row.product.baseUnit}</td>
                <td className="py-3 px-4 text-right text-slate-500">{row.reorder} {row.product.baseUnit}</td>
                {canViewCost && <td className="py-3 px-4 text-right font-mono text-slate-600">{formatMoney(row.avgCost)}</td>}
                {canViewCost && <td className="py-3 px-4 text-right font-black text-slate-900">{formatMoney(row.value)}</td>}
                <td className="py-3 px-4 text-center">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 border text-[10px] font-black ${row.low ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {row.low ? 'Low stock' : 'OK'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => setSelectedProduct(row.product)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="View stock detail">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onOpenGoodsReceipt(row.product.id)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Receive stock">
                      <Truck className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onOpenAdjustment(row.product)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Adjust stock">
                      <Sliders className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-14 text-center">
                  <Package className="w-10 h-10 mx-auto text-slate-300" />
                  <div className="mt-3 text-sm font-black text-slate-900">No inventory rows match</div>
                  <button onClick={() => setSearchTerm('')} className="mt-1 text-xs font-bold text-accent-600 hover:underline">Clear search</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePagination page={stockPage} pageSize={stockPageSize} total={rows.length} onPageChange={setStockPage} onPageSizeChange={setStockPageSize} />
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{title}</h1><InfoHint text="Outlet-scoped stock position, movement-backed balances, valuation and exception review." /></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onOpenGoodsReceipt()} className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-2">
            <Truck className="w-4 h-4 text-accent-400" /> Receive Stock
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs flex gap-1 overflow-x-auto">
        {[
          ['stock', 'Stock On Hand'],
          ['low-stock', 'Low Stock'],
          ...(canViewValuation ? [['valuation', 'Valuation']] : []),
          ['exceptions', 'Exceptions'],
          ['count', 'Stock Count'],
          ['transfer', 'Transfer'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveMode(value as InventoryMode)}
            className={`px-3.5 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-colors ${
              activeMode === value
                ? 'bg-accent-500 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {['stock', 'low-stock', 'valuation'].includes(activeMode) && (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search product, SKU, category or brand..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-accent-500"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-slate-400">Items</div>
              <div className="text-sm font-black text-slate-900">{inventoryRows.length}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-slate-400">Low</div>
              <div className="text-sm font-black text-amber-700">{lowRows.length}</div>
            </div>
            {canViewCost && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <div className="text-[10px] font-black uppercase text-slate-400">Value</div>
                <div className="text-sm font-black text-slate-900">{formatMoney(valuationTotal)}</div>
              </div>
            )}
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <div className="text-[10px] font-black uppercase text-slate-400">Outlet</div>
              <div className="text-sm font-black text-slate-900">{currentOutlet.id === 'all-outlets' ? 'All' : currentOutlet.name}</div>
            </div>
          </div>
        </div>
      )}

      {activeMode === 'stock' && renderStockTable()}

      {activeMode === 'low-stock' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-black text-amber-900">Reorder queue</div>
              <p className="text-xs text-amber-800 mt-0.5">Grouped supplier data needs supplier-product links; this view uses category grouping until that model is connected.</p>
            </div>
          </div>
          {renderStockTable(lowRows)}
        </div>
      )}

      {activeMode === 'valuation' && !canViewValuation && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Inventory valuation requires the <code className="font-mono text-xs">report.view_profit</code> permission.
        </div>
      )}

      {activeMode === 'valuation' && canViewValuation && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {realOutlets.map((outlet) => {
              const total = products.reduce((sum, product) => {
                const qty = product.stock[outlet.id] || 0;
                const cost = product.costPrice[outlet.id] || 0;
                return sum + qty * cost;
              }, 0);
              return (
                <div key={outlet.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                  <div className="text-xs font-black uppercase text-slate-400">{outlet.name}</div>
                  <div className="mt-1 text-2xl font-black text-slate-900">{formatMoney(total)}</div>
                  <div className="mt-2 text-xs text-slate-500">{products.filter((product) => product.stock[outlet.id] !== undefined).length} stocked items</div>
                </div>
              );
            })}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-xs text-white">
              <div className="text-xs font-black uppercase text-slate-400">Combined</div>
              <div className="mt-1 text-2xl font-black text-white">{formatMoney(valuationTotal)}</div>
              <div className="mt-2 text-xs text-slate-400">Weighted average cost basis</div>
            </div>
          </div>
          {renderStockTable()}
        </div>
      )}

      {activeMode === 'exceptions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-700" />
            <div>
              <h2 className="text-sm font-black text-slate-900">Exceptions Review</h2>
              <p className="text-xs text-slate-500">Oversells, large adjustments and write-offs needing review.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {exceptionRows.map((movement) => (
              <div key={movement.id} className="p-4 grid grid-cols-1 md:grid-cols-[1fr_140px_130px_160px] gap-3 items-center">
                <div>
                  <div className="font-bold text-slate-900">{movement.productName}</div>
                  <div className="text-xs text-slate-500">{movement.reason || 'No note'} / {movement.referenceNumber}</div>
                </div>
                <span className="text-xs font-black text-slate-700">{movement.type}</span>
                <span className="text-sm font-black text-slate-900">{movement.quantity > 0 ? '+' : ''}{movement.quantity}</span>
                <span className="text-xs text-slate-500">{movement.user}<br />{movement.timestamp}</span>
              </div>
            ))}
            {exceptionRows.length === 0 && (
              <div className="py-14 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
                <div className="mt-3 text-sm font-black text-slate-900">No inventory exceptions</div>
                <p className="text-xs text-slate-500 mt-1">Large adjustments, write-offs and oversells will appear here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeMode === 'count' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
          <div className="flex items-start gap-3">
            <ClipboardList className="w-6 h-6 text-accent-600" />
            <div>
              <h2 className="text-lg font-black text-slate-900">Physical Stock Count</h2>
              <p className="text-sm text-slate-500">Create a count session, record every physical quantity, review variances, then export the signed reconciliation sheet.</p>
            </div>
          </div>

          {!countSession && (
            <form onSubmit={startCount} className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Count session details</h3>
                <p className="mt-1 text-xs text-slate-500">These details appear in both the PDF and spreadsheet export.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-bold text-slate-700">Outlet *
                  <select required value={countOutletId} onChange={(event) => setCountOutletId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
                    <option value="" disabled>Select outlet</option>
                    {realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">Count reference *
                  <input required value={countReference} onChange={(event) => setCountReference(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" />
                </label>
                <label className="text-xs font-bold text-slate-700">Count date *
                  <input required type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" />
                </label>
                <label className="text-xs font-bold text-slate-700">Counted by *
                  <input required value={countedBy} onChange={(event) => setCountedBy(event.target.value)} placeholder="Full name" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" />
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-700">Notes
                <textarea value={countNotes} onChange={(event) => setCountNotes(event.target.value)} rows={2} placeholder="Area counted, shelf range, team, or special instructions" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" />
              </label>
              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-slate-500">{countOutletId ? `The selected outlet currently has ${allCountRows.length} active products to count.` : 'Select one outlet to prepare its count sheet.'}</p>
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-xs font-bold text-white"><ClipboardList className="h-4 w-4" /> Create count sheet</button>
              </div>
            </form>
          )}

          {countSession && !countReview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['Reference', countMeta.reference],
                  ['Outlet', countMeta.outlet],
                  ['Counted by', countMeta.countedBy],
                  ['Progress', `${completedCounts} / ${allCountRows.length}`],
                ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">{label}</div><div className="mt-1 truncate text-sm font-bold text-slate-800">{value}</div></div>)}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={countSearch} onChange={(event) => setCountSearch(event.target.value)} placeholder="Find product, SKU, or category" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900" />
                </div>
                <button type="button" onClick={() => setCounted(Object.fromEntries(allCountRows.map((row) => [row.key, String(row.quantity)])))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Mark all as system quantity</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">System</th><th className="px-4 py-3 text-right">Physical count</th><th className="px-4 py-3 text-right">Variance</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {countRows.map((row) => {
                      const value = counted[row.key];
                      const variance = value === undefined || value === '' ? null : Number(value) - row.quantity;
                      return <tr key={row.key} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-bold text-slate-800">{row.product.name}</div><div className="font-mono text-[10px] text-slate-400">{row.product.sku}</div></td><td className="px-4 py-3 text-slate-600">{row.product.category}</td><td className="px-4 py-3 text-right font-bold text-slate-700">{row.quantity} {row.product.baseUnit}</td><td className="px-4 py-2 text-right"><input type="number" min="0" step="any" value={value || ''} onChange={(event) => { setCounted((current) => ({ ...current, [row.key]: event.target.value })); setCountError(''); }} className="w-28 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-right text-sm font-bold text-slate-900" aria-label={`Physical count for ${row.product.name}`} /></td><td className={`px-4 py-3 text-right font-black ${variance === null || variance === 0 ? 'text-slate-500' : variance > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance} ${row.product.baseUnit}`}</td></tr>;
                    })}
                    {countRows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No products match this search.</td></tr>}
                  </tbody>
                </table>
              </div>
              {countError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">{countError}</p>}
              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
                <button type="button" onClick={resetCount} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">Cancel session</button>
                <button type="button" onClick={reviewCount} className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Review completed count</button>
              </div>
            </div>
          )}

          {countSession && countReview && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-black text-emerald-900"><CheckCircle2 className="h-5 w-5" /> Count completed and ready to export</div><p className="mt-1 text-xs text-emerald-800">Exporting documents does not change stock balances. Approved differences must still be posted through the audited adjustment workflow for the counted outlet.</p></div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['Matched', countSummary.matched, 'text-slate-900'],
                  ['Over', countSummary.over, 'text-emerald-700'],
                  ['Short', countSummary.short, 'text-rose-700'],
                  ['Net variance', `${countSummary.netVariance > 0 ? '+' : ''}${countSummary.netVariance}`, countSummary.netVariance === 0 ? 'text-slate-900' : countSummary.netVariance > 0 ? 'text-emerald-700' : 'text-rose-700'],
                ].map(([label, value, colour]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">{label}</div><div className={`mt-1 text-xl font-black ${colour}`}>{value}</div></div>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadStockCountPdf(countMeta, stockCountRows)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white"><FileText className="h-4 w-4" /> Export PDF</button>
                <button type="button" onClick={() => downloadStockCountCsv(countMeta, stockCountRows)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800"><FileSpreadsheet className="h-4 w-4" /> Export Excel / CSV</button>
                <button type="button" onClick={() => setCountReview(false)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700"><RotateCcw className="h-4 w-4" /> Edit counts</button>
                <button type="button" onClick={resetCount} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700"><Download className="h-4 w-4" /> New session</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">System</th><th className="px-4 py-3 text-right">Counted</th><th className="px-4 py-3 text-right">Variance</th></tr></thead><tbody className="divide-y divide-slate-100">{stockCountRows.map((row) => <tr key={row.sku}><td className="px-4 py-3"><div className="font-bold text-slate-800">{row.product}</div><div className="font-mono text-[10px] text-slate-400">{row.sku}</div></td><td className="px-4 py-3 text-slate-600">{row.category}</td><td className="px-4 py-3 text-right">{row.systemQuantity} {row.unit}</td><td className="px-4 py-3 text-right font-bold">{row.countedQuantity} {row.unit}</td><td className={`px-4 py-3 text-right font-black ${row.variance === 0 ? 'text-slate-500' : row.variance > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{row.variance > 0 ? '+' : ''}{row.variance} {row.unit}</td></tr>)}</tbody></table></div>
            </div>
          )}
        </div>
      )}

      {activeMode === 'transfer' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="w-6 h-6 text-accent-600" />
            <div>
              <h2 className="text-lg font-black text-slate-900">Stock Transfer</h2>
              <p className="text-sm text-slate-500">Create an outlet-to-outlet transfer draft and send it for despatch approval.</p>
            </div>
          </div>
          <form onSubmit={submitTransfer} className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-3"><div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center"><select required value={transferFrom} onChange={(event) => setTransferFrom(event.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" aria-label="Transfer source outlet"><option value="" disabled>Select source outlet</option>{realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select><ArrowDownRight className="hidden md:block w-5 h-5 text-slate-400 justify-self-center" /><select required value={transferTo} onChange={(event) => setTransferTo(event.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" aria-label="Transfer destination outlet"><option value="" disabled>Select destination outlet</option>{realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></div><div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3"><select required value={transferProduct} onChange={(event) => setTransferProduct(event.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" aria-label="Transfer product"><option value="" disabled>Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input required min="1" type="number" value={transferQuantity} onChange={(event) => setTransferQuantity(event.target.value)} placeholder="Quantity" className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" aria-label="Transfer quantity" /><button className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-bold text-white">Create draft</button></div>{transferMessage && <p className="text-xs font-bold text-emerald-700">{transferMessage}</p>}</form>
        </div>
      )}

      {selectedProduct && (
        <div className="fixed inset-0 z-70 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-modal-backdrop">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-300 flex flex-col animate-drawer-right">
            <div className="bg-slate-900 text-white px-6 py-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-white">Stock Detail</h2>
                <p className="text-xs text-slate-400 mt-1">{selectedProduct.name}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">Close</button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                {realOutlets.map((outlet) => (
                  <div key={outlet.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[10px] font-black uppercase text-slate-400">{outlet.name}</div>
                    <div className="text-xl font-black text-slate-900 mt-1">{selectedProduct.stock[outlet.id] || 0} {selectedProduct.baseUnit}</div>
                    {canViewCost && <div className="text-xs text-slate-500 mt-1">{formatMoney((selectedProduct.stock[outlet.id] || 0) * (selectedProduct.costPrice[outlet.id] || 0))}</div>}
                  </div>
                ))}
              </div>
              <section className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-black text-slate-900">Recent movements</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {movements.filter((movement) => movement.productId === selectedProduct.id).slice(0, 8).map((movement) => (
                    <div key={movement.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="font-bold text-slate-800">{movement.type}</div>
                        <div className="text-xs text-slate-500">{movement.timestamp}</div>
                      </div>
                      <div className="text-right font-black text-slate-900">{movement.quantity > 0 ? '+' : ''}{movement.quantity}</div>
                    </div>
                  ))}
                  {movements.filter((movement) => movement.productId === selectedProduct.id).length === 0 && (
                    <div className="py-10 text-center text-sm text-slate-500">No movements recorded. Receive stock to create the first movement.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
