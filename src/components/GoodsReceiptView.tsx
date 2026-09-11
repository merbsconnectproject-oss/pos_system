import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Package, Plus, Trash2, Undo2 } from 'lucide-react';
import { Outlet, Product, StockMovement, Supplier } from '../types';
import { formatMoney, formatQuantity, roundMoney, roundQuantity, sumMoney } from '../money';
import { matchesSearch } from '../catalogue';
import { costPerBaseUnit, weightedAverageCost } from '../stockCosting';
import { InfoHint } from './InfoHint';

/**
 * E-04 / E-05 — Receive stock.
 *
 * A goods receipt is a document with lines (FR-SUP-03), not one product at a time.
 * Confirming writes a stock movement per line and recalculates the weighted average
 * cost per outlet (BR-4, FR-SUP-04). The confirm step shows the resulting stock and
 * the old and new average cost before anything is committed (FR-SUP-05).
 */

interface ReceiptLine {
  id: string;
  productId: string;
  /** The unit goods arrive in; converted to base units on receipt (FR-UOM-05). */
  unitName: string;
  conversionFactor: number;
  quantity: number;
  unitCost: number;
}

interface GoodsReceiptViewProps {
  products: Product[];
  suppliers: Supplier[];
  currentOutlet: Outlet;
  cashierName: string;
  onCommitReceipt: (
    lines: { productId: string; quantityBase: number; unitCost: number; newAvgCost: number; movement: StockMovement }[],
    reference: string,
  ) => void;
}

const newLine = (): ReceiptLine => ({
  id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  productId: '',
  unitName: '',
  conversionFactor: 1,
  quantity: 0,
  unitCost: 0,
});

export const GoodsReceiptView: React.FC<GoodsReceiptViewProps> = ({
  products,
  suppliers,
  currentOutlet,
  cashierName,
  onCommitReceipt,
}) => {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [reference, setReference] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<ReceiptLine[]>([newLine()]);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);

  const outletKey = currentOutlet.id;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const stockedProducts = useMemo(
    () => products.filter((p) => p.active && (!p.outletId || p.outletId === 'all-outlets' || p.outletId === outletKey)),
    [products, outletKey],
  );

  const updateLine = (id: string, changes: Partial<ReceiptLine>) =>
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...changes } : line)));

  const completeLines = lines.filter((line) => line.productId && line.quantity > 0);
  const runningTotal = sumMoney(completeLines.map((line) => roundMoney(line.quantity * line.unitCost)));

  /** BR-4: new_avg = ((on_hand × current_avg) + (received × unit_cost)) ÷ (on_hand + received) */
  const preview = completeLines.map((line) => {
    const product = productById.get(line.productId)!;
    const quantityBase = roundQuantity(line.quantity * line.conversionFactor);
    const onHand = product.stock[outletKey] || 0;
    const currentAvg = product.costPrice[outletKey] || 0;
    // The cost is per purchase unit, so convert it to a per-base-unit cost first.
    const costPerBase = costPerBaseUnit(line.unitCost, line.conversionFactor);
    const newAvg = weightedAverageCost(onHand, currentAvg, quantityBase, costPerBase);
    return { line, product, quantityBase, onHand, currentAvg, newAvg, resultingStock: roundQuantity(onHand + quantityBase) };
  });

  const commit = () => {
    const ref = reference.trim() || `GRN-${Date.now().toString().slice(-6)}`;
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || 'Unknown supplier';
    const timestamp = new Date().toLocaleString('en-GB');
    onCommitReceipt(
      preview.map((row) => ({
        productId: row.product.id,
        quantityBase: row.quantityBase,
        unitCost: row.line.unitCost,
        newAvgCost: row.newAvg,
        movement: {
          id: `mov-${Date.now()}-${row.product.id}`,
          timestamp,
          outletId: outletKey,
          productId: row.product.id,
          productName: row.product.name,
          type: 'RECEIPT',
          quantity: row.quantityBase,
          previousStock: row.onHand,
          newStock: row.resultingStock,
          unitCost: row.line.conversionFactor > 0 ? row.line.unitCost / row.line.conversionFactor : row.line.unitCost,
          referenceNumber: ref,
          reason: `Goods received from ${supplierName}`,
          user: cashierName,
        },
      })),
      ref,
    );
    setPosted(ref);
    setConfirming(false);
  };

  const reset = () => {
    setLines([newLine()]);
    setReference('');
    setPosted(null);
  };

  // E-06: done.
  if (posted) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <ClipboardCheck className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-4 text-xl font-black text-emerald-900">Goods receipt posted</h1>
          <p className="mt-2 text-sm text-emerald-800">
            Reference <span className="font-mono font-bold">{posted}</span> — stock and weighted average cost
            updated at {currentOutlet.name}.
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            A confirmed receipt cannot be edited; it is reversed by a correcting document (FR-SUP-06).
          </p>
          <button
            onClick={reset}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Receive more stock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6 animate-fade-in">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-micro-caps text-accent-700">Inventory</p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900">Receive stock</h1>
            <InfoHint text="Goods are received into one outlet. Confirming writes a movement per line and recalculates weighted average cost." />
          </div>
          <p className="mt-1 text-xs text-slate-500">Receiving into {currentOutlet.name}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Running total</p>
          <p className="text-2xl font-black text-slate-900">{formatMoney(runningTotal)}</p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-700">
          Supplier
          <select
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900"
          >
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Supplier reference
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Invoice or waybill number"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-700">
          Received on
          <input
            type="date"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-sm font-black text-slate-900">Receipt lines</h2>
          <button
            onClick={() => setLines((prev) => [...prev, newLine()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add line
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {lines.map((line, index) => {
            const product = line.productId ? productById.get(line.productId) : undefined;
            const query = search[line.id] || '';
            const matches = query.trim()
              ? stockedProducts.filter((item) => matchesSearch(item, query)).slice(0, 6)
              : [];
            const units = product?.sellingUnits?.length
              ? product.sellingUnits
              : product
              ? [{ name: product.baseUnit, conversionFactor: 1, price: product.retailPrice }]
              : [];
            return (
              <div key={line.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Line {index + 1}
                  </span>
                  {lines.length > 1 && (
                    <button
                      onClick={() => setLines((prev) => prev.filter((item) => item.id !== line.id))}
                      className="inline-flex items-center gap-1 text-xs font-bold text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                  <div className="relative lg:col-span-5">
                    <label className="text-xs font-bold text-slate-700">Product</label>
                    {product ? (
                      <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{product.name}</p>
                          <p className="font-mono text-[10px] text-slate-500">
                            {product.sku} · on hand {formatQuantity(product.stock[outletKey] || 0)} {product.baseUnit}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            updateLine(line.id, { productId: '', unitName: '', conversionFactor: 1 });
                            setSearch((prev) => ({ ...prev, [line.id]: '' }));
                          }}
                          className="ml-2 shrink-0 text-xs font-bold text-slate-500 hover:text-slate-800"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          value={query}
                          onChange={(event) => setSearch((prev) => ({ ...prev, [line.id]: event.target.value }))}
                          placeholder="Search name, SKU or barcode"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                        />
                        {matches.length > 0 && (
                          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg">
                            {matches.map((item) => {
                              const defaultUnit =
                                item.sellingUnits?.find((unit) => unit.conversionFactor > 1) ||
                                item.sellingUnits?.[0];
                              return (
                                <li key={item.id}>
                                  <button
                                    onClick={() => {
                                      updateLine(line.id, {
                                        productId: item.id,
                                        unitName: defaultUnit?.name || item.baseUnit,
                                        conversionFactor: defaultUnit?.conversionFactor || 1,
                                        unitCost: roundMoney(
                                          (item.costPrice[outletKey] || 0) * (defaultUnit?.conversionFactor || 1),
                                        ),
                                      });
                                      setSearch((prev) => ({ ...prev, [line.id]: '' }));
                                    }}
                                    className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                                  >
                                    <span className="font-bold text-slate-800">{item.name}</span>
                                    <span className="ml-2 font-mono text-[10px] text-slate-400">{item.sku}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    )}
                  </div>

                  <label className="text-xs font-bold text-slate-700 lg:col-span-3">
                    Purchase unit
                    <select
                      value={line.unitName}
                      disabled={!product}
                      onChange={(event) => {
                        const unit = units.find((item) => item.name === event.target.value);
                        updateLine(line.id, {
                          unitName: event.target.value,
                          conversionFactor: unit?.conversionFactor || 1,
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold disabled:bg-slate-100"
                    >
                      {units.map((unit) => (
                        <option key={unit.name} value={unit.name}>
                          {unit.name} (×{unit.conversionFactor})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-bold text-slate-700 lg:col-span-2">
                    Quantity
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity || ''}
                      onChange={(event) =>
                        updateLine(line.id, { quantity: roundQuantity(parseFloat(event.target.value) || 0) })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-right text-sm font-bold"
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700 lg:col-span-2">
                    Unit cost (GH₵)
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.unitCost || ''}
                      onChange={(event) =>
                        updateLine(line.id, { unitCost: roundMoney(parseFloat(event.target.value) || 0) })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-right text-sm font-bold"
                    />
                  </label>
                </div>

                {product && line.quantity > 0 && (
                  <p className="text-[11px] text-slate-500">
                    = {formatQuantity(line.quantity * line.conversionFactor)} {product.baseUnit} into stock ·
                    line cost {formatMoney(line.quantity * line.unitCost)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {completeLines.length} line{completeLines.length === 1 ? '' : 's'} ready · total {formatMoney(runningTotal)}
          </p>
          <button
            disabled={completeLines.length === 0}
            onClick={() => setConfirming(true)}
            className="rounded-lg bg-accent-600 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Review &amp; confirm receipt
          </button>
        </div>
      </section>

      {/* E-05: check before commit — resulting stock and the new average cost */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-300 bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-300">Confirm receipt</p>
                <h2 className="mt-1 text-sm font-black">Check before committing</h2>
              </div>
              <button onClick={() => setConfirming(false)} className="text-xs font-bold text-slate-300">
                Back
              </button>
            </div>

            <div className="p-5">
              <p className="mb-4 text-xs text-slate-500">
                Confirming writes a stock movement per line and recalculates the weighted average cost per outlet
                (BR-4). It cannot be edited afterwards.
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-right">In base units</th>
                      <th className="px-4 py-3 text-right">Stock after</th>
                      <th className="px-4 py-3 text-right">Old avg cost</th>
                      <th className="px-4 py-3 text-right">New avg cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => (
                      <tr key={row.line.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{row.product.name}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {row.line.quantity} × {row.line.unitName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatQuantity(row.quantityBase)} {row.product.baseUnit}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {formatQuantity(row.resultingStock)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatMoney(row.currentAvg)}</td>
                        <td
                          className={`px-4 py-3 text-right font-black ${
                            row.newAvg > row.currentAvg ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatMoney(row.newAvg)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <span className="text-slate-500">Total cost </span>
                  <span className="font-black text-slate-900">{formatMoney(runningTotal)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Back to lines
                  </button>
                  <button
                    onClick={commit}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white"
                  >
                    <Package className="h-3.5 w-3.5" /> Confirm and post
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
