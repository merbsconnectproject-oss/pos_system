import React, { useMemo, useState } from 'react';
import { Download, Package, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { CompletedSale, Outlet, Product, StockMovement, UserAccount } from '../types';
import type { PermissionSet } from '../permissions';
import { formatMoney, roundMoney } from '../money';
import { exportToCsv } from '../utils/csvExport';
import { InfoHint } from './InfoHint';
import { TablePagination } from './TablePagination';

type ReportTab = 'index' | 'sales' | 'product' | 'category' | 'cashier' | 'customer' | 'profit' | 'best-sellers' | 'slow-movers' | 'stock' | 'movements' | 'payments' | 'discounts' | 'voids' | 'purchases';
interface ReportsViewProps { products: Product[]; sales: CompletedSale[]; movements: StockMovement[]; outlets: Outlet[]; currentOutlet: Outlet; currentUser: UserAccount | null; permissions: PermissionSet; }
type Row = { name: string; qty: number; revenue: number; secondary?: string };
const money = (value: number) => `GH₵ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const reportGroups: Array<{ key: Exclude<ReportTab, 'index'>; label: string }> = [
  { key: 'sales', label: 'Sales summary' }, { key: 'product', label: 'By product' }, { key: 'category', label: 'By category' }, { key: 'cashier', label: 'By cashier' }, { key: 'customer', label: 'By customer' }, { key: 'profit', label: 'Gross profit' },
  { key: 'best-sellers', label: 'Best sellers' }, { key: 'slow-movers', label: 'Slow movers' }, { key: 'stock', label: 'Stock on hand' }, { key: 'movements', label: 'Stock movements' }, { key: 'payments', label: 'Payments' }, { key: 'discounts', label: 'Discounts' }, { key: 'voids', label: 'Voids & refunds' }, { key: 'purchases', label: 'Purchases' },
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

export const ReportsView: React.FC<ReportsViewProps> = ({ products, sales, movements, outlets, currentOutlet, currentUser, permissions }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('index');
  const [outlet, setOutlet] = useState(currentOutlet.id === 'all-outlets' ? 'all' : currentOutlet.id);
  const [range, setRange] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const canProfit = permissions.has('report.view_profit');
  const dateBounds = useMemo(() => {
    const end = customEnd ? new Date(`${customEnd}T23:59:59`) : new Date();
    const start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(end);
    if (!customStart) start.setDate(end.getDate() - (range === '7d' ? 6 : range === '30d' ? 29 : range === 'mtd' ? end.getDate() - 1 : 365));
    return { start, end };
  }, [customEnd, customStart, range]);
  const inPeriod = (value: string) => { const parsed = value.includes('/') ? new Date(value.split('/').reverse().join('-')) : new Date(value); return parsed >= dateBounds.start && parsed <= dateBounds.end; };
  const scopedSales = useMemo(() => sales.filter((sale) => sale.status === 'COMPLETED' && inPeriod(sale.createdAt) && (outlet === 'all' || sale.outletId === outlet)), [sales, outlet, dateBounds]);
  const scopedMovements = useMemo(() => movements.filter((movement) => inPeriod(movement.timestamp) && (outlet === 'all' || movement.outletId === outlet)), [movements, outlet, dateBounds]);
  const revenue = scopedSales.reduce((sum, sale) => sum + sale.total, 0);
  const frozenCogs = scopedSales.reduce((sum, sale) => sum + sale.items.reduce((inner, item) => inner + (item.frozenCostPrice || item.product.costPrice?.[sale.outletId] || 0) * item.quantity, 0), 0);
  const productRows = useMemo(() => { const rows: Record<string, Row> = {}; scopedSales.forEach((sale) => sale.items.forEach((item) => { const key = item.product.id; rows[key] = rows[key] || { name: item.product.name, qty: 0, revenue: 0, secondary: item.product.sku }; rows[key].qty += item.quantity; rows[key].revenue += item.lineTotal; })); return Object.values(rows).sort((a, b) => b.revenue - a.revenue); }, [scopedSales]);
  const categoryRows = useMemo(() => { const rows: Record<string, Row> = {}; scopedSales.forEach((sale) => sale.items.forEach((item) => { const name = item.product.category || 'Other'; rows[name] = rows[name] || { name, qty: 0, revenue: 0 }; rows[name].qty += item.quantity; rows[name].revenue += item.lineTotal; })); return Object.values(rows).sort((a, b) => b.revenue - a.revenue); }, [scopedSales]);
  const cashierRows = useMemo(() => { const rows: Record<string, Row> = {}; scopedSales.forEach((sale) => { rows[sale.cashierName] = rows[sale.cashierName] || { name: sale.cashierName, qty: 0, revenue: 0, secondary: 'Completed receipts' }; rows[sale.cashierName].qty += 1; rows[sale.cashierName].revenue += sale.total; }); return Object.values(rows).sort((a, b) => b.revenue - a.revenue); }, [scopedSales]);
  const customerRows = useMemo(() => { const rows: Record<string, Row> = {}; scopedSales.forEach((sale) => { const name = sale.customerName || 'Walk-in Customer'; rows[name] = rows[name] || { name, qty: 0, revenue: 0 }; rows[name].qty += 1; rows[name].revenue += sale.total; }); return Object.values(rows).sort((a, b) => b.revenue - a.revenue); }, [scopedSales]);
  const paymentRows = useMemo(() => ['cash', 'momo', 'card', 'transfer'].map((method) => ({ name: method === 'momo' ? 'Mobile Money' : method === 'card' ? 'Card' : method === 'transfer' ? 'Bank Transfer' : 'Cash', qty: scopedSales.reduce((sum, sale) => sum + sale.payments.filter((payment) => payment.method === method).length, 0), revenue: scopedSales.reduce((sum, sale) => sum + sale.payments.filter((payment) => payment.method === method).reduce((inner, payment) => inner + payment.amount, 0), 0) })), [scopedSales]);
  const movementRows = useMemo(() => { const rows: Record<string, Row> = {}; scopedMovements.forEach((movement) => { rows[movement.type] = rows[movement.type] || { name: movement.type.replaceAll('_', ' '), qty: 0, revenue: 0 }; rows[movement.type].qty += movement.quantity; rows[movement.type].revenue += Math.abs(movement.quantity * (movement.unitCost || 0)); }); return Object.values(rows).sort((a, b) => b.revenue - a.revenue); }, [scopedMovements]);
  // I-13: every discount and price override — user, approver, product, amount (FR-RPT-04).
  const discountRows = useMemo(() => {
    const rows: Row[] = [];
    scopedSales.forEach((sale) => {
      sale.items.forEach((item) => {
        if (item.discount > 0) {
          rows.push({
            name: item.product.name,
            qty: 1,
            revenue: item.discount,
            secondary: `${sale.receiptNumber} · line discount · ${sale.cashierName}`,
          });
        }
        if (item.floorPriceApproved) {
          const floor = item.product.floorPrice * item.conversionFactor;
          rows.push({
            name: item.product.name,
            qty: 1,
            revenue: Math.max(0, roundMoney(floor - item.unitPrice)),
            secondary: `${sale.receiptNumber} · below floor · approved by ${item.floorPriceApprover || 'manager'}`,
          });
        }
      });
      if (sale.discountTotal > 0) {
        rows.push({
          name: 'Cart discount',
          qty: 1,
          revenue: sale.discountTotal,
          secondary: `${sale.receiptNumber} · ${sale.cashierName} · ${sale.createdAt}`,
        });
      }
    });
    return rows.sort((a, b) => b.revenue - a.revenue);
  }, [scopedSales]);

  // I-09: nothing sold in the period, with the stock value tied up.
  const slowMoverRows = useMemo(() => {
    const sold = new Set<string>();
    scopedSales.forEach((sale) => sale.items.forEach((item) => sold.add(item.product.id)));
    return products
      .filter((product) => !sold.has(product.id) && product.active)
      .map((product) => {
        const outletIds = outlet === 'all' ? Object.keys(product.stock) : [outlet];
        const quantity = outletIds.reduce((sum, id) => sum + (product.stock[id] || 0), 0);
        const value = outletIds.reduce(
          (sum, id) => sum + (product.stock[id] || 0) * (product.costPrice[id] || 0),
          0,
        );
        return {
          name: product.name,
          qty: quantity,
          revenue: canProfit ? roundMoney(value) : 0,
          secondary: `${product.sku} · no sale in this period`,
        };
      })
      .filter((row) => row.qty > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [products, scopedSales, outlet, canProfit]);

  // I-10: point-in-time stock position per outlet.
  const stockRows = useMemo(
    () =>
      products
        .filter((product) => product.active)
        .map((product) => {
          const outletIds = outlet === 'all' ? Object.keys(product.stock) : [outlet];
          const quantity = outletIds.reduce((sum, id) => sum + (product.stock[id] || 0), 0);
          const value = outletIds.reduce(
            (sum, id) => sum + (product.stock[id] || 0) * (product.costPrice[id] || 0),
            0,
          );
          const reorder = outletIds.reduce((sum, id) => sum + (product.minStockAlert[id] || 0), 0);
          return {
            name: product.name,
            qty: quantity,
            revenue: canProfit ? roundMoney(value) : 0,
            secondary: `${product.sku} · reorder at ${reorder} ${product.baseUnit}${
              quantity <= reorder ? ' · LOW' : ''
            }`,
          };
        })
        .sort((a, b) => a.qty - b.qty),
    [products, outlet, canProfit],
  );

  // I-07: gross profit per product, from frozen sale-line costs (BR-5, FR-RPT-06).
  const profitRows = useMemo(() => {
    const rows: Record<string, { name: string; revenue: number; cogs: number; qty: number; sku: string }> = {};
    scopedSales.forEach((sale) =>
      sale.items.forEach((item) => {
        const key = item.product.id;
        rows[key] = rows[key] || { name: item.product.name, revenue: 0, cogs: 0, qty: 0, sku: item.product.sku };
        rows[key].revenue += item.lineTotal;
        rows[key].cogs += (item.frozenCostPrice || 0) * item.quantity;
        rows[key].qty += item.quantity;
      }),
    );
    return Object.values(rows)
      .map((row) => ({
        ...row,
        profit: roundMoney(row.revenue - row.cogs),
        margin: row.revenue > 0 ? ((row.revenue - row.cogs) / row.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [scopedSales]);

  const voidRows = sales.filter((sale) => sale.status === 'VOIDED' && (outlet === 'all' || sale.outletId === outlet)).map((sale) => ({ name: sale.receiptNumber, qty: 1, revenue: sale.total, secondary: sale.voidReason || 'Voided transaction' }));
  const purchaseRows = scopedMovements.filter((movement) => movement.type === 'RECEIPT').map((movement) => ({ name: movement.productName, qty: movement.quantity, revenue: Math.abs(movement.quantity * (movement.unitCost || 0)), secondary: movement.referenceNumber || movement.user }));
  const exportReport = () => exportToCsv(`report-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`, ['Report', 'Outlet', 'Period', 'Metric', 'Value'], [['Business report', outlet, range, 'Completed sales', scopedSales.length], ['Business report', outlet, range, 'Revenue (GHS)', revenue.toFixed(2)], ...productRows.map((row) => ['Sales by product', outlet, range, row.name, row.revenue.toFixed(2)])]);
  const renderReport = () => {
    if (activeTab === 'product' || activeTab === 'best-sellers') return <ReportTable title={activeTab === 'product' ? 'Sales by product' : 'Best sellers by value'} rows={productRows.slice(0, 12)} columns={['Product', 'Units', 'Revenue']} />;
    if (activeTab === 'category') return <ReportTable title="Sales by category" rows={categoryRows} columns={['Category', 'Units', 'Revenue']} />;
    if (activeTab === 'cashier') return <ReportTable title="Sales by cashier" rows={cashierRows} columns={['Cashier', 'Receipts', 'Revenue']} />;
    if (activeTab === 'customer') return <ReportTable title="Sales by customer" rows={customerRows.slice(0, 12)} columns={['Customer', 'Receipts', 'Revenue']} />;
    if (activeTab === 'payments') return <ReportTable title="Payment method breakdown" rows={paymentRows} columns={['Method', 'Payments', 'Value']} />;
    if (activeTab === 'movements') return <ReportTable title="Stock movement report" rows={movementRows} columns={['Movement type', 'Units', 'Value']} />;
    if (activeTab === 'purchases') return <ReportTable title="Purchases report" rows={purchaseRows.slice(0, 12)} columns={['Product', 'Units received', 'Cost']} />;
    if (activeTab === 'voids') return <ReportTable title="Void and refund log" rows={voidRows} columns={['Reference', 'Count', 'Value']} />;
    if (activeTab === 'discounts') return <ReportTable title="Discount and override log" rows={discountRows} columns={['Product / reason', 'Count', 'Given away']} />;
    if (activeTab === 'slow-movers') return <ReportTable title="Slow movers — no sale this period" rows={slowMoverRows} columns={['Product', 'Units held', canProfit ? 'Value tied up' : '—']} />;
    if (activeTab === 'stock') return <ReportTable title="Stock on hand" rows={stockRows} columns={['Product', 'Quantity', canProfit ? 'Value at cost' : '—']} />;
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
              value={revenue > 0 ? `${(((revenue - frozenCogs) / revenue) * 100).toFixed(1)}%` : '—'}
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
                  {profitRows.map((row) => (
                    <tr key={row.sku} className="border-t border-slate-100">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-800">{row.name}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{row.sku}</div>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600">{row.qty}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{money(row.revenue)}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{money(row.cogs)}</td>
                      <td className="px-5 py-3 text-right font-bold text-emerald-700">{money(row.profit)}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-900">{row.margin.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
    return <ReportTable title="Sales summary" rows={scopedSales.map((sale) => ({ name: sale.receiptNumber, qty: sale.items.reduce((sum, item) => sum + item.quantity, 0), revenue: sale.total, secondary: `${sale.cashierName} · ${sale.createdAt}` }))} columns={['Receipt', 'Units', 'Total']} />;
  };
  return <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6 animate-fade-in"><header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-micro-caps text-accent-700">Reporting workspace</p><div className="mt-1 flex items-center gap-2"><h1 className="text-2xl font-black text-slate-900">Business reports</h1><InfoHint text="Review sales, stock, payments, and control activity from recorded transactions." /></div></div><div className="flex flex-wrap gap-2"><select value={outlet} onChange={(event) => setOutlet(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><option value="all">All outlets</option>{outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={range} onChange={(event) => setRange(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="mtd">Month to date</option><option value="ytd">Year to date</option></select><button onClick={exportReport} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Export</button></div></header><nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Report sections"><button onClick={() => setActiveTab('index')} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold ${activeTab === 'index' ? 'border-accent-600 text-accent-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Report index</button>{reportGroups.filter((item) => item.key !== 'profit' || canProfit).map((item) => <button key={item.key} onClick={() => setActiveTab(item.key)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold ${activeTab === item.key ? 'border-accent-600 text-accent-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</nav>{activeTab === 'index' ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{[['Sales', 'Revenue, products, categories, cashiers, and customers.', 'sales', <TrendingUp className="h-5 w-5" />], ['Stock', 'Stock position, valuation, movements, and slow movers.', 'stock', <Package className="h-5 w-5" />], ['Cash', 'Payment methods, shifts, and end-of-day reconciliation.', 'payments', <Wallet className="h-5 w-5" />], ['Control', 'Discounts, overrides, voids, refunds, and purchases.', 'voids', <ShieldCheck className="h-5 w-5" />]].map(([title, description, key, icon]) => <button key={String(key)} onClick={() => setActiveTab(key as ReportTab)} className="group border border-slate-200 bg-white p-5 text-left transition-colors hover:border-accent-300"><span className="text-accent-700">{icon}</span><h2 className="mt-4 text-sm font-black text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><span className="mt-5 inline-block text-xs font-bold text-accent-700 group-hover:text-accent-800">Open report group</span></button>)}</div> : <section className="space-y-4"><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Metric label="Completed sales" value={String(scopedSales.length)} /><Metric label="Revenue" value={money(revenue)} /><Metric label="Report period" value={range === '30d' ? 'Last 30 days' : range.toUpperCase()} /></div>{renderReport()}</section>}</div>;
};

const Metric = ({ label, value, valueClass = 'text-slate-900' }: { label: string; value: string; valueClass?: string }) => <div className="border border-slate-200 bg-white p-4"><p className="text-micro-caps text-slate-500">{label}</p><p className={`mt-2 text-lg font-black ${valueClass}`}>{value}</p></div>;
