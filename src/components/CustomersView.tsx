import React, { useState } from 'react';
import { Users, Search, Plus, Phone, UserCheck, Briefcase, Award } from 'lucide-react';
import { Customer } from '../types';

interface CustomersViewProps {
  customers: Customer[];
  onAddCustomer: (customer: Customer) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({ customers, onAddCustomer }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerType, setCustomerType] = useState<Customer['customerType']>('electrician');
  const [notes, setNotes] = useState('');

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.customerType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      name,
      phone,
      customerType,
      totalPurchased: 0,
      salesCount: 0,
      discountRate: customerType === 'electrician' ? 8 : customerType === 'contractor' ? 10 : customerType === 'company' ? 12 : 0,
      notes,
    };

    onAddCustomer(newCust);
    setModalOpen(false);
    setName('');
    setPhone('');
    setNotes('');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Customers Directory</h1>
            <span className="bg-orange-100 text-orange-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
              Trade vs Retail Pricing (FR-CUST-04)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Electricians and contractors receive trade-discounted pricing automatically at POS checkout.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, phone, or trade type..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-orange-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-bold">{filtered.length} Customers</div>
      </div>

      {/* Customer Grid / Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Phone Number</th>
              <th className="py-3 px-4">Customer Type</th>
              <th className="py-3 px-4">POS Pricing Tier</th>
              <th className="py-3 px-4 text-right">Lifetime Purchased</th>
              <th className="py-3 px-4 text-right">Orders</th>
              <th className="py-3 px-4">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 font-bold text-slate-800">{c.name}</td>
                <td className="py-3 px-4 font-mono text-slate-600">{c.phone}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                      c.customerType === 'electrician'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : c.customerType === 'contractor'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : c.customerType === 'company'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {c.customerType}
                  </span>
                </td>
                <td className="py-3 px-4 font-semibold text-slate-700">
                  {c.customerType === 'retail' ? (
                    'Retail Standard'
                  ) : (
                    <span className="text-orange-600 font-bold">Trade Price ({c.discountRate || 8}% off)</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right font-black text-slate-900">
                  GH₵ {c.totalPurchased.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right text-slate-600 font-mono">{c.salesCount}</td>
                <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{c.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Customer Modal */}
      {modalOpen && (
        <div 
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5 border border-slate-200 animate-modal-card"
          >
            <h3 className="font-black text-base text-slate-800 mb-3">Add New Customer</h3>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name / Company *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Phone Number (Ghana) *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0244123456"
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Customer Classification *</label>
                <select
                  value={customerType}
                  onChange={(e) => setCustomerType(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white font-medium"
                >
                  <option value="electrician">Electrician (Auto Trade Price)</option>
                  <option value="contractor">Contractor (Auto Trade Price + 10%)</option>
                  <option value="company">Corporate / Construction Company</option>
                  <option value="retail">Retail Walk-in Customer</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Site / Project Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-300 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
