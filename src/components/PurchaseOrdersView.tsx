import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Plus,
  Pencil,
  Send,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { Outlet, Product, Supplier } from '../types';
import { formatMoney, formatQuantity, fromPesewas } from '../money';
import {
  deliveryLabel,
  purchaseOrdersApi,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '../purchaseOrdersApi';
import { InfoHint } from './InfoHint';
import { TablePagination } from './TablePagination';

/**
 * F-08 — Purchase orders (FR-SUP-08).
 *
 * The screen holds no arithmetic about deliveries. Ordered, received and
 * outstanding all arrive from the server, which sums the confirmed goods receipts
 * pointing at each order — so a reversed delivery stops counting here the moment
 * it stops counting in the ledger, with nothing to keep in step.
 *
 * Over-delivery is shown, not prevented. A supplier who sends eleven of the ten
 * you ordered has already had them shelved, and a screen that called that an
 * error would be arguing with the shop's own stock.
 */

interface DraftLine {
  id: string;
  productId: string;
  purchaseUnit: string;
  conversionFactor: string;
  quantity: string;
  unitCost: string;
}

interface PurchaseOrdersViewProps {
  products: Product[];
  suppliers: Supplier[];
  currentOutlet: Outlet;
  outlets: Outlet[];
  /** Books a delivery against an order, on the goods receipt screen. */
  onReceiveAgainst?: (order: PurchaseOrder) => void;
}

const STATUS_FILTERS: { key: PurchaseOrderStatus | 'ALL'; label: string }[] = [
  { key: 'SENT', label: 'Open' },
  { key: 'DRAFT', label: 'Drafts' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'ALL', label: 'Everything' },
];

const blankLine = (): DraftLine => ({
  id: `line-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  productId: '',
  purchaseUnit: '',
  conversionFactor: '1',
  quantity: '',
  unitCost: '',
});

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({
  products,
  suppliers,
  currentOutlet,
  outlets,
  onReceiveAgainst,
}) => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'ALL'>('SENT');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [raising, setRaising] = useState(false);
  /**
   * FR-SUP-08: the draft being amended, if any.
   *
   * <p>Drafts only, and the server enforces that: once an order is sent, the
   * supplier holds a copy, and a delivery variance measured against an order
   * somebody edited afterwards is not a variance. `purchaseOrdersApi.amend`
   * had no caller, so a draft with a wrong quantity had to be cancelled and
   * raised again under a new number.
   */
  const [amending, setAmending] = useState<PurchaseOrder | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [expectedOn, setExpectedOn] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);

  /** Ending an order needs a reason, and a reason needs somewhere to type it. */
  const [ending, setEnding] = useState<{ order: PurchaseOrder; kind: 'close' | 'cancel' } | null>(null);
  const [endReason, setEndReason] = useState('');

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.active !== false),
    [suppliers],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = statusFilter === 'ALL' ? undefined : statusFilter;
      setOrders(await purchaseOrdersApi.list(currentOutlet.id, status));
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [currentOutlet.id, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return orders;
    return orders.filter((order) => {
      const haystack = [order.number, order.supplierName ?? '', order.note ?? '']
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [orders, search]);

  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openOrders = orders.filter((order) => order.status === 'SENT');
  const committed = openOrders.reduce(
    (total, order) => total + (order.orderedTotalPesewas - order.receivedTotalPesewas),
    0,
  );
  const overdue = openOrders.filter((order) => order.overdue);
  const partlyDelivered = openOrders.filter((order) => order.delivery === 'PARTIAL').length;
  const receivedValue = orders.reduce((total, order) => total + order.receivedTotalPesewas, 0);

  const draftTotal = lines.reduce((total, line) => {
    const quantity = Number(line.quantity) || 0;
    const cost = Number(line.unitCost) || 0;
    return total + quantity * cost;
  }, 0);

  /**
   * The units a product may be ordered in — FR-UOM-05.
   *
   * <p>Its own selling units, or the base unit when it has none. Never free
   * text: the unit alone is meaningless, and the factor that comes with it is
   * what the delivery is later measured against.
   */
  const unitsFor = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return [];
    return product.sellingUnits?.length
      ? product.sellingUnits
      : [{ name: product.baseUnit, conversionFactor: 1, price: product.retailPrice }];
  };

  const run = async (name: string, action: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await action();
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  /** Open the raise form with a draft's own lines in it. */
  const startAmend = (order: PurchaseOrder) => {
    setAmending(order);
    setSupplierId(order.supplierId);
    setExpectedOn(order.expectedOn ? order.expectedOn.slice(0, 10) : '');
    setNote(order.note || '');
    setLines(order.lines.map((line, index) => ({
      id: `amend-${index}`,
      productId: line.productId,
      purchaseUnit: line.purchaseUnit,
      conversionFactor: String(line.conversionFactor),
      quantity: String(line.orderedQuantity),
      unitCost: String(line.unitCost),
    })));
    setRaising(true);
  };

  const cancelForm = () => {
    setRaising(false);
    setAmending(null);
    setSupplierId('');
    setExpectedOn('');
    setNote('');
    setLines([blankLine()]);
  };

  const raise = async () => {
    const usable = lines.filter((line) => line.productId && Number(line.quantity) > 0);
    if (!supplierId || usable.length === 0) {
      setError('Choose a supplier and add at least one line with a quantity');
      return;
    }

    const draft = {
      outletId: currentOutlet.id,
      supplierId,
      expectedOn: expectedOn || null,
      note: note.trim() || null,
      lines: usable.map((line) => ({
        productId: line.productId,
        purchaseUnit: line.purchaseUnit.trim() || 'pcs',
        conversionFactor: line.conversionFactor || '1',
        quantity: line.quantity,
        unitCost: line.unitCost || '0',
      })),
    };

    await run(amending ? 'amend' : 'raise', async () => {
      if (amending) await purchaseOrdersApi.amend(amending.id, draft);
      else await purchaseOrdersApi.raise(draft);
      cancelForm();
    });
  };

  const end = async () => {
    if (!ending) return;
    const { order, kind } = ending;
    await run(kind, async () => {
      if (kind === 'close') await purchaseOrdersApi.close(order.id, endReason.trim() || undefined);
      else await purchaseOrdersApi.cancel(order.id, endReason.trim());
      setEnding(null);
      setEndReason('');
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* Same header shape as Suppliers and Customers, which this screen sits
          beside — and reachable as a tab inside Suppliers itself. */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Purchase Orders
            </h1>
            <InfoHint text="What the shop has asked suppliers for. Raising an order moves no stock — it becomes stock when the delivery is received against it (FR-SUP-08)." />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Ordering for {currentOutlet.name}
            {outlets.filter((outlet) => outlet.id !== 'all-outlets').length > 1
              ? ' — one branch at a time, as orders are placed'
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>

          {/* Secondary action in the design system's dark blue, matching the
              "Add Supplier" and "Add Customer" buttons on the sibling screens.
              Orange stays for the act on an order itself — sending it. */}
          <button
            onClick={() => (raising ? cancelForm() : setRaising(true))}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" /> {raising ? 'Close the form' : 'Raise an Order'}
          </button>
        </div>
      </div>

      {/* The four figures a purchasing screen is opened to answer. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-sky-400" /> Still On Order
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
              {formatMoney(fromPesewas(committed))}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
            Ordered and not yet delivered
          </div>
        </div>

        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-accent-300" /> Open Orders
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
              {openOrders.length}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
            {partlyDelivered} part delivered
          </div>
        </div>

        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <AlertTriangle
                  className={`w-4 h-4 ${overdue.length > 0 ? 'text-amber-400' : 'text-slate-500'}`}
                />{' '}
                Overdue
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
              {overdue.length}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
            Past the date the supplier promised
          </div>
        </div>

        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Delivered
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
              {formatMoney(fromPesewas(receivedValue))}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium">
            Booked in against these orders
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {overdue.length === 1
              ? `${overdue[0].number} is past the date ${overdue[0].supplierName ?? 'the supplier'} promised.`
              : `${overdue.length} orders are past the date their suppliers promised.`}
          </span>
        </div>
      )}

      {raising && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ClipboardList className="w-5 h-5 text-accent-600" />
            <div>
              <h2 className="text-sm font-black text-slate-900">
                {amending ? `Amend ${amending.number}` : 'New order'}
              </h2>
              <p className="text-xs text-slate-500">
                Saved as a draft — nothing reaches the supplier until you send it.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-xs font-bold text-slate-700">
              Supplier
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
              >
                <option value="">Choose a supplier…</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Promised for
              <input
                type="date"
                value={expectedOn}
                onChange={(event) => setExpectedOn(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Note
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything the supplier should know"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
              />
            </label>
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={line.id} className="grid grid-cols-12 items-end gap-2">
                <label className="col-span-12 text-[10px] font-black uppercase tracking-wider text-slate-400 md:col-span-4">
                  Product
                  <select
                    value={line.productId}
                    onChange={(event) => {
                      const product = products.find((item) => item.id === event.target.value);

                      // Prefer a bulk unit — you order drums, not metres — and
                      // fall back to the base unit. Either way the factor comes
                      // with it, because a unit without its factor is how an
                      // order ends up asking for 3 metres of cable.
                      const choice =
                        product?.sellingUnits?.find((unit) => unit.conversionFactor > 1) ||
                        product?.sellingUnits?.[0];

                      setLines((current) =>
                        current.map((row) =>
                          row.id === line.id
                            ? {
                                ...row,
                                productId: event.target.value,
                                purchaseUnit: choice?.name || product?.baseUnit || '',
                                conversionFactor: String(choice?.conversionFactor ?? 1),
                              }
                            : row,
                        ),
                      );
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold"
                  >
                    <option value="">Choose…</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="col-span-6 text-[10px] font-black uppercase tracking-wider text-slate-400 md:col-span-3">
                  Unit
                  <select
                    value={line.purchaseUnit}
                    disabled={!unitsFor(line.productId).length}
                    onChange={(event) => {
                      const unit = unitsFor(line.productId)
                        .find((item) => item.name === event.target.value);
                      setLines((current) =>
                        current.map((row) =>
                          row.id === line.id
                            ? {
                                ...row,
                                purchaseUnit: event.target.value,
                                // Taken from the unit, never typed: the factor is
                                // what turns 3 drums into 300 m, and a hand-typed
                                // one is a wrong delivery waiting to happen.
                                conversionFactor: String(unit?.conversionFactor ?? 1),
                              }
                            : row,
                        ),
                      );
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold disabled:bg-slate-100"
                  >
                    {unitsFor(line.productId).length === 0 && (
                      <option value="">Choose a product first</option>
                    )}
                    {unitsFor(line.productId).map((unit) => (
                      <option key={unit.name} value={unit.name}>
                        {unit.name}
                        {unit.conversionFactor > 1 ? ` (×${unit.conversionFactor})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="col-span-4 text-[10px] font-black uppercase tracking-wider text-slate-400 md:col-span-2">
                  Qty
                  <input
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((row) =>
                          row.id === line.id ? { ...row, quantity: event.target.value } : row,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold"
                  />
                </label>

                <label className="col-span-6 text-[10px] font-black uppercase tracking-wider text-slate-400 md:col-span-2">
                  Cost per unit
                  <input
                    value={line.unitCost}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((row) =>
                          row.id === line.id ? { ...row, unitCost: event.target.value } : row,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold"
                  />
                </label>

                <div className="col-span-6 flex justify-end md:col-span-1">
                  {lines.length > 1 && (
                    <button
                      onClick={() =>
                        setLines((current) => current.filter((row) => row.id !== line.id))
                      }
                      className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-rose-600 cursor-pointer"
                      title={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              onClick={() => setLines((current) => [...current, blankLine()])}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-700 hover:text-accent-800 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add a line
            </button>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Order value
                </p>
                <p className="text-lg font-black text-slate-900">{formatMoney(draftTotal)}</p>
              </div>
              <button
                onClick={() => void raise()}
                disabled={busy === 'raise' || busy === 'amend'}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
              >
                {busy === 'raise' || busy === 'amend'
                  ? 'Saving…'
                  : amending ? 'Save the amendment' : 'Save as draft'}
              </button>
            </div>
          </div>

        </section>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs flex gap-1 overflow-x-auto">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => {
                setStatusFilter(filter.key);
                setPage(1);
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-black whitespace-nowrap cursor-pointer ${
                statusFilter === filter.key
                  ? 'bg-accent-500 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by number or supplier"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-semibold shadow-xs focus:outline-accent-500"
          />
        </div>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-black border-b border-slate-200 uppercase text-[10px] tracking-wide">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Promised</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3 text-right">Ordered</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 font-bold text-slate-500">No orders here</p>
                    <p className="text-[11px] text-slate-400">
                      Raise one when the shelves need filling.
                    </p>
                  </td>
                </tr>
              )}

              {!loading &&
                visible.map((order) => (
                  <React.Fragment key={order.id}>
                    <tr className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                          className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-900 cursor-pointer"
                        >
                          {expanded === order.id ? (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          {order.number}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {order.supplierName ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {order.expectedOn ? (
                          <span
                            className={
                              order.overdue ? 'font-bold text-amber-700' : 'text-slate-600'
                            }
                          >
                            {order.expectedOn}
                            {order.overdue ? ' · overdue' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400">no date</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DeliveryBadge order={order} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatMoney(fromPesewas(order.orderedTotalPesewas))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {formatMoney(fromPesewas(order.receivedTotalPesewas))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {order.status === 'DRAFT' && (
                            <button
                              onClick={() => startAmend(order)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" /> Amend
                            </button>
                          )}

                          {order.status === 'DRAFT' && (
                            <button
                              onClick={() =>
                                void run('send', () => purchaseOrdersApi.send(order.id))
                              }
                              disabled={busy === 'send'}
                              className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50 cursor-pointer"
                            >
                              <Send className="h-3 w-3" /> Send
                            </button>
                          )}

                          {order.status === 'SENT' && onReceiveAgainst && (
                            <button
                              onClick={() => onReceiveAgainst(order)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              <Truck className="h-3 w-3" /> Receive
                            </button>
                          )}

                          {order.status === 'SENT' && (
                            <button
                              onClick={() => {
                                setEnding({ order, kind: 'close' });
                                setEndReason('');
                              }}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              Close
                            </button>
                          )}

                          {(order.status === 'DRAFT' || order.status === 'SENT') && (
                            <button
                              onClick={() => {
                                setEnding({ order, kind: 'cancel' });
                                setEndReason('');
                              }}
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Cancel this order"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expanded === order.id && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={7} className="px-4 py-4">
                          <table className="w-full text-left text-[11px]">
                            <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              <tr>
                                <th className="py-1.5">Product</th>
                                <th className="py-1.5 text-right">Ordered</th>
                                <th className="py-1.5 text-right">Received</th>
                                <th className="py-1.5 text-right">Outstanding</th>
                                <th className="py-1.5 text-right">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.lines.map((line) => (
                                <tr key={line.productId} className="border-t border-slate-200">
                                  <td className="py-1.5 font-semibold text-slate-700">
                                    {line.name ?? line.sku ?? line.productId}
                                    <span className="ml-1 text-slate-400">
                                      ({line.purchaseUnit})
                                    </span>
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {formatQuantity(line.orderedQuantity)}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {formatQuantity(line.receivedQuantity)}
                                  </td>
                                  <td
                                    className={`py-1.5 text-right font-bold ${
                                      line.outstandingQuantity < 0
                                        ? 'text-indigo-700'
                                        : line.outstandingQuantity > 0
                                          ? 'text-amber-700'
                                          : 'text-emerald-700'
                                    }`}
                                  >
                                    {line.outstandingQuantity < 0
                                      ? `${formatQuantity(Math.abs(line.outstandingQuantity))} over`
                                      : formatQuantity(line.outstandingQuantity)}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {formatMoney(line.unitCost)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {order.receipts.length > 0 && (
                            <div className="mt-3 border-t border-slate-200 pt-3">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                Deliveries
                              </p>
                              <ul className="mt-1 space-y-1">
                                {order.receipts.map((receipt) => (
                                  <li key={receipt.id} className="text-[11px] text-slate-600">
                                    <span className="font-mono font-bold">
                                      {receipt.reference ?? receipt.id.slice(0, 8)}
                                    </span>
                                    {receipt.confirmedAt
                                      ? ` · ${new Date(receipt.confirmedAt).toLocaleString()}`
                                      : ''}
                                    {receipt.reversed && (
                                      <span className="ml-1 font-bold text-rose-700">
                                        · reversed, does not count
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {order.closeReason && (
                            <p className="mt-3 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
                              <span className="font-bold">Ended:</span> {order.closeReason}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </section>

      {ending && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 animate-modal-backdrop">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="text-sm font-black text-slate-900">
              {ending.kind === 'close' ? 'Close' : 'Cancel'} {ending.order.number}
            </h2>

            <p className="text-xs text-slate-600">
              {ending.kind === 'close'
                ? ending.order.delivery === 'COMPLETE' || ending.order.delivery === 'OVER'
                  ? 'Everything ordered has arrived. Closing it needs no explanation, but you can add one.'
                  : 'Some of this order never arrived. Say why it is being closed — the shop will want to know who accepted it.'
                : 'Cancelling means the shop never expected these goods. An order with deliveries against it has to be closed short instead.'}
            </p>

            <textarea
              value={endReason}
              onChange={(event) => setEndReason(event.target.value)}
              rows={3}
              placeholder={
                ending.kind === 'close'
                  ? 'Supplier discontinued the line'
                  : 'Ordered twice by mistake'
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEnding(null);
                  setEndReason('');
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 cursor-pointer"
              >
                Leave it open
              </button>
              <button
                onClick={() => void end()}
                disabled={busy === ending.kind || (ending.kind === 'cancel' && !endReason.trim())}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
              >
                {busy === ending.kind ? 'Working…' : ending.kind === 'close' ? 'Close order' : 'Cancel order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DeliveryBadge: React.FC<{ order: PurchaseOrder }> = ({ order }) => {
  const label = deliveryLabel(order);
  const tone =
    order.status === 'CANCELLED'
      ? 'bg-slate-100 text-slate-600'
      : order.status === 'DRAFT'
        ? 'bg-slate-100 text-slate-700'
        : order.delivery === 'COMPLETE'
          ? 'bg-emerald-50 text-emerald-700'
          : order.delivery === 'OVER'
            ? 'bg-indigo-50 text-indigo-700'
            : order.delivery === 'PARTIAL'
              ? 'bg-amber-50 text-amber-800'
              : 'bg-sky-50 text-sky-700';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${tone}`}
    >
      {order.delivery === 'COMPLETE' && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </span>
  );
};
