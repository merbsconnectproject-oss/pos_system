import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRightLeft,
  BarChart3,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Eye,
  Package,
  Search,
  ShieldAlert,
  Sliders,
  Truck,
} from 'lucide-react';
import { InfoHint } from './InfoHint';
import { Outlet, Product, StockMovement } from '../types';
import type { PermissionSet } from '../permissions';

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
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferProduct, setTransferProduct] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const realOutlets = outlets.filter((outlet) => outlet.id !== 'all-outlets');

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

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

  const startCount = () => {
    setCountSession(true);
    setCounted({});
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
            {rows.map((row) => (
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
              <p className="text-sm text-slate-500">Stage 2 workflow: generate count sheet, enter counts, review variance, approve, then post batch adjustments.</p>
            </div>
          </div>
          {!countSession ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm font-bold text-slate-800">Start a count session for {inventoryRows.length} products in this scope.</p><button type="button" onClick={startCount} className="mt-4 rounded-lg bg-accent-600 px-4 py-2.5 text-xs font-bold text-white">Generate count sheet</button></div> : <div className="overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[1fr_120px_120px] bg-slate-50 px-4 py-3 text-[10px] font-black uppercase text-slate-500"><span>Product</span><span>System</span><span>Counted</span></div>{inventoryRows.slice(0, 12).map((row) => { const key = `${row.product.id}-${row.key}`; return <div key={key} className="grid grid-cols-[1fr_120px_120px] items-center border-t border-slate-100 px-4 py-2.5 text-xs"><span className="font-bold text-slate-800">{row.product.name}</span><span className="text-slate-500">{row.quantity} {row.product.baseUnit}</span><input type="number" min="0" value={counted[key] || ''} onChange={(event) => setCounted((current) => ({ ...current, [key]: event.target.value }))} className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-xs" aria-label={`Count for ${row.product.name}`} /></div>; })}<div className="flex justify-end border-t border-slate-200 p-3"><button type="button" onClick={() => setCountSession(false)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">Submit count for review</button></div></div>}
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
