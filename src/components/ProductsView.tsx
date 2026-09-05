import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  Package,
  AlertTriangle,
  CheckCircle2,
  X,
  Edit2,
  Sliders,
  Truck,
  PowerOff,
  Power,
  Layers,
  Store,
  Tag,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { Product, Outlet } from '../types';
import { exportToCsv } from '../utils/csvExport';

interface ProductsViewProps {
  products: Product[];
  currentOutlet: Outlet;
  onAddProduct: (product: Product) => void;
  onOpenGoodsReceipt: (productId?: string) => void;
  onOpenAdjustment: (product: Product) => void;
  onToggleActive: (productId: string) => void;
  initialFilter?: 'all' | 'low-stock';
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  currentOutlet,
  onAddProduct,
  onOpenGoodsReceipt,
  onOpenAdjustment,
  onToggleActive,
  initialFilter = 'all',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [storeFilter, setStoreFilter] = useState<'all' | 'inco-hardware' | 'apex-electricals'>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low-stock'>(initialFilter);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // New product form state
  const [newProdStore, setNewProdStore] = useState<'inco-hardware' | 'apex-electricals'>(
    currentOutlet.id === 'apex-electricals' ? 'apex-electricals' : 'inco-hardware'
  );
  const [newProdName, setNewProdName] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdCategory, setNewProdCategory] = useState<any>('Power Tools & Machinery');
  const [newProdBrand, setNewProdBrand] = useState('Ingco Tools');
  const [newProdBaseUnit, setNewProdBaseUnit] = useState<any>('pcs');
  const [newProdRetailPrice, setNewProdRetailPrice] = useState<number>(350.0);
  const [newProdTradePrice, setNewProdTradePrice] = useState<number>(310.0);
  const [newProdFloorPrice, setNewProdFloorPrice] = useState<number>(290.0);
  const [newProdCost, setNewProdCost] = useState<number>(230.0);
  const [newProdStock, setNewProdStock] = useState<number>(20);
  const [newProdMinAlert, setNewProdMinAlert] = useState<number>(5);

  // Reset categories and filters when outlet changes
  useEffect(() => {
    setCategoryFilter('All');
    if (currentOutlet.id !== 'all-outlets') {
      setNewProdStore(currentOutlet.id as 'inco-hardware' | 'apex-electricals');
    }
  }, [currentOutlet.id]);

  // Adjust form defaults when store changes in the Add modal
  const handleStoreChange = (store: 'inco-hardware' | 'apex-electricals') => {
    setNewProdStore(store);
    if (store === 'inco-hardware') {
      setNewProdCategory('Power Tools & Machinery');
      setNewProdBrand('Ingco Tools');
      setNewProdBaseUnit('pcs');
      setNewProdSku('INC-');
      setNewProdCost(230);
      setNewProdRetailPrice(350);
      setNewProdTradePrice(310);
      setNewProdFloorPrice(290);
    } else {
      setNewProdCategory('Cables & Wires');
      setNewProdBrand('Nexans Cables');
      setNewProdBaseUnit('m');
      setNewProdSku('APX-');
      setNewProdCost(13.0);
      setNewProdRetailPrice(18.5);
      setNewProdTradePrice(17.0);
      setNewProdFloorPrice(16.0);
    }
  };

  const categories =
    currentOutlet.id === 'inco-hardware'
      ? [
          'All',
          'Power Tools & Machinery',
          'Hand Tools & Hardware',
          'Plumbing & Sanitary',
          'Paints & Adhesives',
          'Fasteners & Fixings',
          'Building & Site Safety',
        ]
      : currentOutlet.id === 'apex-electricals'
      ? [
          'All',
          'Cables & Wires',
          'Switches & Sockets',
          'Protection & Breakers',
          'Conduits & Trunking',
          'Lighting & Lamps',
          'Solar & Inverters',
        ]
      : [
          'All',
          'Power Tools & Machinery',
          'Hand Tools & Hardware',
          'Plumbing & Sanitary',
          'Paints & Adhesives',
          'Fasteners & Fixings',
          'Building & Site Safety',
          'Cables & Wires',
          'Switches & Sockets',
          'Protection & Breakers',
          'Conduits & Trunking',
          'Lighting & Lamps',
          'Solar & Inverters',
        ];

  const filteredProducts = products.filter((p) => {
    // Primary outlet filter
    if (currentOutlet.id !== 'all-outlets') {
      if (p.outletId && p.outletId !== 'all-outlets' && p.outletId !== currentOutlet.id) {
        return false;
      }
    } else if (storeFilter !== 'all') {
      if (p.outletId && p.outletId !== 'all-outlets' && p.outletId !== storeFilter) {
        return false;
      }
    }

    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.includes(searchTerm) ||
      p.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'All' || p.category === categoryFilter;

    const storeKey = p.outletId || (currentOutlet.id === 'all-outlets' ? 'inco-hardware' : currentOutlet.id);
    const currentStock = p.stock[storeKey] || 0;
    const minAlert = p.minStockAlert[storeKey] || 10;
    const matchesStock = stockFilter === 'all' || currentStock <= minAlert;

    return matchesSearch && matchesCat && matchesStock;
  });

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName || !newProdSku) return;

    const newProd: Product = {
      id: `prod-${Date.now()}`,
      name: newProdName,
      sku: newProdSku,
      outletId: newProdStore,
      category: newProdCategory,
      brand: newProdBrand || 'Generic',
      barcode: `${Math.floor(603000000000 + Math.random() * 90000000000)}`,
      baseUnit: newProdBaseUnit,
      retailPrice: Number(newProdRetailPrice),
      tradePrice: Number(newProdTradePrice),
      floorPrice: Number(newProdFloorPrice),
      costPrice: {
        [newProdStore]: Number(newProdCost),
      },
      stock: {
        [newProdStore]: Number(newProdStock),
      },
      minStockAlert: {
        [newProdStore]: Number(newProdMinAlert),
      },
      imageUrl:
        newProdStore === 'inco-hardware'
          ? 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=300&auto=format&fit=crop&q=80'
          : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=300&auto=format&fit=crop&q=80',
      salesCount: 0,
      active: true,
    };

    onAddProduct(newProd);
    setAddModalOpen(false);
    // Reset form
    setNewProdName('');
    setNewProdSku('');
  };

  const handleExportProductsCsv = () => {
    const filename = `product_inventory_${currentOutlet.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    const headers = [
      'SKU',
      'Barcode',
      'Product Name',
      'Category',
      'Brand / Manufacturer',
      'Assigned Store Outlet',
      'Base Unit',
      'Unit Cost (GHS)',
      'Retail Price (GHS)',
      'Trade Price (GHS)',
      'Floor Price (GHS)',
      'Current Stock On Hand',
      'Min Stock Alert Level',
      'Total Valuation at Cost (GHS)',
      'Total Valuation at Retail (GHS)',
      'Status',
    ];

    const rows = filteredProducts.map((p) => {
      const storeKey = p.outletId || (currentOutlet.id === 'all-outlets' ? 'inco-hardware' : currentOutlet.id);
      const stockOnHand = p.stock[storeKey] || 0;
      const minAlert = p.minStockAlert[storeKey] || 10;
      const cost = p.costPrice[storeKey] || 0;
      const valCost = stockOnHand * cost;
      const valRetail = stockOnHand * p.retailPrice;

      const storeLabel =
        p.outletId === 'inco-hardware'
          ? 'Inco Hardware (Koforidua)'
          : p.outletId === 'apex-electricals'
          ? 'Apex Electricals (Kumasi)'
          : 'Both Stores';

      return [
        p.sku,
        p.barcode,
        p.name,
        p.category,
        p.brand,
        storeLabel,
        p.baseUnit,
        cost.toFixed(2),
        p.retailPrice.toFixed(2),
        p.tradePrice.toFixed(2),
        p.floorPrice.toFixed(2),
        stockOnHand,
        minAlert,
        valCost.toFixed(2),
        valRetail.toFixed(2),
        p.active ? 'Active' : 'Inactive',
      ];
    });

    exportToCsv(filename, headers, rows);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header with Title and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Product Catalogue & Stock</h1>
            <span className="bg-orange-100 text-orange-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
              {currentOutlet.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentOutlet.id === 'inco-hardware' && (
              <span>Dedicated catalog: <strong>Power Tools, Hand Tools, Plumbing, Paints & Safety Equipment</strong></span>
            )}
            {currentOutlet.id === 'apex-electricals' && (
              <span>Dedicated catalog: <strong>Copper Cables, Sockets, Switchgear, Breakers, Solar & Lighting</strong></span>
            )}
            {currentOutlet.id === 'all-outlets' && (
              <span>Multi-Store Central View: Showing both independent store inventories with separate product lines.</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportProductsCsv}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Export current filtered catalogue and valuation to CSV for external accounting software (QuickBooks, Sage, Xero, Excel)"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>Export Catalogue (CSV)</span>
          </button>

          <button
            onClick={() => onOpenGoodsReceipt()}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Truck className="w-4 h-4 text-orange-400" />
            <span>Goods Receipt (GRN)</span>
          </button>

          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row gap-3 items-center justify-between">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              currentOutlet.id === 'inco-hardware'
                ? 'Search drills, pipes, paint, valves, SKU...'
                : currentOutlet.id === 'apex-electricals'
                ? 'Search cables, switches, breakers, solar, SKU...'
                : 'Search all catalogs, brands, SKU...'
            }
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-orange-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
          {/* Store Filter in All Outlets mode */}
          {currentOutlet.id === 'all-outlets' && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold">
              <button
                onClick={() => setStoreFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  storeFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Both Stores
              </button>
              <button
                onClick={() => setStoreFilter('inco-hardware')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  storeFilter === 'inco-hardware' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-500'
                }`}
              >
                Inco Hardware Only
              </button>
              <button
                onClick={() => setStoreFilter('apex-electricals')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  storeFilter === 'apex-electricals' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'
                }`}
              >
                Apex Electricals Only
              </button>
            </div>
          )}

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-bold">
            <button
              onClick={() => setStockFilter('all')}
              className={`px-3 py-1 rounded-md transition-colors ${
                stockFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'
              }`}
            >
              All Items ({filteredProducts.length})
            </button>
            <button
              onClick={() => setStockFilter('low-stock')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${
                stockFilter === 'low-stock'
                  ? 'bg-red-50 text-red-600 font-black shadow-2xs'
                  : 'text-slate-500'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              Low Stock Alerts
            </button>
          </div>
        </div>
      </div>

      {/* Products Table with Per-Outlet Breakdown & Price Tiers */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Item Details</th>
                <th className="py-3 px-4">Category / Brand</th>
                {currentOutlet.id === 'all-outlets' && <th className="py-3 px-4">Store Outlet</th>}
                <th className="py-3 px-4">Base Unit</th>
                <th className="py-3 px-4 text-right">Retail (GH₵)</th>
                <th className="py-3 px-4 text-right">Trade (GH₵)</th>
                <th className="py-3 px-4 text-right">Floor (GH₵)</th>
                <th className="py-3 px-4 text-right">Unit Cost (GH₵)</th>
                <th className="py-3 px-4 text-center">
                  {currentOutlet.id === 'all-outlets'
                    ? 'Stock on Hand'
                    : `Stock (${currentOutlet.name})`}
                </th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((p) => {
                const storeKey = p.outletId || (currentOutlet.id === 'all-outlets' ? 'inco-hardware' : currentOutlet.id);
                const stockOnHand = p.stock[storeKey] || 0;
                const minAlert = p.minStockAlert[storeKey] || 10;
                const isLow = stockOnHand <= minAlert;
                const cost = p.costPrice[storeKey] || 0;

                return (
                  <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${!p.active ? 'opacity-50 bg-slate-50/50' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                        <div>
                          <div className="font-bold text-slate-800 text-xs">{p.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            SKU: {p.sku} • {p.barcode}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-700">{p.category}</div>
                      <div className="text-[10px] text-slate-400">{p.brand}</div>
                    </td>

                    {currentOutlet.id === 'all-outlets' && (
                      <td className="py-3 px-4">
                        {p.outletId === 'inco-hardware' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Inco Hardware
                          </span>
                        ) : p.outletId === 'apex-electricals' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            Apex Electricals
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            Shared Catalog
                          </span>
                        )}
                      </td>
                    )}

                    <td className="py-3 px-4">
                      <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        {p.baseUnit}
                      </span>
                      {p.sellingUnits && p.sellingUnits.length > 1 && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          +{p.sellingUnits.length - 1} pack units
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-black text-slate-900">
                      GH₵ {p.retailPrice.toFixed(2)}
                    </td>

                    <td className="py-3 px-4 text-right font-bold text-blue-600">
                      GH₵ {p.tradePrice.toFixed(2)}
                    </td>

                    <td className="py-3 px-4 text-right font-bold text-amber-600" title="BR-10: Manager PIN required if sold below floor">
                      GH₵ {p.floorPrice.toFixed(2)}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-slate-500">
                      GH₵ {cost.toFixed(2)}
                    </td>

                    {/* Stock Column */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-black text-xs ${
                          isLow
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {stockOnHand} {p.baseUnit}
                      </span>
                      {isLow && <span className="block text-[9px] text-red-500 font-bold mt-0.5">LOW STOCK</span>}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {p.active ? (
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      ) : (
                        <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Inactive (BR-17)
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onOpenGoodsReceipt(p.id)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors cursor-pointer"
                          title="Receive Stock (GRN)"
                        >
                          <Truck className="w-3.5 h-3.5 text-slate-700" />
                        </button>
                        <button
                          onClick={() => onOpenAdjustment(p)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors cursor-pointer"
                          title="Stock Adjustment (Audit Discrepancy)"
                        >
                          <Sliders className="w-3.5 h-3.5 text-slate-700" />
                        </button>
                        <button
                          onClick={() => onToggleActive(p.id)}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            p.active
                              ? 'bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600'
                              : 'bg-emerald-50 text-emerald-600'
                          }`}
                          title={p.active ? 'Deactivate Product (BR-17)' : 'Activate Product'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {addModalOpen && (
        <div 
          onClick={() => setAddModalOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-xl shadow-2xl p-6 border border-slate-200 max-h-[90vh] overflow-y-auto animate-modal-card"
          >
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <div>
                <h3 className="font-black text-lg text-slate-800">Add New Store Product</h3>
                <p className="text-xs text-slate-500">Create item for Inco Hardware or Apex Electricals inventory</p>
              </div>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              {/* Target Store Selector */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Store *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleStoreChange('inco-hardware')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      newProdStore === 'inco-hardware'
                        ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-black text-slate-800 text-xs">Inco Hardware</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Tools, Building, Plumbing & Paints</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStoreChange('apex-electricals')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      newProdStore === 'apex-electricals'
                        ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-black text-slate-800 text-xs">Apex Electricals</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Cables, Switchgear, Solar & Lighting</div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder={newProdStore === 'inco-hardware' ? 'e.g. Total 1000W Rotary Hammer' : 'e.g. 6.0mm Twin & Earth Cable'}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">SKU Code *</label>
                  <input
                    type="text"
                    required
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value)}
                    placeholder={newProdStore === 'inco-hardware' ? 'INC-TLS-005' : 'APX-CAB-005'}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    {newProdStore === 'inco-hardware' ? (
                      <>
                        <option value="Power Tools & Machinery">Power Tools & Machinery</option>
                        <option value="Hand Tools & Hardware">Hand Tools & Hardware</option>
                        <option value="Plumbing & Sanitary">Plumbing & Sanitary</option>
                        <option value="Paints & Adhesives">Paints & Adhesives</option>
                        <option value="Fasteners & Fixings">Fasteners & Fixings</option>
                        <option value="Building & Site Safety">Building & Site Safety</option>
                      </>
                    ) : (
                      <>
                        <option value="Cables & Wires">Cables & Wires</option>
                        <option value="Switches & Sockets">Switches & Sockets</option>
                        <option value="Protection & Breakers">Protection & Breakers</option>
                        <option value="Conduits & Trunking">Conduits & Trunking</option>
                        <option value="Lighting & Lamps">Lighting & Lamps</option>
                        <option value="Solar & Inverters">Solar & Inverters</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Brand / Manufacturer</label>
                  <input
                    type="text"
                    value={newProdBrand}
                    onChange={(e) => setNewProdBrand(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Base Inventory Unit</label>
                  <select
                    value={newProdBaseUnit}
                    onChange={(e) => setNewProdBaseUnit(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white font-mono"
                  >
                    {newProdStore === 'inco-hardware' ? (
                      <>
                        <option value="pcs">Pieces (pcs)</option>
                        <option value="length">Length (6m pipe)</option>
                        <option value="bucket">Bucket (20L)</option>
                        <option value="tin">Tin (4L)</option>
                        <option value="kg">Kilogram (kg)</option>
                        <option value="box">Box</option>
                        <option value="roll">Roll</option>
                        <option value="set">Set</option>
                      </>
                    ) : (
                      <>
                        <option value="m">Metre (m)</option>
                        <option value="pcs">Pieces (pcs)</option>
                        <option value="length">Length (3m pipe)</option>
                        <option value="roll">Roll / Coil</option>
                        <option value="box">Box</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Price Tiers (BR-10 & FR-PROD-02) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800">Multi-Tier Pricing (Ghana Cedis GH₵)</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-0.5">Retail Price (GH₵) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newProdRetailPrice}
                      onChange={(e) => setNewProdRetailPrice(parseFloat(e.target.value) || 0)}
                      className="w-full font-bold border border-slate-300 rounded-lg p-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-0.5">Trade Price (GH₵) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newProdTradePrice}
                      onChange={(e) => setNewProdTradePrice(parseFloat(e.target.value) || 0)}
                      className="w-full font-bold text-blue-600 border border-slate-300 rounded-lg p-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-0.5">Floor Price (GH₵) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newProdFloorPrice}
                      onChange={(e) => setNewProdFloorPrice(parseFloat(e.target.value) || 0)}
                      className="w-full font-bold text-amber-600 border border-slate-300 rounded-lg p-2 bg-white"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Floor price enforces manager PIN prompt if cashier enters lower price at POS checkout.
                </p>
              </div>

              {/* Store Initial Stock & Cost */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800">
                  Initial Stock & Unit Cost for {newProdStore === 'inco-hardware' ? 'Inco Hardware' : 'Apex Electricals'}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-0.5">Initial Stock:</label>
                    <input
                      type="number"
                      step="any"
                      value={newProdStock}
                      onChange={(e) => setNewProdStock(parseFloat(e.target.value) || 0)}
                      className="w-full font-bold border border-slate-300 rounded-lg p-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-0.5">Weighted Cost (GH₵):</label>
                    <input
                      type="number"
                      step="any"
                      value={newProdCost}
                      onChange={(e) => setNewProdCost(parseFloat(e.target.value) || 0)}
                      className="w-full font-bold border border-slate-300 rounded-lg p-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-0.5">Min Stock Alert:</label>
                    <input
                      type="number"
                      step="any"
                      value={newProdMinAlert}
                      onChange={(e) => setNewProdMinAlert(parseFloat(e.target.value) || 0)}
                      className="w-full font-bold border border-slate-300 rounded-lg p-2 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold cursor-pointer shadow-xs"
                >
                  Save Product to {newProdStore === 'inco-hardware' ? 'Inco Hardware' : 'Apex Electricals'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
