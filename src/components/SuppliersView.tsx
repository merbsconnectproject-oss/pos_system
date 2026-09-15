import React, { useMemo, useState } from 'react';
import { Building, CalendarClock, FileText, Mail, Package, Phone, Plus, Search, Truck, Wallet, X } from 'lucide-react';
import { Outlet, Product, StockMovement, Supplier } from '../types';
import { InfoHint } from './InfoHint';
import { TablePagination } from './TablePagination';

type SupplierMode = 'list' | 'receipts' | 'purchase-orders' | 'balances';

interface SuppliersViewProps {
  suppliers: Supplier[];
  products?: Product[];
  movements?: StockMovement[];
  currentOutlet: Outlet;
  outlets?: Outlet[];
  onAddSupplier: (supplier: Supplier) => void;
  onUpdateSupplier?: (supplier: Supplier) => void;
  onReceiveStock: (supplierId: string) => void;
}

const formatMoney = (amount: number) => `GH₵ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  products = [],
  movements = [],
  currentOutlet,
  outlets = [currentOutlet],
  onAddSupplier,
  onUpdateSupplier,
  onReceiveStock,
}) => {
  const [activeMode, setActiveMode] = useState<SupplierMode>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [storeFilter, setStoreFilter] = useState(currentOutlet.id === 'all-outlets' ? 'all' : currentOutlet.id);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const realOutlets = outlets.filter((outlet) => outlet.id !== 'all-outlets');
  const defaultOutlet = currentOutlet.id === 'all-outlets' ? realOutlets[0]?.id || 'inco-hardware' : currentOutlet.id;
  const [form, setForm] = useState({
    outletId: '',
    name: '',
    contactPerson: '',
    categorySupplied: '',
    phone: '',
    email: '',
    paymentTerms: '' as Supplier['paymentTerms'] | '',
    address: '',
  });

  const filtered = useMemo(
    () =>
      suppliers.filter((supplier) => {
        if (storeFilter !== 'all' && supplier.outletId && supplier.outletId !== 'all-outlets' && supplier.outletId !== storeFilter) return false;
        const haystack = `${supplier.name} ${supplier.contactPerson} ${supplier.phone} ${supplier.email || ''} ${supplier.categorySupplied || ''}`.toLowerCase();
        return searchTerm.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
      }),
    [searchTerm, storeFilter, suppliers]
  );

  const startCreate = () => {
    setEditingSupplier(null);
    setForm({
      outletId: '',
      name: '',
      contactPerson: '',
      categorySupplied: '',
      phone: '',
      email: '',
      paymentTerms: '',
      address: '',
    });
    setModalOpen(true);
  };

  const startEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setForm({
      outletId: supplier.outletId || defaultOutlet,
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      categorySupplied: supplier.categorySupplied || '',
      phone: supplier.phone,
      email: supplier.email || '',
      paymentTerms: supplier.paymentTerms,
      address: supplier.address,
    });
    setModalOpen(true);
  };

  const submitSupplier = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.outletId || !form.paymentTerms) return;
    const supplier: Supplier = {
      id: editingSupplier?.id || `sup-${Date.now()}`,
      name: form.name.trim(),
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      paymentTerms: form.paymentTerms,
      address: form.address.trim(),
      totalSupplied: editingSupplier?.totalSupplied || 0,
      outletId: form.outletId,
      categorySupplied: form.categorySupplied.trim(),
    };
    if (editingSupplier && onUpdateSupplier) onUpdateSupplier(supplier);
    else onAddSupplier(supplier);
    setModalOpen(false);
  };

  const supplierProducts = (supplier: Supplier) =>
    products.filter((product) => {
      const line = supplier.categorySupplied?.toLowerCase() || '';
      return line && (line.includes(product.category.toLowerCase().split(' ')[0]) || product.category.toLowerCase().includes(line.split(' ')[0]));
    });

  const receiptRows = movements.filter((movement) => movement.type === 'RECEIPT');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Suppliers</h1><InfoHint text="Supplier records, receipt history, purchase planning and balances." /></div>
        </div>
        <button onClick={startCreate} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs self-start lg:self-auto">
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs flex gap-1 overflow-x-auto">
        {[
          ['list', 'Suppliers'],
          ['receipts', 'Receipt History'],
          ['purchase-orders', 'Purchase Orders'],
          ['balances', 'Balances'],
        ].map(([value, label]) => (
          <button key={value} onClick={() => setActiveMode(value as SupplierMode)} className={`px-3.5 py-2 rounded-lg text-xs font-black whitespace-nowrap ${activeMode === value ? 'bg-accent-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeMode === 'list' && (
        <>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search supplier, contact, phone or product line..." className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-accent-500" />
            </div>
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="w-full sm:w-auto text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700">
              <option value="all">All outlets</option>
              {realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-black border-b border-slate-200 uppercase text-[10px] tracking-wide">
                  <tr>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Terms</th>
                    <th className="py-3 px-4">Last Receipt</th>
                    <th className="py-3 px-4 text-right">Total Purchased</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.slice((page - 1) * pageSize, page * pageSize).map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <button onClick={() => setSelectedSupplier(supplier)} className="font-bold text-slate-900 hover:text-accent-600 text-left">{supplier.name}</button>
                        <div className="text-[10px] text-slate-400">{supplier.categorySupplied || 'General supplier'}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <div className="font-bold">{supplier.contactPerson}</div>
                        <div className="font-mono text-[10px]">{supplier.phone}</div>
                      </td>
                      <td className="py-3 px-4"><span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold">{supplier.paymentTerms}</span></td>
                      <td className="py-3 px-4 text-slate-500">{receiptRows[0]?.timestamp || 'No receipts yet'}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">{formatMoney(supplier.totalSupplied)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => setSelectedSupplier(supplier)} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">View</button>
                          <button onClick={() => startEdit(supplier)} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">Edit</button>
                          <button onClick={() => onReceiveStock(supplier.id)} className="px-2 py-1 rounded-lg bg-accent-500 text-white font-bold hover:bg-accent-600">Receive</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <Building className="w-12 h-12 mx-auto text-slate-300" />
                        <h3 className="mt-3 font-black text-slate-900">No suppliers yet</h3>
                        <button onClick={startCreate} className="mt-2 text-sm font-bold text-accent-600 hover:underline">Add supplier</button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        </>
      )}

      {activeMode === 'receipts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center gap-3">
            <FileText className="w-5 h-5 text-accent-600" />
            <div>
              <h2 className="text-sm font-black text-slate-900">Receipt History</h2>
              <p className="text-xs text-slate-500">Read-only goods receipt records and movement references.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {receiptRows.map((movement) => (
              <div key={movement.id} className="p-4 grid grid-cols-1 md:grid-cols-[1fr_140px_120px_160px] gap-3 items-center">
                <div>
                  <div className="font-bold text-slate-900">{movement.productName}</div>
                  <div className="text-xs text-slate-500">{movement.reason}</div>
                </div>
                <span className="font-mono text-xs text-slate-600">{movement.referenceNumber}</span>
                <span className="font-black text-slate-900">+{movement.quantity}</span>
                <span className="text-xs text-slate-500">{movement.timestamp}</span>
              </div>
            ))}
            {receiptRows.length === 0 && <div className="py-14 text-center text-sm text-slate-500">No goods receipts posted yet.</div>}
          </div>
        </div>
      )}

      {activeMode === 'purchase-orders' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-start gap-3">
            <CalendarClock className="w-6 h-6 text-accent-600" />
            <div>
              <h2 className="text-lg font-black text-slate-900">Purchase Orders</h2>
              <p className="text-sm text-slate-500">Stage 2 workspace for purchase orders, partial delivery, over-delivery and short-delivery handling.</p>
            </div>
          </div>
        </div>
      )}

      {activeMode === 'balances' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filtered.slice(0, 6).map((supplier) => (
            <div key={supplier.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <Wallet className="w-5 h-5 text-accent-600" />
              <h3 className="mt-3 text-sm font-black text-slate-900">{supplier.name}</h3>
              <div className="mt-1 text-2xl font-black text-slate-900">{formatMoney(supplier.totalSupplied * 0.18)}</div>
              <p className="text-xs text-slate-500 mt-1">Estimated outstanding balance pending supplier invoice model.</p>
            </div>
          ))}
        </div>
      )}

      {selectedSupplier && (
        <div className="fixed inset-0 z-70 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-modal-backdrop">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-300 flex flex-col animate-drawer-right">
            <div className="bg-slate-900 text-white px-6 py-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-white">{selectedSupplier.name}</h2>
                <p className="text-xs text-slate-400 mt-1">{selectedSupplier.categorySupplied || 'Supplier detail'}</p>
              </div>
              <button onClick={() => setSelectedSupplier(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['Contact', selectedSupplier.contactPerson],
                  ['Phone', selectedSupplier.phone],
                  ['Email', selectedSupplier.email || 'Not recorded'],
                  ['Terms', selectedSupplier.paymentTerms],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                    <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{value}</div>
                  </div>
                ))}
              </div>
              <section className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200"><h3 className="text-sm font-black text-slate-900">Products supplied</h3></div>
                <div className="divide-y divide-slate-100">
                  {supplierProducts(selectedSupplier).slice(0, 8).map((product) => (
                    <div key={product.id} className="px-4 py-3 flex justify-between text-sm">
                      <span className="font-bold text-slate-800">{product.name}</span>
                      <span className="text-slate-500">{product.category}</span>
                    </div>
                  ))}
                  {supplierProducts(selectedSupplier).length === 0 && <div className="py-8 text-center text-sm text-slate-500">No linked products yet.</div>}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div onClick={() => setModalOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div onClick={(event) => event.stopPropagation()} className="bg-white rounded-xl w-full max-w-3xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card flex flex-col max-h-[92vh]">
            <div className="bg-slate-900 text-white px-6 py-5 sm:px-8 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent-500/20 border border-accent-500/40 text-accent-400 flex items-center justify-center"><Truck className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-black text-xl text-white">{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Supplier identity, contact details, payment terms and outlet assignment.</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitSupplier} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="text-sm font-bold text-slate-800">Supplier Name *<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
                <label className="text-sm font-bold text-slate-800">Contact Person *<input required value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
                <label className="text-sm font-bold text-slate-800">Phone *<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono focus:outline-accent-500" /></label>
                <label className="text-sm font-bold text-slate-800">Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
                <label className="text-sm font-bold text-slate-800">Payment Terms<select required value={form.paymentTerms} onChange={(event) => setForm({ ...form, paymentTerms: event.target.value as Supplier['paymentTerms'] | '' })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-accent-500"><option value="" disabled>Select payment terms</option><option>Cash on Delivery</option><option>Net 14</option><option>Net 30</option><option>Advance</option></select></label>
                <label className="text-sm font-bold text-slate-800">Outlet<select required value={form.outletId} onChange={(event) => setForm({ ...form, outletId: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-accent-500"><option value="" disabled>Select outlet</option>{realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label>
              </div>
              <label className="text-sm font-bold text-slate-800 block">Supplied Product Lines<input value={form.categorySupplied} onChange={(event) => setForm({ ...form, categorySupplied: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
              <label className="text-sm font-bold text-slate-800 block">Address<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
              <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setModalOpen(false)} className="sm:w-1/3 py-3 rounded-lg border border-slate-300 font-bold text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="sm:w-2/3 py-3 rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-bold text-sm shadow-xs">{editingSupplier ? 'Save Changes' : 'Save Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
