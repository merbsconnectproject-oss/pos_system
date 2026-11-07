import React, { useCallback, useEffect, useState } from 'react';
import { History, Store, X } from 'lucide-react';
import { pricingApi, type OutletPriceWire, type PriceHistoryWire } from '../productsApi';
import type { Outlet, Product } from '../types';
import { formatMoney } from '../money';

/**
 * FR-PRICE-03 · FR-PRICE-06: what a branch charges, and what it has charged.
 *
 * <p>Both halves have been on the server and tested since pricing was built,
 * and neither had a control. `pricingApi.setOverride`, `clearOverride` and
 * `history` were referenced nowhere outside their own definitions, so a branch
 * price could be stored, honoured at the till and enforced as that branch's
 * floor (BR-10) — with no way for anyone to set or read it.
 *
 * <p>Clearing is its own action rather than blanking three boxes. "Back to the
 * shared price" should leave no row saying otherwise, and the server removes
 * the override rather than storing one that overrides nothing.
 */
interface ProductPricingModalProps {
  product: Product | null;
  outlets: Outlet[];
  /** FR-PRICE-07: the floor and the history are priced information. */
  canEdit: boolean;
  onClose: () => void;
  /**
   * Optional hook for a caller that wants to re-read after a change.
   *
   * <p>The catalogue list shows the *shared* prices, which a branch override
   * does not touch, so there is usually nothing to re-read here — the till
   * reads the effective price for its own outlet when it opens.
   */
  onChanged?: () => void;
}

type Draft = { retailPrice: string; tradePrice: string; floorPrice: string };

const blank: Draft = { retailPrice: '', tradePrice: '', floorPrice: '' };

const toDraft = (row: OutletPriceWire | undefined): Draft => ({
  retailPrice: row?.retailPrice == null ? '' : String(row.retailPrice),
  tradePrice: row?.tradePrice == null ? '' : String(row.tradePrice),
  floorPrice: row?.floorPrice == null ? '' : String(row.floorPrice),
});

/** Empty means "no override on this level", which is not the same as zero. */
const toValue = (text: string): number | null => {
  const clean = text.trim();
  if (clean === '') return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const ProductPricingModal: React.FC<ProductPricingModalProps> = ({
  product,
  outlets,
  canEdit,
  onClose,
  onChanged,
}) => {
  const [overrides, setOverrides] = useState<OutletPriceWire[]>([]);
  const [history, setHistory] = useState<PriceHistoryWire[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const branches = outlets.filter((outlet) => outlet.id !== 'all-outlets');

  const load = useCallback(async (productId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [loadedOverrides, loadedHistory] = await Promise.all([
        pricingApi.overrides(productId),
        pricingApi.history(productId).catch(() => [] as PriceHistoryWire[]),
      ]);
      setOverrides(loadedOverrides);
      setHistory(loadedHistory);
      setDrafts(Object.fromEntries(branches.map((outlet) => [
        outlet.id,
        toDraft(loadedOverrides.find((row) => row.outletId === outlet.id)),
      ])));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Branch prices could not be read.');
    } finally {
      setLoading(false);
    }
    // `branches` is derived from `outlets` and stable for the life of a modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlets]);

  useEffect(() => {
    if (product) void load(product.id);
  }, [product, load]);

  if (!product) return null;

  const save = async (outletId: string) => {
    const draft = drafts[outletId] || blank;
    setBusy(outletId);
    setError(null);
    try {
      await pricingApi.setOverride(product.id, outletId, {
        retailPrice: toValue(draft.retailPrice),
        tradePrice: toValue(draft.tradePrice),
        floorPrice: toValue(draft.floorPrice),
      });
      await load(product.id);
      onChanged?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That branch price could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const clear = async (outletId: string) => {
    setBusy(outletId);
    setError(null);
    try {
      await pricingApi.clearOverride(product.id, outletId);
      await load(product.id);
      onChanged?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That override could not be cleared.');
    } finally {
      setBusy(null);
    }
  };

  const setField = (outletId: string, field: keyof Draft, value: string) =>
    setDrafts((current) => ({
      ...current,
      [outletId]: { ...(current[outletId] || blank), [field]: value },
    }));

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-xl">

        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-accent-600" />
              Branch prices &mdash; {product.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Shared price: {formatMoney(product.retailPrice)} retail &middot;{' '}
              {formatMoney(product.tradePrice)} trade &middot; {formatMoney(product.floorPrice)} floor.
              Leave a box empty to use the shared price for that level.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <p className="mx-5 mt-4 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <p className="text-sm text-slate-500">Reading branch prices&hellip;</p>
          ) : (
            <>
              <div className="space-y-3">
                {branches.map((outlet) => {
                  const draft = drafts[outlet.id] || blank;
                  const stored = overrides.find((row) => row.outletId === outlet.id);
                  const overridden = Boolean(stored);

                  return (
                    <div key={outlet.id} className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-800">{outlet.name}</span>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                          overridden
                            ? 'bg-accent-50 text-accent-800 border-accent-300'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}>
                          {overridden ? 'branch price' : 'shared price'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {([
                          ['retailPrice', 'Retail'],
                          ['tradePrice', 'Trade'],
                          ['floorPrice', 'Floor'],
                        ] as Array<[keyof Draft, string]>).map(([field, label]) => (
                          <label key={field} className="block">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              {label}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              disabled={!canEdit || busy === outlet.id}
                              value={draft[field]}
                              onChange={(event) => setField(outlet.id, field, event.target.value)}
                              placeholder="Shared"
                              className="mt-0.5 w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-accent-500 disabled:opacity-60"
                            />
                          </label>
                        ))}
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy === outlet.id}
                            onClick={() => save(outlet.id)}
                            className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-[11px] font-bold disabled:opacity-50"
                          >
                            {busy === outlet.id ? 'Saving…' : 'Save branch price'}
                          </button>
                          {overridden && (
                            <button
                              type="button"
                              disabled={busy === outlet.id}
                              onClick={() => clear(outlet.id)}
                              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50"
                            >
                              Use the shared price
                            </button>
                          )}
                        </div>
                      )}

                      {/* BR-10: worth saying, because it is the rule the till enforces. */}
                      {overridden && stored?.floorPrice != null && (
                        <p className="text-[11px] text-slate-500">
                          This branch&rsquo;s floor is {formatMoney(stored.floorPrice)} &mdash; the
                          lowest a cashier here may reach without a manager&rsquo;s approval.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <section className="space-y-2">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Price history &mdash; FR-PRICE-06
                </h3>
                {history.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No price changes recorded for this product yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2">When</th>
                          <th className="px-3 py-2">Retail</th>
                          <th className="px-3 py-2">Trade</th>
                          <th className="px-3 py-2">Floor</th>
                          <th className="px-3 py-2">Set by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-600">
                              {new Date(row.changedAt).toLocaleString('en-GB')}
                            </td>
                            <td className="px-3 py-2 font-mono">{formatMoney(row.retailPrice)}</td>
                            <td className="px-3 py-2 font-mono">{formatMoney(row.tradePrice)}</td>
                            <td className="px-3 py-2 font-mono">{formatMoney(row.floorPrice)}</td>
                            <td className="px-3 py-2 text-slate-600">{row.changedBy || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
