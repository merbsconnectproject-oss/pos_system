import React, { useState } from 'react';
import { Truck, Search, Plus, Phone, Mail, Building, FileText, Store, Tag, X } from 'lucide-react';
import { Supplier, Outlet } from '../types';

interface SuppliersViewProps {
  suppliers: Supplier[];
  currentOutlet: Outlet;
  onAddSupplier: (supplier: Supplier) => void;
  onReceiveStock: (supplierId: string) => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  currentOutlet,
  onAddSupplier,
  onReceiveStock,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [storeFilter, setStoreFilter] = useState<'all' | 'inco-hardware' | 'apex-electricals'>(
    currentOutlet.id === 'all-outlets' ? 'all' : (currentOutlet.id as any)
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [targetStore, setTargetStore] = useState<'inco-hardware' | 'apex-electricals'>(
    currentOutlet.id === 'apex-electricals' ? 'apex-electricals' : 'inco-hardware'
  );
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [categorySupplied, setCategorySupplied] = useState('Power & Hand Tools');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [address, setAddress] = useState('');

  const filtered = suppliers.filter((s) => {
    // Store filter
    if (storeFilter !== 'all') {
      if (s.outletId && s.outletId !== 'all-outlets' && s.outletId !== storeFilter) {
        return false;
      }
    }
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm) ||
      (s.categorySupplied && s.categorySupplied.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      name,
      outletId: targetStore,
      categorySupplied,
      contactPerson,
      phone,
      email,
      paymentTerms,
      address,
      totalSupplied: 0,
    };

    onAddSupplier(newSup);
    setModalOpen(false);
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Suppliers & Vendor Directory</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Registered wholesale distributors, authorized brand importers, and verified factory accounts.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search vendor, contact person, product line..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-orange-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold">
            <button
              onClick={() => setStoreFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                storeFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'
              }`}
            >
              All Vendors ({suppliers.length})
            </button>
            <button
              onClick={() => setStoreFilter('inco-hardware')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                storeFilter === 'inco-hardware' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-500'
              }`}
            >
              Inco Hardware
            </button>
            <button
              onClick={() => setStoreFilter('apex-electricals')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                storeFilter === 'apex-electricals' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'
              }`}
            >
              Apex Electricals
            </button>
          </div>
        </div>
      </div>

      {/* Supplier Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <div
            key={s.id}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-black text-sm text-slate-900">{s.name}</h3>
                  {s.categorySupplied && (
                    <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
                      {s.categorySupplied}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded shrink-0">
                  {s.paymentTerms}
                </span>
              </div>

              {/* Store Affiliation Badge */}
              <div className="pt-1">
                {s.outletId === 'inco-hardware' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Inco Hardware Vendor
                  </span>
                ) : s.outletId === 'apex-electricals' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    Apex Electricals Vendor
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    Both Stores
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-600 space-y-1 pt-1">
                <div>
                  Contact: <strong className="text-slate-800">{s.contactPerson}</strong>
                </div>
                <div className="font-mono text-slate-500 flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-slate-400" /> {s.phone}
                </div>
                {s.email && (
                  <div className="text-slate-500 flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-slate-400" /> {s.email}
                  </div>
                )}
                {s.address && <div className="text-[11px] text-slate-400">{s.address}</div>}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Total Purchased:</span>
                <strong className="text-slate-900 font-black">
                  GH₵ {s.totalSupplied.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <button
                onClick={() => onReceiveStock(s.id)}
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg shadow-2xs cursor-pointer transition-colors"
              >
                Receive Stock
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Supplier Modal */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 border border-slate-200 animate-modal-card"
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-black text-base text-slate-800">Add Supplier</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              {/* Target Store */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Store *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetStore('inco-hardware');
                      setCategorySupplied('Power & Hand Tools');
                    }}
                    className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                      targetStore === 'inco-hardware'
                        ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-slate-800">Inco Hardware</div>
                    <div className="text-[10px] text-slate-500">Hardware & Plumbing</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetStore('apex-electricals');
                      setCategorySupplied('Cables & Switchgear');
                    }}
                    className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                      targetStore === 'apex-electricals'
                        ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-slate-800">Apex Electricals</div>
                    <div className="text-[10px] text-slate-500">Cables & Solar</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Company / Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Somotex Ghana Ltd"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Supplied Products / Lines</label>
                <input
                  type="text"
                  value={categorySupplied}
                  onChange={(e) => setCategorySupplied(e.target.value)}
                  placeholder="e.g. PVC pipes, fittings, glue"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Contact Representative *</label>
                <input
                  type="text"
                  required
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Evans Frimpong"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="024 456 7890"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="Cash on Delivery">Cash on Delivery</option>
                    <option value="Net 14">Net 14 Days</option>
                    <option value="Net 30">Net 30 Days</option>
                    <option value="Net 60">Net 60 Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sales@vendor.com"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Warehouse / Factory Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Heavy Industrial Area, Tema"
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-300 font-bold text-slate-600 cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold cursor-pointer shadow-xs"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
