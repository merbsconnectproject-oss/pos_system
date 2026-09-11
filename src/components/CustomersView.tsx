import React, { useMemo, useState } from 'react';
import { Briefcase, CalendarClock, CreditCard, Edit2, Phone, Plus, Search, Users, X } from 'lucide-react';
import { CompletedSale, Customer, Outlet } from '../types';
import { InfoHint } from './InfoHint';

type CustomerMode = 'list' | 'purchases' | 'types' | 'credit';

interface CustomersViewProps {
  customers: Customer[];
  sales?: CompletedSale[];
  outlets?: Outlet[];
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomer?: (customer: Customer) => void;
}

const formatMoney = (amount: number) => `GH₵ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  sales = [],
  outlets = [],
  onAddCustomer,
  onUpdateCustomer,
}) => {
  const [activeMode, setActiveMode] = useState<CustomerMode>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    customerType: '' as Customer['customerType'] | '',
    notes: '',
  });

  const filtered = useMemo(
    () =>
      customers.filter((customer) => {
        const haystack = `${customer.name} ${customer.phone} ${customer.customerType} ${customer.notes || ''}`.toLowerCase();
        return searchTerm.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
      }),
    [customers, searchTerm]
  );

  const startCreate = () => {
    setEditingCustomer(null);
    setForm({ name: '', phone: '', email: '', address: '', customerType: '', notes: '' });
    setModalOpen(true);
  };

  const startEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: '',
      address: '',
      customerType: customer.customerType,
      notes: customer.notes || '',
    });
    setModalOpen(true);
  };

  const submitCustomer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.customerType) return;
    const customer: Customer = {
      id: editingCustomer?.id || `cust-${Date.now()}`,
      name: form.name.trim(),
      phone: form.phone.trim(),
      customerType: form.customerType,
      totalPurchased: editingCustomer?.totalPurchased || 0,
      salesCount: editingCustomer?.salesCount || 0,
      discountRate:
        form.customerType === 'electrician'
          ? 8
          : form.customerType === 'contractor'
          ? 10
          : form.customerType === 'company'
          ? 12
          : 0,
      notes: form.notes.trim(),
    };
    if (editingCustomer && onUpdateCustomer) onUpdateCustomer(customer);
    else onAddCustomer(customer);
    setModalOpen(false);
  };

  const customerSales = (customer: Customer) =>
    sales.filter((sale) => sale.customerId === customer.id || sale.customerPhone === customer.phone || sale.customerName === customer.name);

  const typeRows = [
    ['retail', 'Retail Standard', 'Retail price', 0],
    ['electrician', 'Electrician', 'Trade price', 8],
    ['contractor', 'Contractor', 'Trade price', 10],
    ['company', 'Company', 'Trade price / account', 12],
  ] as const;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Customers</h1><InfoHint text="Shared customer directory, trade pricing, purchase history and credit-account readiness." /></div>
        </div>
        <button onClick={startCreate} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs self-start lg:self-auto">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs flex gap-1 overflow-x-auto">
        {[
          ['list', 'Customers'],
          ['purchases', 'Purchase History'],
          ['types', 'Customer Types'],
          ['credit', 'Credit Accounts'],
        ].map(([value, label]) => (
          <button key={value} onClick={() => setActiveMode(value as CustomerMode)} className={`px-3.5 py-2 rounded-lg text-xs font-black whitespace-nowrap ${activeMode === value ? 'bg-accent-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeMode === 'list' && (
        <>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name, phone, or customer type..." className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-accent-500" />
            </div>
            <div className="hidden sm:block text-xs text-slate-500 font-bold">{filtered.length} customers</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-black border-b border-slate-200 uppercase text-[10px] tracking-wide">
                  <tr>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Price Level</th>
                    <th className="py-3 px-4 text-right">Total Spent</th>
                    <th className="py-3 px-4 text-right">Purchases</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <button onClick={() => setSelectedCustomer(customer)} className="font-bold text-slate-900 hover:text-accent-600">{customer.name}</button>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">{customer.notes || 'No notes recorded'}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{customer.phone}</td>
                      <td className="py-3 px-4"><span className="capitalize rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold">{customer.customerType}</span></td>
                      <td className="py-3 px-4 font-semibold text-slate-700">{customer.customerType === 'retail' ? 'Retail Standard' : `Trade Price (${customer.discountRate || 8}% off)`}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">{formatMoney(customer.totalPurchased)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">{customer.salesCount}</td>
                      <td className="py-3 px-4">
                        <div className="flex justify-center gap-1.5">
                          <button onClick={() => setSelectedCustomer(customer)} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">View</button>
                          <button onClick={() => startEdit(customer)} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <Users className="w-12 h-12 mx-auto text-slate-300" />
                        <h3 className="mt-3 font-black text-slate-900">No registered customers</h3>
                        <p className="text-sm text-slate-500 mt-1">Walk-in sales can still complete without a customer attached.</p>
                        <button onClick={startCreate} className="mt-2 text-sm font-bold text-accent-600 hover:underline">Add customer</button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeMode === 'purchases' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center gap-3">
            <CalendarClock className="w-5 h-5 text-accent-600" />
            <div>
              <h2 className="text-sm font-black text-slate-900">Purchase History</h2>
              <p className="text-xs text-slate-500">Sales linked to registered customers across outlets.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {sales.filter((sale) => sale.customerId).map((sale) => (
              <div key={sale.id} className="p-4 grid grid-cols-1 md:grid-cols-[1fr_140px_140px_160px] gap-3 items-center">
                <div>
                  <div className="font-bold text-slate-900">{sale.customerName}</div>
                  <div className="text-xs text-slate-500">{sale.receiptNumber} / {sale.outletName}</div>
                </div>
                <span className="font-mono text-xs text-slate-600">{sale.createdAt}</span>
                <span className="font-black text-slate-900">{formatMoney(sale.total)}</span>
                <span className="text-xs text-slate-500">{sale.items.length} lines</span>
              </div>
            ))}
            {sales.filter((sale) => sale.customerId).length === 0 && <div className="py-14 text-center text-sm text-slate-500">No customer-linked purchases yet.</div>}
          </div>
        </div>
      )}

      {activeMode === 'types' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {typeRows.map(([type, label, priceLevel, discount]) => (
            <div key={type} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <Briefcase className="w-5 h-5 text-accent-600" />
              <h3 className="mt-3 text-sm font-black text-slate-900">{label}</h3>
              <p className="text-xs text-slate-500 mt-1">{priceLevel}</p>
              <div className="mt-4 text-2xl font-black text-slate-900">{discount}%</div>
              <p className="text-xs text-slate-500">Default discount mapping</p>
            </div>
          ))}
        </div>
      )}

      {activeMode === 'credit' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-start gap-3">
            <CreditCard className="w-6 h-6 text-accent-600" />
            <div>
              <h2 className="text-lg font-black text-slate-900">Credit Accounts</h2>
              <p className="text-sm text-slate-500">Stage 2 workspace for limits, balances, ageing, statements and part payments.</p>
            </div>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 z-70 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-modal-backdrop">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-300 flex flex-col animate-drawer-right">
            <div className="bg-slate-900 text-white px-6 py-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-white">{selectedCustomer.name}</h2>
                <p className="text-xs text-slate-400 mt-1">{selectedCustomer.phone}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Type', selectedCustomer.customerType],
                  ['Price level', selectedCustomer.customerType === 'retail' ? 'Retail' : 'Trade'],
                  ['Total spent', formatMoney(selectedCustomer.totalPurchased)],
                  ['Purchases', String(selectedCustomer.salesCount)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                    <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
                    <div className="mt-1 text-sm font-bold text-slate-800 capitalize">{value}</div>
                  </div>
                ))}
              </div>
              <section className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200"><h3 className="text-sm font-black text-slate-900">Purchase history</h3></div>
                <div className="divide-y divide-slate-100">
                  {customerSales(selectedCustomer).map((sale) => (
                    <div key={sale.id} className="px-4 py-3 flex justify-between gap-3 text-sm">
                      <div>
                        <div className="font-bold text-slate-800">{sale.receiptNumber}</div>
                        <div className="text-xs text-slate-500">{outlets.find((outlet) => outlet.id === sale.outletId)?.name || sale.outletName}</div>
                      </div>
                      <div className="font-black text-slate-900">{formatMoney(sale.total)}</div>
                    </div>
                  ))}
                  {customerSales(selectedCustomer).length === 0 && <div className="py-8 text-center text-sm text-slate-500">No linked purchases yet.</div>}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div onClick={() => setModalOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div onClick={(event) => event.stopPropagation()} className="bg-white rounded-xl w-full max-w-2xl shadow-2xl border border-slate-300 overflow-hidden animate-modal-card flex flex-col max-h-[92vh]">
            <div className="bg-slate-900 text-white px-6 py-5 sm:px-8 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent-500/20 border border-accent-500/40 text-accent-400 flex items-center justify-center"><Users className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-black text-xl text-white">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Customer profile, phone lookup key and price-level mapping.</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitCustomer} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="text-sm font-bold text-slate-800">Name or Company *<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
                <label className="text-sm font-bold text-slate-800">Phone *<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono focus:outline-accent-500" /></label>
                <label className="text-sm font-bold text-slate-800">Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
                <label className="text-sm font-bold text-slate-800">Type<select required value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value as Customer['customerType'] | '' })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-accent-500"><option value="" disabled>Select customer type</option><option value="retail">Retail</option><option value="electrician">Electrician</option><option value="contractor">Contractor</option><option value="company">Company</option></select></label>
              </div>
              <label className="text-sm font-bold text-slate-800 block">Address<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
              <label className="text-sm font-bold text-slate-800 block">Notes<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-1.5 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-accent-500" /></label>
              <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setModalOpen(false)} className="sm:w-1/3 py-3 rounded-lg border border-slate-300 font-bold text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="sm:w-2/3 py-3 rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-bold text-sm shadow-xs">{editingCustomer ? 'Save Changes' : 'Save Customer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
