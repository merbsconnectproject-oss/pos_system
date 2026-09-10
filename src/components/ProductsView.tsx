import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  History,
  Package,
  Plus,
  Power,
  Search,
  Sliders,
  Tag,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { Outlet, Product } from '../types';
import { exportToCsv } from '../utils/csvExport';

type ProductMode = 'list' | 'import' | 'setup' | 'bulk-price';
type ImportStep = 'upload' | 'mapping' | 'validation' | 'preview' | 'result';

interface ProductsViewProps {
  products: Product[];
  currentOutlet: Outlet;
  outlets?: Outlet[];
  onAddProduct: (product: Product) => void;
  onUpdateProduct?: (product: Product) => void;
  onOpenGoodsReceipt: (productId?: string) => void;
  onOpenAdjustment: (product: Product) => void;
  onToggleActive: (productId: string) => void;
  initialFilter?: 'all' | 'low-stock';
  mode?: ProductMode;
}

const productCategories: Product['category'][] = [
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
  'Hardware & Tools',
  'Plumbing & Pipes',
];

const baseUnits: Product['baseUnit'][] = ['m', 'pcs', 'length', 'roll', 'box', 'kg', 'bucket', 'tin', 'set', 'pair'];

const formatMoney = (amount: number) => `GH₵ ${amount.toFixed(2)}`;

const stockKeyFor = (product: Product, currentOutlet: Outlet) =>
  product.outletId || (currentOutlet.id === 'all-outlets' ? Object.keys(product.stock)[0] : currentOutlet.id);

const makeSku = (storeId: string, category: string) =>
  `${storeId.slice(0, 3).toUpperCase()}-${category.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  currentOutlet,
  outlets = [currentOutlet],
  onAddProduct,
  onUpdateProduct,
  onOpenGoodsReceipt,
  onOpenAdjustment,
  onToggleActive,
  initialFilter = 'all',
  mode = 'list',
}) => {
  const [activeMode, setActiveMode] = useState<ProductMode>(mode);
  const realOutlets = outlets.filter((outlet) => outlet.id !== 'all-outlets');
  const defaultStore = currentOutlet.id !== 'all-outlets' ? currentOutlet.id : realOutlets[0]?.id || 'inco-hardware';

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'low-stock' | 'inactive'>(initialFilter);
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [priceHistoryProduct, setPriceHistoryProduct] = useState<Product | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [bulkPercent, setBulkPercent] = useState(5);
  const [setupValues, setSetupValues] = useState({
    categories: [...productCategories],
    brands: Array.from(new Set(products.map((product) => product.brand))).sort(),
    units: [...baseUnits],
  });
  const [setupModal, setSetupModal] = useState<{ type: 'categories' | 'brands' | 'units'; label: string } | null>(null);
  const [setupValue, setSetupValue] = useState('');

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  const [form, setForm] = useState({
    storeId: defaultStore,
    name: '',
    sku: '',
    barcode: '',
    category: productCategories[0],
    brand: 'Generic',
    baseUnit: 'pcs' as Product['baseUnit'],
    retailPrice: 0,
    tradePrice: 0,
    floorPrice: 0,
    cost: 0,
    stock: 0,
    minAlert: 5,
    imageUrl: '',
    sellingUnitName: '',
    sellingUnitFactor: 1,
    sellingUnitPrice: 0,
  });

  const brands = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.brand))).sort()], [products]);

  const filteredProducts = useMemo(() => {
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((product) => {
      if (currentOutlet.id !== 'all-outlets' && product.outletId && product.outletId !== 'all-outlets' && product.outletId !== currentOutlet.id) {
        return false;
      }
      if (currentOutlet.id === 'all-outlets' && storeFilter !== 'all' && product.outletId !== storeFilter) return false;
      if (categoryFilter !== 'All' && product.category !== categoryFilter) return false;
      if (brandFilter !== 'All' && product.brand !== brandFilter) return false;

      const key = stockKeyFor(product, currentOutlet);
      const stock = product.stock[key] || 0;
      const reorder = product.minStockAlert[key] || 0;
      if (stockFilter === 'low-stock' && stock > reorder) return false;
      if (stockFilter === 'inactive' && product.active) return false;

      const haystack = `${product.name} ${product.sku} ${product.barcode} ${product.brand} ${product.category}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [brandFilter, categoryFilter, currentOutlet, products, searchTerm, stockFilter, storeFilter]);

  const startCreate = () => {
    setForm((prev) => ({
      ...prev,
      storeId: defaultStore,
      name: '',
      sku: makeSku(defaultStore, prev.category),
      barcode: '',
      retailPrice: 0,
      tradePrice: 0,
      floorPrice: 0,
      cost: 0,
      stock: 0,
      minAlert: 5,
      imageUrl: '',
      sellingUnitName: '',
      sellingUnitFactor: 1,
      sellingUnitPrice: 0,
    }));
    setEditingProduct(null);
    setAddModalOpen(true);
  };

  const startEdit = (product: Product) => {
    const key = stockKeyFor(product, currentOutlet);
    setForm({
      storeId: product.outletId || defaultStore,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.category,
      brand: product.brand,
      baseUnit: product.baseUnit,
      retailPrice: product.retailPrice,
      tradePrice: product.tradePrice,
      floorPrice: product.floorPrice,
      cost: product.costPrice[key] || 0,
      stock: product.stock[key] || 0,
      minAlert: product.minStockAlert[key] || 0,
      imageUrl: product.imageUrl,
      sellingUnitName: product.sellingUnits?.[1]?.name || '',
      sellingUnitFactor: product.sellingUnits?.[1]?.conversionFactor || 1,
      sellingUnitPrice: product.sellingUnits?.[1]?.price || 0,
    });
    setEditingProduct(product);
    setAddModalOpen(true);
  };

  const submitProduct = (event: React.FormEvent) => {
    event.preventDefault();
    const barcode = form.barcode.trim() || String(Math.floor(603000000000 + Math.random() * 90000000000));
    const sellingUnits =
      form.sellingUnitName.trim() && form.sellingUnitFactor > 1
        ? [
            { name: form.baseUnit, conversionFactor: 1, price: form.retailPrice, tradePrice: form.tradePrice },
            {
              name: form.sellingUnitName.trim(),
              conversionFactor: form.sellingUnitFactor,
              price: form.sellingUnitPrice || form.retailPrice * form.sellingUnitFactor,
              tradePrice: form.tradePrice * form.sellingUnitFactor,
            },
          ]
        : [{ name: form.baseUnit, conversionFactor: 1, price: form.retailPrice, tradePrice: form.tradePrice }];

    const product: Product = {
      id: editingProduct?.id || `prod-${Date.now()}`,
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      outletId: form.storeId,
      category: form.category,
      brand: form.brand.trim() || 'Generic',
      barcode,
      baseUnit: form.baseUnit,
      sellingUnits,
      retailPrice: Number(form.retailPrice),
      tradePrice: Number(form.tradePrice),
      floorPrice: Number(form.floorPrice),
      costPrice: { ...(editingProduct?.costPrice || {}), [form.storeId]: Number(form.cost) },
      stock: { ...(editingProduct?.stock || {}), [form.storeId]: Number(form.stock) },
      minStockAlert: { ...(editingProduct?.minStockAlert || {}), [form.storeId]: Number(form.minAlert) },
      imageUrl: form.imageUrl.trim() || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400&auto=format&fit=crop&q=80',
      salesCount: editingProduct?.salesCount || 0,
      active: editingProduct?.active ?? true,
    };

    if (editingProduct && onUpdateProduct) onUpdateProduct(product);
    else onAddProduct(product);

    setAddModalOpen(false);
    setEditingProduct(null);
  };

  const exportProducts = () => {
    exportToCsv(
      `product_catalogue_${new Date().toISOString().slice(0, 10)}.csv`,
      ['SKU', 'Barcode', 'Name', 'Category', 'Brand', 'Base Unit', 'Retail', 'Trade', 'Floor', 'Stock', 'Reorder', 'Active'],
      filteredProducts.map((product) => {
        const key = stockKeyFor(product, currentOutlet);
        return [
          product.sku,
          product.barcode,
          product.name,
          product.category,
          product.brand,
          product.baseUnit,
          product.retailPrice,
          product.tradePrice,
          product.floorPrice,
          product.stock[key] || 0,
          product.minStockAlert[key] || 0,
          product.active ? 'Active' : 'Inactive',
        ];
      })
    );
  };

  const renderSetup = () => {
    const categoryRows = setupValues.categories.map((category) => ({
      name: category,
      count: products.filter((product) => product.category === category).length,
    }));
    const brandRows = setupValues.brands.map((brand) => ({
      name: brand,
      count: products.filter((product) => product.brand === brand).length,
    }));
    const unitRows = setupValues.units.map((unit) => ({
      name: unit,
      count: products.filter((product) => product.baseUnit === unit).length,
    }));

    return (
      <>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {[
          { title: 'Categories', rows: categoryRows, add: 'Add category', type: 'categories' as const },
          { title: 'Brands', rows: brandRows, add: 'Add brand', type: 'brands' as const },
          { title: 'Units of measure', rows: unitRows, add: 'Add unit', type: 'units' as const },
        ].map((section) => (
          <div key={section.title} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900">{section.title}</h2>
              <button onClick={() => { setSetupValue(''); setSetupModal({ type: section.type, label: section.add.replace('Add ', '') }); }} className="text-xs font-bold text-orange-600 hover:underline">{section.add}</button>
            </div>
            <div className="divide-y divide-slate-100">
              {section.rows.map((row) => (
                <div key={row.name} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-800">{row.name}</div>
                    <div className="text-xs text-slate-400">{row.count} products using this value</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { const next = window.prompt(`Rename ${section.title.toLowerCase()}`, row.name); if (next?.trim() && next.trim() !== row.name) setSetupValues((prev) => ({ ...prev, [section.type]: prev[section.type].map((value) => value === row.name ? next.trim() : value) })); }} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Rename">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setSetupValues((prev) => ({ ...prev, [section.type]: prev[section.type].filter((value) => value !== row.name) }))} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Deactivate">
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {setupModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={(event) => { event.preventDefault(); const value = setupValue.trim(); if (!value) return; setSetupValues((prev) => ({ ...prev, [setupModal.type]: prev[setupModal.type].includes(value) ? prev[setupModal.type] : [...prev[setupModal.type], value] })); setSetupModal(null); setSetupValue(''); }} className="w-full max-w-md rounded-xl border border-slate-300 bg-white shadow-xl"><div className="flex items-center justify-between rounded-t-xl bg-slate-900 px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wider text-orange-300">Catalogue setup</p><h2 className="mt-1 text-sm font-black">Add {setupModal.label}</h2></div><button type="button" onClick={() => setSetupModal(null)} className="text-xs text-slate-300">Close</button></div><div className="space-y-3 p-5"><label className="block text-xs font-bold text-slate-700">{setupModal.label[0].toUpperCase() + setupModal.label.slice(1)}<input autoFocus required value={setupValue} onChange={(event) => setSetupValue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-sans" placeholder={`Enter ${setupModal.label}`} /></label><button className="w-full rounded-lg bg-orange-600 px-3 py-2.5 text-xs font-bold text-white">Save {setupModal.label}</button></div></form></div>}
      </>
    );
  };

  const renderImport = () => {
    const steps: ImportStep[] = ['upload', 'mapping', 'validation', 'preview', 'result'];
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Product Import</h2>
            <p className="text-sm text-slate-500">Upload, map columns, validate rows, preview changes, then commit.</p>
          </div>
          <button onClick={() => setImportStep('upload')} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">
            Reset import
          </button>
        </div>
        <div className="p-5 border-b border-slate-100 flex flex-wrap gap-2">
          {steps.map((step, index) => (
            <button
              key={step}
              onClick={() => setImportStep(step)}
              className={`px-3 py-1.5 rounded-full text-xs font-black capitalize ${
                importStep === step ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {index + 1}. {step}
            </button>
          ))}
        </div>
        <div className="p-6">
          {importStep === 'upload' && (
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center bg-slate-50">
              <Upload className="w-10 h-10 mx-auto text-slate-400" />
              <h3 className="mt-4 text-base font-black text-slate-900">Drop spreadsheet here</h3>
              <p className="text-sm text-slate-500 mt-1">CSV or XLSX with name, SKU, barcode, category, brand, unit, prices and opening stock.</p>
              <button onClick={() => setImportStep('mapping')} className="mt-5 px-4 py-2.5 rounded-xl bg-orange-500 text-white text-xs font-black">
                Continue with sample file
              </button>
            </div>
          )}
          {importStep === 'mapping' && (
            <div className="space-y-3">
              {['Product Name', 'SKU', 'Barcode', 'Retail Price', 'Opening Stock'].map((field) => (
                <div key={field} className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-3 items-center p-3 rounded-xl border border-slate-200">
                  <span className="text-sm font-bold text-slate-800">{field}</span>
                  <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option>{field.toLowerCase().replaceAll(' ', '_')}</option>
                  </select>
                </div>
              ))}
              <button onClick={() => setImportStep('validation')} className="px-4 py-2.5 rounded-xl bg-orange-500 text-white text-xs font-black">Validate rows</button>
            </div>
          )}
          {importStep === 'validation' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">3 rows need attention: duplicate SKU, missing category, invalid unit.</div>
              <button onClick={() => setImportStep('preview')} className="px-4 py-2.5 rounded-xl bg-orange-500 text-white text-xs font-black">Proceed with valid rows</button>
            </div>
          )}
          {importStep === 'preview' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[['Create', 42], ['Update', 18], ['Skip', 3]].map(([label, count]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-xs font-black uppercase text-slate-500">{label}</div>
                  <div className="text-3xl font-black text-slate-900 mt-1">{count}</div>
                </div>
              ))}
              <button onClick={() => setImportStep('result')} className="sm:col-span-3 px-4 py-2.5 rounded-xl bg-orange-500 text-white text-xs font-black">Commit import</button>
            </div>
          )}
          {importStep === 'result' && (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
              <h3 className="mt-4 text-lg font-black text-slate-900">Import completed</h3>
              <p className="text-sm text-slate-500 mt-1">42 created, 18 updated, 3 skipped. Error report is ready for download.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBulkPrice = () => {
    const affected = filteredProducts.length;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 space-y-5">
        <div>
          <h2 className="text-lg font-black text-slate-900">Bulk Price Update</h2>
          <p className="text-sm text-slate-500">Stage 2 repricing workspace with affected-count preview before applying.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white">
            {['All', ...productCategories].map((category) => <option key={category}>{category}</option>)}
          </select>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white">
            {brands.map((brand) => <option key={brand}>{brand}</option>)}
          </select>
          <input type="number" value={bulkPercent} onChange={(e) => setBulkPercent(Number(e.target.value) || 0)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold" />
          <button className="rounded-xl bg-orange-500 text-white text-sm font-black">Preview {bulkPercent}% change</button>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-black uppercase text-slate-500">Affected products</div>
            <div className="text-3xl font-black text-slate-900">{affected}</div>
          </div>
          <span className="text-xs font-bold text-slate-500">Apply is disabled until backend approval/audit logging is connected.</span>
        </div>
      </div>
    );
  };

  const renderList = () => (
    <>
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col xl:flex-row gap-3 items-center justify-between">
        <div className="relative w-full xl:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search name, SKU, barcode, brand, category..." className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-orange-500" />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
          {currentOutlet.id === 'all-outlets' && (
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700">
              <option value="all">All outlets</option>
              {realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          )}
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700">
            {['All', ...productCategories].map((category) => <option key={category}>{category}</option>)}
          </select>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700">
            {brands.map((brand) => <option key={brand}>{brand}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold">
            {[
              ['all', 'All'],
              ['low-stock', 'Low stock'],
              ['inactive', 'Inactive'],
            ].map(([value, label]) => (
              <button key={value} onClick={() => setStockFilter(value as typeof stockFilter)} className={`px-3 py-1.5 rounded-md ${stockFilter === value ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-black border-b border-slate-200 uppercase text-[10px] tracking-wide">
              <tr>
                <th className="py-3 px-4"><input type="checkbox" className="accent-orange-500" /></th>
                <th className="py-3 px-4">Thumbnail + Name</th>
                <th className="py-3 px-4">SKU / Barcode</th>
                <th className="py-3 px-4">Category / Brand</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4 text-center">Stock at Outlet</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const key = stockKeyFor(product, currentOutlet);
                const stock = product.stock[key] || 0;
                const reorder = product.minStockAlert[key] || 0;
                const low = stock <= reorder;
                return (
                  <tr key={product.id} className={`hover:bg-slate-50 ${!product.active ? 'opacity-60 bg-slate-50' : ''}`}>
                    <td className="py-3 px-4"><input type="checkbox" className="accent-orange-500" /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-[260px]">
                        <img src={product.imageUrl} alt={product.name} className="w-11 h-11 rounded-md object-cover border border-slate-200 bg-slate-100" />
                        <div>
                          <button onClick={() => setSelectedProduct(product)} className="font-bold text-slate-800 text-left hover:text-orange-600 line-clamp-2">{product.name}</button>
                          <div className="text-[10px] text-slate-400">{product.outletId || 'Shared catalogue'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{product.sku}<br />{product.barcode}</td>
                    <td className="py-3 px-4"><div className="font-semibold text-slate-700">{product.category}</div><div className="text-[10px] text-slate-400">{product.brand}</div></td>
                    <td className="py-3 px-4"><span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">{product.baseUnit}</span></td>
                    <td className="py-3 px-4 text-right"><div className="font-black text-slate-900">{formatMoney(product.retailPrice)}</div><div className="text-[10px] text-slate-400">Trade {formatMoney(product.tradePrice)}</div></td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full font-black border ${low ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{stock} {product.baseUnit}</span>
                    </td>
                    <td className="py-3 px-4 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${product.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{product.active ? 'Active' : 'Inactive'}</span></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setSelectedProduct(product)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="View detail"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => startEdit(product)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Edit product"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onToggleActive(product.id)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Deactivate product"><Power className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onOpenAdjustment(product)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" title="Adjust stock"><Sliders className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {products.length === 0 && (
          <div className="py-16 text-center">
            <Package className="w-12 h-12 mx-auto text-slate-300" />
            <h3 className="mt-3 font-black text-slate-900">No products yet</h3>
            <p className="text-sm text-slate-500 mt-1">Import a catalogue or add the first product manually.</p>
          </div>
        )}
        {products.length > 0 && filteredProducts.length === 0 && (
          <div className="py-16 text-center">
            <Search className="w-12 h-12 mx-auto text-slate-300" />
            <h3 className="mt-3 font-black text-slate-900">No products match</h3>
            <button onClick={() => { setSearchTerm(''); setCategoryFilter('All'); setBrandFilter('All'); setStockFilter('all'); }} className="mt-2 text-sm font-bold text-orange-600 hover:underline">Clear filters</button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {activeMode === 'import' ? 'Product Import' : activeMode === 'setup' ? 'Catalogue Setup' : activeMode === 'bulk-price' ? 'Bulk Price Update' : 'Product Catalogue'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Shared catalogue with outlet-specific stock, weighted cost, pricing, units and barcodes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportProducts} className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => onOpenGoodsReceipt()} className="flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold px-3.5 py-2 rounded-lg">
            <Truck className="w-4 h-4 text-orange-400" /> Goods Receipt
          </button>
          <button onClick={startCreate} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3.5 py-2 rounded-lg">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs flex gap-1 overflow-x-auto">
        {[
          ['list', 'Products'],
          ['import', 'Import'],
          ['setup', 'Setup'],
          ['bulk-price', 'Bulk Price'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveMode(value as ProductMode)}
            className={`px-3.5 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-colors ${
              activeMode === value
                ? 'bg-orange-500 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeMode === 'list' && renderList()}
      {activeMode === 'setup' && renderSetup()}
      {activeMode === 'import' && renderImport()}
      {activeMode === 'bulk-price' && renderBulkPrice()}

      {selectedProduct && (
        <div className="fixed inset-0 z-70 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-modal-backdrop">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-300 flex flex-col animate-drawer-right">
            <div className="bg-slate-900 text-white px-6 py-5 flex items-start justify-between shrink-0">
              <div>
                <h2 className="text-lg font-black text-white">{selectedProduct.name}</h2>
                <p className="text-xs text-slate-400 font-mono mt-1">{selectedProduct.sku} / {selectedProduct.barcode}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
              <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full aspect-[4/3] object-cover rounded-lg border border-slate-200 bg-slate-100" />
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Category', selectedProduct.category],
                  ['Brand', selectedProduct.brand],
                  ['Base unit', selectedProduct.baseUnit],
                  ['Supplier', 'Default supplier'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
                    <div className="text-sm font-bold text-slate-800 mt-1">{value}</div>
                  </div>
                ))}
              </div>
              <section className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">Pricing</h3>
                  <button onClick={() => setPriceHistoryProduct(selectedProduct)} className="text-xs font-bold text-orange-600 flex items-center gap-1"><History className="w-3.5 h-3.5" /> History</button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <div>Retail <strong className="block text-slate-900">{formatMoney(selectedProduct.retailPrice)}</strong></div>
                  <div>Trade <strong className="block text-slate-900">{formatMoney(selectedProduct.tradePrice)}</strong></div>
                  <div>Floor <strong className="block text-slate-900">{formatMoney(selectedProduct.floorPrice)}</strong></div>
                  <div>Margin <strong className="block text-emerald-700">{Math.max(0, ((selectedProduct.retailPrice - (selectedProduct.costPrice[stockKeyFor(selectedProduct, currentOutlet)] || 0)) / selectedProduct.retailPrice) * 100).toFixed(1)}%</strong></div>
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200"><h3 className="text-sm font-black text-slate-900">Units and barcodes</h3></div>
                <div className="divide-y divide-slate-100">
                  {(selectedProduct.sellingUnits || [{ name: selectedProduct.baseUnit, conversionFactor: 1, price: selectedProduct.retailPrice }]).map((unit) => (
                    <div key={unit.name} className="px-4 py-3 flex justify-between text-sm">
                      <span className="font-bold text-slate-800">{unit.name} <span className="text-slate-400 font-normal">x{unit.conversionFactor}</span></span>
                      <span className="font-mono text-slate-500">{unit.name === selectedProduct.baseUnit ? selectedProduct.barcode : 'Add barcode'}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200"><h3 className="text-sm font-black text-slate-900">Stock by outlet</h3></div>
                <div className="divide-y divide-slate-100">
                  {realOutlets.map((outlet) => (
                    <div key={outlet.id} className="px-4 py-3 flex justify-between text-sm">
                      <span className="font-bold text-slate-700">{outlet.name}</span>
                      <span className="font-black text-slate-900">{selectedProduct.stock[outlet.id] || 0} {selectedProduct.baseUnit}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {priceHistoryProduct && (
        <div className="fixed inset-0 z-80 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-300 shadow-2xl overflow-hidden animate-modal-card">
            <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white">Price History</h3>
                <p className="text-xs text-slate-400 mt-0.5">{priceHistoryProduct.name}</p>
              </div>
              <button onClick={() => setPriceHistoryProduct(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-2">
              {[
                ['Retail price', formatMoney(priceHistoryProduct.retailPrice * 0.94), formatMoney(priceHistoryProduct.retailPrice)],
                ['Trade price', formatMoney(priceHistoryProduct.tradePrice * 0.96), formatMoney(priceHistoryProduct.tradePrice)],
                ['Floor price', formatMoney(priceHistoryProduct.floorPrice * 0.95), formatMoney(priceHistoryProduct.floorPrice)],
              ].map(([field, oldValue, newValue]) => (
                <div key={field} className="grid grid-cols-[1fr_120px_120px_120px] gap-3 p-3 rounded-xl border border-slate-200 text-sm">
                  <span className="font-bold text-slate-800">{field}</span>
                  <span className="text-slate-500">{oldValue}</span>
                  <span className="font-black text-slate-900">{newValue}</span>
                  <span className="text-slate-400">Kwame A.</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {addModalOpen && (
        <div onClick={() => setAddModalOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl w-full max-w-5xl shadow-2xl border border-slate-300 max-h-[92vh] flex flex-col overflow-hidden animate-modal-card">
            <div className="bg-slate-900 text-white px-6 py-5 sm:px-8 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-xl text-white">{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Identity, classification, units, barcodes, pricing, stock settings and image.</p>
                </div>
              </div>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitProduct} className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-xs font-bold text-slate-700">Outlet<select value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500">{realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">Product name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-orange-500" /></label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <label className="text-xs font-bold text-slate-700">SKU<input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono uppercase text-slate-800 focus:outline-orange-500" /></label>
                <label className="text-xs font-bold text-slate-700">Primary barcode<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-800 focus:outline-orange-500" /></label>
                <label className="text-xs font-bold text-slate-700">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Product['category'] })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500">{productCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-700">Brand<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-orange-500" /></label>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2"><Archive className="w-4 h-4 text-orange-500" /> Units and conversions</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <label className="text-xs font-bold text-slate-700">Base unit<select value={form.baseUnit} onChange={(e) => setForm({ ...form, baseUnit: e.target.value as Product['baseUnit'] })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500">{baseUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-700">Extra unit<input value={form.sellingUnitName} onChange={(e) => setForm({ ...form, sellingUnitName: e.target.value })} placeholder="Carton, Drum, Box" className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Factor to base<input type="number" value={form.sellingUnitFactor} onChange={(e) => setForm({ ...form, sellingUnitFactor: Number(e.target.value) || 1 })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Unit override price<input type="number" value={form.sellingUnitPrice} onChange={(e) => setForm({ ...form, sellingUnitPrice: Number(e.target.value) || 0 })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500" /></label>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-orange-500" /> Pricing panel</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <label className="text-xs font-bold text-slate-700">Cost<input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) || 0 })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Retail<input type="number" required value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: Number(e.target.value) || 0 })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Trade<input type="number" value={form.tradePrice} onChange={(e) => setForm({ ...form, tradePrice: Number(e.target.value) || 0 })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Floor<input type="number" value={form.floorPrice} onChange={(e) => setForm({ ...form, floorPrice: Number(e.target.value) || 0 })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-orange-500" /></label>
                </div>
                <div className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">Live margin: {form.retailPrice > 0 ? (((form.retailPrice - form.cost) / form.retailPrice) * 100).toFixed(1) : '0.0'}%</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-xs font-bold text-slate-700">Stock<input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) || 0 })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-orange-500" /></label>
                <label className="text-xs font-bold text-slate-700">Reorder level<input type="number" value={form.minAlert} onChange={(e) => setForm({ ...form, minAlert: Number(e.target.value) || 0 })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-orange-500" /></label>
                <label className="text-xs font-bold text-slate-700">Image URL<input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-orange-500" /></label>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setAddModalOpen(false)} className="sm:w-1/3 py-3 rounded-lg border border-slate-300 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" className="sm:w-2/3 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-xs transition-colors">{editingProduct ? 'Save Changes' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
