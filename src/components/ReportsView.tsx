import React, { useEffect, useMemo, useState } from 'react';
import { Download, Package, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { Outlet, UserAccount } from '../types';
import type { PermissionSet } from '../permissions';
import { formatMoney, roundMoney } from '../money';
import { exportToCsv } from '../utils/csvExport';
import { InfoHint } from './InfoHint';
import { reportsApi, type ReportFilters, type ReportRow, type ReportSummary } from '../reportsApi';
import { catalogueApi } from '../catalogueApi';
import { usersApi } from '../usersApi';
import { TablePagination } from './TablePagination';

type ReportTab = 'index' | 'sales' | 'product' | 'category' | 'cashier' | 'customer' | 'profit' | 'best-sellers' | 'slow-movers' | 'stock' | 'valuation' | 'low-stock' | 'movements' | 'payments' | 'end-of-day' | 'discounts' | 'voids' | 'purchases';
/**
 * The lists are gone from here on purpose — FR-RPT-04.
 *
 * Handing this screen `sales` and `movements` is what made it add up whatever
 * the app happened to have loaded. It asks the server now, so the only things
 * it needs are the branches to offer in the filter and who is looking.
 */
interface ReportsViewProps { outlets: Outlet[]; currentOutlet: Outlet; currentUser: UserAccount | null; permissions: PermissionSet; }
type Row = { name: string; qty: number; revenue: number; secondary?: string };
const money = (value: number) => `GH₵ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** FR-RPT-03: the methods the server's `paymentMethod` filter accepts. */
const PAYMENT_METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'momo', label: 'Mobile money' },
  { value: 'card', label: 'Card' },
  { value: 'transfer', label: 'Bank transfer' },
];
const reportGroups: Array<{ key: Exclude<ReportTab, 'index'>; label: string }> = [
  { key: 'sales', label: 'Sales summary' }, { key: 'product', label: 'By product' }, { key: 'category', label: 'By category' }, { key: 'cashier', label: 'By cashier' }, { key: 'customer', label: 'By customer' }, { key: 'profit', label: 'Gross profit' },
  { key: 'best-sellers', label: 'Best sellers' }, { key: 'slow-movers', label: 'Slow movers' }, { key: 'stock', label: 'Stock on hand' }, { key: 'valuation', label: 'Inventory valuation' }, { key: 'low-stock', label: 'Low stock' }, { key: 'movements', label: 'Stock movements' }, { key: 'payments', label: 'Payments' }, { key: 'end-of-day', label: 'End of day' }, { key: 'discounts', label: 'Discounts' }, { key: 'voids', label: 'Voids & refunds' }, { key: 'purchases', label: 'Purchases' },
];

const ReportTable: React.FC<{ title: string; rows: Row[]; columns: [string, string, string] }> = ({ title, rows, columns }) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  React.useEffect(() => setPage(1), [rows]);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {rows.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">No data for this period. Widen the date range to continue.</div> : <><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">{columns[0]}</th><th className="px-5 py-3">{columns[1]}</th><th className="px-5 py-3 text-right">{columns[2]}</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={`${row.name}-${row.secondary || ''}`} className="border-t border-slate-100"><td className="px-5 py-3"><div className="font-semibold text-slate-800">{row.name}</div>{row.secondary && <div className="mt-0.5 text-[10px] text-slate-400">{row.secondary}</div>}</td><td className="px-5 py-3 text-slate-600">{row.qty}</td><td className="px-5 py-3 text-right font-bold text-slate-900">{money(row.revenue)}</td></tr>)}</tbody></table></div><TablePagination page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} onPageSizeChange={setPageSize} /></>}
    </div>
  );
};

export const ReportsView: React.FC<ReportsViewProps> = ({ outlets, currentOutlet, currentUser, permissions }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('index');
  const [outlet, setOutlet] = useState(currentOutlet.id === 'all-outlets' ? 'all' : currentOutlet.id);
  const [range, setRange] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  /**
   * FR-RPT-03: "filterable by outlet, date range and, where relevant,
   * category, user and payment method."
   *
   * <p>The reports API has taken all five since it was written. The screen
   * offered outlet and date, so three of the five were unreachable — a manager
   * could not ask what one cashier sold, or what went through MoMo.
   */
  const [category, setCategory] = useState('all');
  const [userId, setUserId] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; name: string }>>([]);
  const canProfit = permissions.has('report.view_profit');

  // Loaded once: the filter lists do not change while a report is being read.
  useEffect(() => {
    let current = true;
    void catalogueApi.list('categories')
      .then((items) => { if (current) setCategoryOptions(items.map((item) => item.name)); })
      .catch(() => { if (current) setCategoryOptions([]); });
    void usersApi.list()
      .then((people) => {
        if (current) setUserOptions(people.map((person) => ({ id: person.id, name: person.fullName || person.username })));
      })
      .catch(() => { if (current) setUserOptions([]); });
    return () => { current = false; };
  }, []);
  const dateBounds = useMemo(() => {
    const end = customEnd ? new Date(`${customEnd}T23:59:59`) : new Date();
    const start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(end);
    if (!customStart) start.setDate(end.getDate() - (range === '7d' ? 6 : range === '30d' ? 29 : range === 'mtd' ? end.getDate() - 1 : 365));
    return { start, end };
  }, [customEnd, customStart, range]);

  /**
   * FR-RPT-03 · FR-RPT-04: every figure is asked of the server.
   *
   * <p>This screen used to add up whichever sales the app happened to have
   * loaded — a hundred of them — so "year to date" silently meant "the last
   * hundred receipts", and it looked entirely plausible.
   */
  const filters = useMemo<ReportFilters>(() => ({
    from: dateBounds.start,
    to: dateBounds.end,
    outletId: outlet === 'all' ? null : outlet,
    category: category === 'all' ? null : category,
    userId: userId === 'all' ? null : userId,
    paymentMethod: paymentMethod === 'all' ? null : paymentMethod,
  }), [dateBounds, outlet, category, userId, paymentMethod]);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [profitRows, setProfitRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const money2 = (value: number | null | undefined) => Number(value ?? 0);

  /** Server rows in the shape this screen's table already renders. */
  const asRow = (row: ReportRow, secondary?: string): Row => ({
    name: row.name,
    qty: Number(row.quantity),
    revenue: Number(row.revenue),
    secondary: secondary ?? row.secondary ?? undefined,
  });

  useEffect(() => {
    let current = true;
    setLoading(true);
    setFailure(null);

    const load = async (): Promise<Row[]> => {
      switch (activeTab) {
        case 'product':
          return (await reportsApi.breakdown('product', filters)).map((row) => asRow(row));
        case 'best-sellers':
          return (await reportsApi.ranking('best', filters)).map((row) => asRow(row));
        case 'category':
          return (await reportsApi.breakdown('category', filters)).map((row) => asRow(row));
        case 'cashier':
          return (await reportsApi.breakdown('cashier', filters)).map((row) => asRow(row));
        case 'customer':
          return (await reportsApi.breakdown('customer', filters)).map((row) => asRow(row));
        case 'payments':
          return (await reportsApi.breakdown('payment', filters)).map((row) => asRow(row));
        case 'movements':
          return (await reportsApi.breakdown('movement', filters)).map((row) => asRow(row));
        case 'purchases':
          // Purchases are the receipt movements, valued at what was paid.
          return (await reportsApi.breakdown('movement', filters))
            .filter((row) => row.key === 'RECEIPT')
            .map((row) => asRow(row, 'Goods received'));
        case 'slow-movers':
          return (await reportsApi.ranking('slow', filters, 50)).map((row) =>
            asRow(row, `${row.secondary ?? ''} · ${Number(row.quantity) === 0 ? 'no sale in this period' : 'slow'}`));
        case 'stock':
          return (await reportsApi.stock('on-hand', filters)).map((row) => ({
            name: row.name,
            qty: Number(row.quantity),
            // FR-RPT-05: the server sends no value at all without the
            // permission, so there is nothing here to hide.
            revenue: money2(row.valueAtCost),
            secondary: `${row.sku} · ${row.outletName} · reorder at ${row.reorderLevel}${row.low ? ' · LOW' : ''}`,
          }));
        case 'valuation':
          // FR-RPT-04 inventory valuation. On the API since it was written and
          // never given a tab, so an owner could see quantities but never what
          // the stock on the shelves was worth.
          return (await reportsApi.stock('valuation', filters)).map((row) => ({
            name: row.name,
            qty: Number(row.quantity),
            revenue: money2(row.valueAtCost),
            secondary: `${row.sku} · ${row.outletName} · ${money(money2(row.averageCost))} average cost`,
          }));
        case 'low-stock':
          // FR-RPT-04 low stock, and FR-INV-05's reorder level is the test the
          // server applies — not a threshold this screen re-invents.
          return (await reportsApi.stock('low', filters)).map((row) => ({
            name: row.name,
            qty: Number(row.quantity),
            revenue: money2(row.valueAtCost),
            secondary: `${row.sku} · ${row.outletName} · reorder at ${row.reorderLevel}`,
          }));
        case 'end-of-day':
          // FR-RPT-04 end-of-day: what settled, by method, for the period the
          // filter names. The cash line is what should be in the drawer.
          return (await reportsApi.breakdown('payment', filters))
            .map((row) => asRow(row, `${row.quantity} payments`));
        case 'voids':
          return (await reportsApi.exceptions('void', filters)).map((row) => ({
            name: row.receiptNumber,
            qty: 1,
            revenue: Number(row.amount),
            secondary: `${row.reason || 'Voided'} · voided by ${row.approver || 'unknown'}`,
          }));
        case 'discounts':
          return (await reportsApi.exceptions('discount', filters)).map((row) => ({
            name: row.productName || row.receiptNumber,
            qty: 1,
            revenue: Number(row.amount),
            secondary: `${row.receiptNumber} · ${row.detail.toLowerCase()} · ${row.actor || ''}${row.approver ? ` · approved by ${row.approver}` : ''}`,
          }));
        default:
          return (await reportsApi.breakdown('product', filters)).map((row) => asRow(row));
      }
    };

    Promise.all([
      reportsApi.summary(filters),
      activeTab === 'index' ? Promise.resolve([] as Row[]) : load(),
      activeTab === 'profit' && canProfit
        ? reportsApi.breakdown('product', filters)
        : Promise.resolve([] as ReportRow[]),
    ])
      .then(([loadedSummary, loadedRows, loadedProfit]) => {
        if (!current) return;
        setSummary(loadedSummary);
        setRows(loadedRows);
        setProfitRows(loadedProfit);
      })
      .catch((error) => {
        if (!current) return;
        // An empty table with no explanation reads as "no sales", which is a
        // different and much worse answer than "this did not load".
        setFailure(error instanceof Error ? error.message : 'That report could not be loaded.');
        setRows([]);
      })
      .finally(() => { if (current) setLoading(false); });

    // Only the newest answer is allowed to land; the tab and the range both
    // change faster than a query returns.
    return () => { current = false; };
  }, [activeTab, filters, canProfit]);

  const revenue = money2(summary?.revenue);
  const frozenCogs = money2(summary?.cost);
  const saleCount = summary?.saleCount ?? 0;

  // FR-RPT-07: CSV of what is on screen — the server's rows, not a second sum.
  const exportReport = () => exportToCsv(
    `report-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Report', 'Outlet', 'Period', 'Row', 'Quantity', 'Value'],
    [
      ['Summary', outlet, range, 'Completed sales', saleCount, revenue.toFixed(2)],
      ...rows.map((row) => [activeTab, outlet, range, row.name, row.qty, row.revenue.toFixed(2)]),
    ],
  );
  const renderReport = () => {
    if (activeTab === 'product' || activeTab === 'best-sellers') return <ReportTable title={activeTab === 'product' ? 'Sales by product' : 'Best sellers by value'} rows={rows} columns={['Product', 'Units', 'Revenue']} />;
    if (activeTab === 'category') return <ReportTable title="Sales by category" rows={rows} columns={['Category', 'Units', 'Revenue']} />;
    if (activeTab === 'cashier') return <ReportTable title="Sales by cashier" rows={rows} columns={['Cashier', 'Receipts', 'Revenue']} />;
    if (activeTab === 'customer') return <ReportTable title="Sales by customer" rows={rows} columns={['Customer', 'Receipts', 'Revenue']} />;
    if (activeTab === 'payments') return <ReportTable title="Payment method breakdown" rows={rows} columns={['Method', 'Payments', 'Value']} />;
    if (activeTab === 'movements') return <ReportTable title="Stock movement report" rows={rows} columns={['Movement type', 'Units', 'Value']} />;
    if (activeTab === 'purchases') return <ReportTable title="Purchases report" rows={rows} columns={['Product', 'Units received', 'Cost']} />;
    if (activeTab === 'voids') return <ReportTable title="Void and refund log" rows={rows} columns={['Reference', 'Count', 'Value']} />;
    if (activeTab === 'discounts') return <ReportTable title="Discount and override log" rows={rows} columns={['Product / reason', 'Count', 'Given away']} />;
    if (activeTab === 'slow-movers') return <ReportTable title="Slow movers — no sale this period" rows={rows} columns={['Product', 'Units held', canProfit ? 'Value tied up' : '—']} />;
    if (activeTab === 'stock') return <ReportTable title="Stock on hand" rows={rows} columns={['Product', 'Quantity', canProfit ? 'Value at cost' : '—']} />;
    if (activeTab === 'valuation') {
      // FR-RPT-05: the valuation *is* the cost. There is no version of this
      // report with the cost withheld, so the permission gates the whole thing
      // rather than a column of it.
      if (!canProfit) return <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Inventory valuation requires the <code className="font-mono text-xs">price.view_cost</code> permission.</div>;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Metric label="Lines valued" value={String(rows.length)} />
            <Metric label="Total at cost" value={money(rows.reduce((sum, row) => sum + row.revenue, 0))} valueClass="text-emerald-700" />
          </div>
          <ReportTable title="Inventory valuation" rows={rows} columns={['Product', 'Quantity', 'Value at cost']} />
        </div>
      );
    }
    if (activeTab === 'low-stock') return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric label="Lines at or below reorder level" value={String(rows.length)} />
          <Metric label="Branch" value={outlet === 'all' ? 'All outlets' : outlets.find((item) => item.id === outlet)?.name || outlet} />
        </div>
        <ReportTable title="Low stock" rows={rows} columns={['Product', 'Quantity', canProfit ? 'Value at cost' : '—']} />
      </div>
    );
    if (activeTab === 'end-of-day') return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Metric label="Completed sales" value={String(saleCount)} />
          <Metric label="Takings, net of returns" value={money(money2(summary?.netRevenue))} />
          <Metric label="Refunded" value={money(money2(summary?.refundTotal))} />
          <Metric label="Voided" value={money(money2(summary?.voidedValue))} />
        </div>
        <ReportTable title="Settled by payment method" rows={rows} columns={['Method', 'Payments', 'Value']} />
        <p className="text-xs text-slate-500">
          The cash line is what the drawer should hold for this period before float and
          cash movements. A shift&rsquo;s own blind count and variance are on the cash control screen.
        </p>
      </div>
    );
    if (activeTab === 'profit' && !canProfit) return <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Profit reporting requires the <code className="font-mono text-xs">report.view_profit</code> permission.</div>;
    if (activeTab === 'profit') return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-black text-slate-900">Gross profit and COGS</h2>
          <p className="mt-1 text-xs text-slate-500">
            Costs are the frozen cost on each sale line, never recomputed from today's prices (BR-5, FR-RPT-06).
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Metric label="Revenue" value={money(revenue)} />
            <Metric label="Frozen COGS" value={money(frozenCogs)} />
            <Metric label="Gross profit" value={money(revenue - frozenCogs)} valueClass="text-emerald-700" />
            <Metric
              label="Margin"
              value={summary?.marginPercent == null ? '—' : `${Number(summary.marginPercent).toFixed(1)}%`}
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {profitRows.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">No data for this period. Widen the date range to continue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3 text-right">Units</th>
                    <th className="px-5 py-3 text-right">Revenue</th>
                    <th className="px-5 py-3 text-right">COGS</th>
                    <th className="px-5 py-3 text-right">Gross profit</th>
                    <th className="px-5 py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitRows.map((row) => {
                    const lineRevenue = Number(row.revenue);
                    const lineProfit = money2(row.profit);
                    return (
                      <tr key={row.key} className="border-t border-slate-100">
                        <td className="px-5 py-3">
                          <div className="font-semibold text-slate-800">{row.name}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{row.secondary}</div>
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">{Number(row.quantity)}</td>
                        <td className="px-5 py-3 text-right text-slate-600">{money(lineRevenue)}</td>
                        <td className="px-5 py-3 text-right text-slate-600">{money(money2(row.cost))}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700">{money(lineProfit)}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-900">
                          {lineRevenue > 0 ? `${((lineProfit / lineRevenue) * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
    // The sales summary is the totals above plus what made them up.
    return <ReportTable title="Sales summary — by product" rows={rows} columns={['Product', 'Units', 'Revenue']} />;
  };
  return <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6 animate-fade-in"><header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-micro-caps text-accent-700">Reporting workspace</p><div className="mt-1 flex items-center gap-2"><h1 className="text-2xl font-black text-slate-900">Business reports</h1><InfoHint text="Review sales, stock, payments, and control activity from recorded transactions." /></div></div><div className="flex flex-wrap gap-2"><select value={outlet} onChange={(event) => setOutlet(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><option value="all">All outlets</option>{outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={range} onChange={(event) => setRange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="mtd">Month to date</option><option value="ytd">Year to date</option></select><select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700" aria-label="Category"><option value="all">All categories</option>{categoryOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select><select value={userId} onChange={(event) => setUserId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700" aria-label="User"><option value="all">All users</option>{userOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700" aria-label="Payment method"><option value="all">All payment methods</option>{PAYMENT_METHOD_OPTIONS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select><button onClick={exportReport} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Export</button></div></header><nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Report sections"><button onClick={() => setActiveTab('index')} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold ${activeTab === 'index' ? 'border-accent-600 text-accent-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Report index</button>{reportGroups.filter((item) => item.key !== 'profit' || canProfit).map((item) => <button key={item.key} onClick={() => setActiveTab(item.key)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold ${activeTab === item.key ? 'border-accent-600 text-accent-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</nav>{activeTab === 'index' ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{[['Sales', 'Revenue, products, categories, cashiers, and customers.', 'sales', <TrendingUp className="h-5 w-5" />], ['Stock', 'Stock position, valuation, movements, and slow movers.', 'stock', <Package className="h-5 w-5" />], ['Cash', 'Payment methods, shifts, and end-of-day reconciliation.', 'payments', <Wallet className="h-5 w-5" />], ['Control', 'Discounts, overrides, voids, refunds, and purchases.', 'voids', <ShieldCheck className="h-5 w-5" />]].map(([title, description, key, icon]) => <button key={String(key)} onClick={() => setActiveTab(key as ReportTab)} className="group border border-slate-200 bg-white p-5 text-left transition-colors hover:border-accent-300"><span className="text-accent-700">{icon}</span><h2 className="mt-4 text-sm font-black text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><span className="mt-5 inline-block text-xs font-bold text-accent-700 group-hover:text-accent-800">Open report group</span></button>)}</div> : <section className="space-y-4"><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Metric label="Completed sales" value={String(saleCount)} /><Metric label="Revenue" value={money(revenue)} /><Metric label="Report period" value={range === '30d' ? 'Last 30 days' : range.toUpperCase()} /></div>{failure ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700">{failure}</div> : loading ? <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading…</div> : renderReport()}</section>}</div>;
};

const Metric = ({ label, value, valueClass = 'text-slate-900' }: { label: string; value: string; valueClass?: string }) => <div className="border border-slate-200 bg-white p-4"><p className="text-micro-caps text-slate-500">{label}</p><p className={`mt-2 text-lg font-black ${valueClass}`}>{value}</p></div>;
