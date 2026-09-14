import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { InfoHint } from './InfoHint';
import { ApiError } from '../apiClient';
import { catalogueApi, loadCatalogueLists, type CatalogueList, type CatalogueListItem } from '../catalogueApi';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Barcode,
  CheckCircle2,
  ChevronRight,
  Download,
  UploadCloud,
  Edit2,
  Eye,
  FileSpreadsheet,
  History,
  Package,
  Plus,
  Power,
  Printer,
  Search,
  Sliders,
  Tag,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { Outlet, Product } from '../types';
import type { PermissionSet } from '../permissions';
import { allBarcodes, barcodeForUnit, makeBarcodes, primaryBarcode } from '../catalogue';
import {
  IMPORT_FIELDS,
  buildErrorCsv,
  buildTemplateCsv,
  guessMapping,
  parseDelimited,
  rowsToProducts,
  validateRows,
  type ColumnMapping,
  type ParsedFile,
} from '../productImport';
import { exportToCsv } from '../utils/csvExport';
import { ProductBarcodeModal, ProductBarcodeSvg } from './ProductBarcodeModal';

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
  permissions: PermissionSet;
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

// Kept only as the fallback shape for the product form's typing; the
// selectable list now comes from /api/catalogue/units.
const baseUnits: Product['baseUnit'][] = ['m', 'pcs', 'length', 'roll', 'box', 'kg', 'bucket', 'tin', 'set', 'pair'];

const formatMoney = (amount: number) => `GH₵ ${amount.toFixed(2)}`;

const stockKeyFor = (product: Product, currentOutlet: Outlet) =>
  product.outletId || (currentOutlet.id === 'all-outlets' ? Object.keys(product.stock)[0] : currentOutlet.id);

type ProductForm = {
  storeId: string;
  name: string;
  sku: string;
  barcode: string;
  category: Product['category'] | '';
  brand: string;
  baseUnit: Product['baseUnit'] | '';
  retailPrice: string;
  tradePrice: string;
  floorPrice: string;
  cost: string;
  stock: string;
  minAlert: string;
  imageUrl: string;
  sellingUnitName: string;
  sellingUnitFactor: string;
  sellingUnitPrice: string;
};

const emptyProductForm: ProductForm = {
  storeId: '',
  name: '',
  sku: '',
  barcode: '',
  category: '',
  brand: '',
  baseUnit: '',
  retailPrice: '',
  tradePrice: '',
  floorPrice: '',
  cost: '',
  stock: '',
  minAlert: '',
  imageUrl: '',
  sellingUnitName: '',
  sellingUnitFactor: '',
  sellingUnitPrice: '',
};

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
  permissions,
}) => {
  const canViewCost = permissions.has('price.view_cost');
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
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [importParsed, setImportParsed] = useState<ParsedFile | null>(null);
  const [importMapping, setImportMapping] = useState<ColumnMapping>({});
  const [importFileName, setImportFileName] = useState('');
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [bulkPercent, setBulkPercent] = useState(5);
  // FR-PROD-05 · FR-UOM-01: the lists are the server's. They were local state
  // seeded from hard-coded arrays, so every add, rename and retire died on
  // refresh and the counts were whatever the loaded page happened to hold.
  const [setupValues, setSetupValues] = useState<Record<CatalogueList, CatalogueListItem[]>>({
    categories: [], brands: [], units: [],
  });
  const [setupModal, setSetupModal] = useState<{ type: CatalogueList; label: string } | null>(null);
  const [setupValue, setSetupValue] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);

  const refreshSetup = useCallback(() => {
    loadCatalogueLists()
      .then(setSetupValues)
      .catch(() => setSetupError('Could not load the catalogue lists.'));
  }, []);

  useEffect(() => { refreshSetup(); }, [refreshSetup]);

  /**
   * The server's refusal is the message worth showing — it names the entry and
   * says how many products still use it, which a generic failure cannot.
   */
  const runSetupChange = (change: Promise<unknown>) => {
    setSetupError(null);
    void change
      .then(() => refreshSetup())
      .catch((failure) => setSetupError(
        failure instanceof ApiError ? failure.message : 'The change could not be saved.'));
  };

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  const [form, setForm] = useState<ProductForm>(emptyProductForm);

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

      const haystack = `${product.name} ${product.sku} ${allBarcodes(product).join(' ')} ${product.brand} ${product.category}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [brandFilter, categoryFilter, currentOutlet, products, searchTerm, stockFilter, storeFilter]);

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map((p) => p.id));
    }
  };

  const selectedProductsForPrint = useMemo(() => {
    if (selectedProductIds.length > 0) {
      return products.filter((p) => selectedProductIds.includes(p.id));
    }
    return products;
  }, [products, selectedProductIds]);

  const startCreate = () => {
    setForm(emptyProductForm);
    setEditingProduct(null);
    setAddModalOpen(true);
  };

  const startEdit = (product: Product) => {
    const key = stockKeyFor(product, currentOutlet);
    setForm({
      storeId: product.outletId || defaultStore,
      name: product.name,
      sku: product.sku,
      barcode: primaryBarcode(product),
      category: product.category,
      brand: product.brand,
      baseUnit: product.baseUnit,
      retailPrice: String(product.retailPrice),
      tradePrice: String(product.tradePrice),
      floorPrice: String(product.floorPrice),
      cost: String(product.costPrice[key] || 0),
      stock: String(product.stock[key] || 0),
      minAlert: String(product.minStockAlert[key] || 0),
      imageUrl: product.imageUrl,
      sellingUnitName: product.sellingUnits?.[1]?.name || '',
      sellingUnitFactor: String(product.sellingUnits?.[1]?.conversionFactor || 1),
      sellingUnitPrice: String(product.sellingUnits?.[1]?.price || 0),
    });
    setEditingProduct(product);
    setAddModalOpen(true);
  };

  const submitProduct = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.storeId || !form.category || !form.baseUnit) return;
    const barcode = form.barcode.trim() || String(Math.floor(603000000000 + Math.random() * 90000000000));
    const retailPrice = Number(form.retailPrice) || 0;
    const tradePrice = Number(form.tradePrice) || 0;
    const floorPrice = Number(form.floorPrice) || 0;
    const cost = Number(form.cost) || 0;
    const stock = Number(form.stock) || 0;
    const minAlert = Number(form.minAlert) || 0;
    const sellingUnitFactor = Number(form.sellingUnitFactor) || 1;
    const sellingUnitPrice = Number(form.sellingUnitPrice) || 0;
    const sellingUnits =
      form.sellingUnitName.trim() && sellingUnitFactor > 1
        ? [
            { name: form.baseUnit, conversionFactor: 1, price: retailPrice, tradePrice },
            {
              name: form.sellingUnitName.trim(),
              conversionFactor: sellingUnitFactor,
              price: sellingUnitPrice || retailPrice * sellingUnitFactor,
              tradePrice: tradePrice * sellingUnitFactor,
            },
          ]
        : [{ name: form.baseUnit, conversionFactor: 1, price: retailPrice, tradePrice }];

    const product: Product = {
      id: editingProduct?.id || `prod-${Date.now()}`,
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      outletId: form.storeId,
      category: form.category,
      brand: form.brand.trim() || 'Generic',
      barcodes: makeBarcodes(barcode, form.baseUnit),
      baseUnit: form.baseUnit,
      sellingUnits,
      retailPrice,
      tradePrice,
      floorPrice,
      costPrice: { ...(editingProduct?.costPrice || {}), [form.storeId]: cost },
      stock: { ...(editingProduct?.stock || {}), [form.storeId]: stock },
      minStockAlert: { ...(editingProduct?.minStockAlert || {}), [form.storeId]: minAlert },
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
          allBarcodes(product).join(' | '),
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
    // `inUse` is counted by the server across the whole catalogue, not by
    // filtering whatever products this page happens to have loaded.
    const toRows = (items: CatalogueListItem[]) =>
      items.map((item) => ({ id: item.id, name: item.name, count: item.inUse }));

    const categoryRows = toRows(setupValues.categories);
    const brandRows = toRows(setupValues.brands);
    const unitRows = toRows(setupValues.units);

    return (
      <>
      {/* The server's refusal names the entry and how many products use it —
          "Busbar is still used by 3 products" beats a silent no-op. */}
      {setupError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="flex-1 text-xs font-semibold text-rose-700">{setupError}</p>
          <button type="button" onClick={() => setSetupError(null)} className="text-xs font-bold text-rose-500">
            Dismiss
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {[
          { title: 'Categories', rows: categoryRows, add: 'Add category', type: 'categories' as const },
          { title: 'Brands', rows: brandRows, add: 'Add brand', type: 'brands' as const },
          { title: 'Units of measure', rows: unitRows, add: 'Add unit', type: 'units' as const },
        ].map((section) => (
          <div key={section.title} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900">{section.title}</h2>
              <button onClick={() => { setSetupValue(''); setSetupModal({ type: section.type, label: section.add.replace('Add ', '') }); }} className="text-xs font-bold text-accent-600 hover:underline">{section.add}</button>
            </div>
            <div className="divide-y divide-slate-100">
              {section.rows.map((row) => (
                <div key={row.name} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-800">{row.name}</div>
                    <div className="text-xs text-slate-400">{row.count} products using this value</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { const next = window.prompt(`Rename ${section.title.toLowerCase()}`, row.name); if (next?.trim() && next.trim() !== row.name) runSetupChange(catalogueApi.rename(section.type, row.id, next.trim())); }} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Rename">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => runSetupChange(catalogueApi.setActive(section.type, row.id, false))} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Deactivate">
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {setupModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={(event) => { event.preventDefault(); const value = setupValue.trim(); if (!value) return; runSetupChange(catalogueApi.add(setupModal.type, value)); setSetupModal(null); setSetupValue(''); }} className="w-full max-w-md rounded-xl border border-slate-300 bg-white shadow-xl"><div className="flex items-center justify-between rounded-t-xl bg-slate-900 px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wider text-accent-300">Catalogue setup</p><h2 className="mt-1 text-sm font-black">Add {setupModal.label}</h2></div><button type="button" onClick={() => setSetupModal(null)} className="text-xs text-slate-300">Close</button></div><div className="space-y-3 p-5"><label className="block text-xs font-bold text-slate-700">{setupModal.label[0].toUpperCase() + setupModal.label.slice(1)}<input autoFocus required value={setupValue} onChange={(event) => setSetupValue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-sans" placeholder={`Enter ${setupModal.label}`} /></label><button className="w-full rounded-lg bg-accent-600 px-3 py-2.5 text-xs font-bold text-white">Save {setupModal.label}</button></div></form></div>}
      </>
    );
  };

  const downloadText = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseDelimited(text, file.name.endsWith('.tsv') ? '\t' : ',');
    setImportFileName(file.name);
    setImportParsed(parsed);
    setImportMapping(guessMapping(parsed.headers));
    setImportStep('mapping');
  };

  const importValidation = useMemo(
    () => (importParsed ? validateRows(importParsed, importMapping, products) : null),
    [importParsed, importMapping, products],
  );

  const commitImport = () => {
    if (!importValidation) return;
    const created = rowsToProducts(
      importValidation.valid.filter((row) => !row.isUpdate),
      stockKeyFor({ outletId: currentOutlet.id } as Product, currentOutlet),
      products,
    );
    const updated = rowsToProducts(
      importValidation.valid.filter((row) => row.isUpdate),
      stockKeyFor({ outletId: currentOutlet.id } as Product, currentOutlet),
      products,
    );
    created.forEach((product) => onAddProduct(product));
    updated.forEach((product) => onUpdateProduct?.(product));
    setImportResult({ created: created.length, updated: updated.length, skipped: importValidation.invalid.length });
    setImportStep('result');
  };

  const resetImport = () => {
    setImportParsed(null);
    setImportMapping({});
    setImportFileName('');
    setImportResult(null);
    setImportStep('upload');
  };

  const renderImport = () => {
    const steps: ImportStep[] = ['upload', 'mapping', 'validation', 'preview', 'result'];
    const stepIndex = steps.indexOf(importStep);
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Product import</h2>
            <p className="text-sm text-slate-500">Upload, map columns, validate rows, preview changes, then commit.</p>
          </div>
          <button
            onClick={() => downloadText('product-import-template.csv', buildTemplateCsv())}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Download template
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
          {steps.map((step, index) => (
            <span
              key={step}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${
                index === stepIndex
                  ? 'bg-accent-500 text-white'
                  : index < stepIndex
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {index + 1}. {step}
            </span>
          ))}
        </div>

        <div className="p-6">
          {/* D-12: upload */}
          {importStep === 'upload' && (
            <div className="rounded-xl border-2 border-dashed border-slate-300 p-10 text-center">
              <UploadCloud className="mx-auto h-10 w-10 text-slate-400" />
              <h3 className="mt-4 text-sm font-black text-slate-900">Choose a CSV file</h3>
              <p className="mt-1 text-xs text-slate-500">
                One row per product. Name, SKU and retail price are required; everything else is optional.
              </p>
              <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-xs font-bold text-white">
                <UploadCloud className="h-4 w-4" /> Select file
                <input
                  type="file"
                  accept=".csv,.tsv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImportFile(file);
                  }}
                />
              </label>
            </div>
          )}

          {/* D-13: map source columns onto system fields */}
          {importStep === 'mapping' && importParsed && (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">
                <span className="font-bold text-slate-700">{importFileName}</span> — {importParsed.rows.length} data
                rows, {importParsed.headers.length} columns. Matched columns are pre-selected.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {IMPORT_FIELDS.map((field) => (
                  <label key={field.key} className="text-xs font-bold text-slate-700">
                    {field.label}
                    {field.required && <span className="text-rose-600"> *</span>}
                    <select
                      value={importMapping[field.key] ?? ''}
                      onChange={(event) =>
                        setImportMapping((prev) => {
                          const next = { ...prev };
                          if (event.target.value === '') delete next[field.key];
                          else next[field.key] = Number(event.target.value);
                          return next;
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— not imported —</option>
                      {importParsed.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={index}>
                          {header || `Column ${index + 1}`}
                        </option>
                      ))}
                    </select>
                    {importMapping[field.key] !== undefined && importParsed.rows[0] && (
                      <span className="mt-1 block truncate text-[11px] font-normal text-slate-400">
                        e.g. {importParsed.rows[0][importMapping[field.key] as number] || '—'}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={resetImport} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">
                  Start over
                </button>
                <button
                  onClick={() => setImportStep('validation')}
                  className="rounded-lg bg-accent-600 px-4 py-2.5 text-xs font-black text-white"
                >
                  Validate rows
                </button>
              </div>
            </div>
          )}

          {/* D-14: row-level errors with reasons */}
          {importStep === 'validation' && importValidation && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-[10px] font-black uppercase text-emerald-700">Valid rows</p>
                  <p className="mt-1 text-xl font-black text-emerald-900">{importValidation.valid.length}</p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <p className="text-[10px] font-black uppercase text-rose-700">Rows with errors</p>
                  <p className="mt-1 text-xl font-black text-rose-900">{importValidation.invalid.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase text-slate-500">Total parsed</p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {importValidation.valid.length + importValidation.invalid.length}
                  </p>
                </div>
              </div>

              {importValidation.invalid.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-rose-200">
                  <div className="flex items-center justify-between border-b border-rose-200 bg-rose-50 px-4 py-3">
                    <h3 className="text-xs font-black text-rose-900">Rows that cannot be imported</h3>
                    <button
                      onClick={() => downloadText('import-errors.csv', buildErrorCsv(importValidation.invalid))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-700"
                    >
                      <Download className="h-3.5 w-3.5" /> Download error file
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-2">Row</th>
                          <th className="px-4 py-2">SKU</th>
                          <th className="px-4 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importValidation.invalid.slice(0, 50).map((row) => (
                          <tr key={row.rowNumber} className="border-t border-slate-100">
                            <td className="px-4 py-2 font-mono text-slate-500">{row.rowNumber}</td>
                            <td className="px-4 py-2 font-bold text-slate-800">{row.values.sku || '—'}</td>
                            <td className="px-4 py-2 text-rose-700">{row.errors.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setImportStep('mapping')} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">
                  Back to mapping
                </button>
                <button
                  disabled={importValidation.valid.length === 0}
                  onClick={() => setImportStep('preview')}
                  className="rounded-lg bg-accent-600 px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Proceed with {importValidation.valid.length} valid row
                  {importValidation.valid.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}

          {/* D-15: confirm counts before commit */}
          {importStep === 'preview' && importValidation && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase text-slate-500">To create</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{importValidation.toCreate}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase text-slate-500">To update</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{importValidation.toUpdate}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase text-slate-500">Skipped</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{importValidation.invalid.length}</p>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2">SKU</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2 text-right">Retail</th>
                      <th className="px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importValidation.valid.slice(0, 10).map((row) => (
                      <tr key={row.rowNumber} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-mono text-slate-600">{row.values.sku}</td>
                        <td className="px-4 py-2 font-bold text-slate-800">{row.values.name}</td>
                        <td className="px-4 py-2 text-right">{row.values.retailPrice}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.isUpdate ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {row.isUpdate ? 'Update' : 'Create'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importValidation.valid.length > 10 && (
                  <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
                    Showing the first 10 of {importValidation.valid.length} rows.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setImportStep('validation')} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">
                  Back
                </button>
                <button onClick={commitImport} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-black text-white">
                  Commit import
                </button>
              </div>
            </div>
          )}

          {/* D-16: outcome */}
          {importStep === 'result' && importResult && (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h3 className="mt-4 text-lg font-black text-slate-900">Import completed</h3>
              <p className="mt-1 text-sm text-slate-500">
                {importResult.created} created, {importResult.updated} updated, {importResult.skipped} skipped.
              </p>
              <button onClick={resetImport} className="mt-6 rounded-lg bg-accent-600 px-4 py-2.5 text-xs font-bold text-white">
                Import another file
              </button>
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
            {['All', ...setupValues.categories.map((c) => c.name)].map((category) => <option key={category}>{category}</option>)}
          </select>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white">
            {brands.map((brand) => <option key={brand}>{brand}</option>)}
          </select>
          <input type="number" value={bulkPercent} onChange={(e) => setBulkPercent(Number(e.target.value) || 0)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold" />
          <button className="rounded-xl bg-accent-500 text-white text-sm font-black">Preview {bulkPercent}% change</button>
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
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search name, SKU, barcode, brand, category..." className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-accent-500" />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
          {currentOutlet.id === 'all-outlets' && (
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700">
              <option value="all">All outlets</option>
              {realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          )}
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700">
            {['All', ...setupValues.categories.map((c) => c.name)].map((category) => <option key={category}>{category}</option>)}
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

      {/* Batch Selection Action Banner */}
      {selectedProductIds.length > 0 && (
        <div className="bg-accent-50 border border-accent-200 rounded-xl p-3 px-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
            <span className="text-xs font-bold text-accent-950">
              {selectedProductIds.length} of {filteredProducts.length} products selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const firstSelected = products.find((p) => selectedProductIds.includes(p.id));
                setBarcodeProduct(firstSelected || null);
                setBarcodeModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-accent-600 hover:bg-accent-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Barcode className="w-4 h-4" />
              <span>Print Barcodes for Selected ({selectedProductIds.length})</span>
            </button>
            <button
              onClick={() => setSelectedProductIds([])}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-black border-b border-slate-200 uppercase text-[10px] tracking-wide">
              <tr>
                <th className="py-3 px-4">
                  <input
                    type="checkbox"
                    checked={selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-accent-500 cursor-pointer"
                    title="Select all products"
                  />
                </th>
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
                const isSelected = selectedProductIds.includes(product.id);
                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isSelected ? 'bg-accent-50/40' : ''
                    } ${!product.active ? 'opacity-60 bg-slate-50' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectProduct(product.id)}
                        className="accent-accent-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-[260px]">
                        <img src={product.imageUrl} alt={product.name} className="w-11 h-11 rounded-md object-cover border border-slate-200 bg-slate-100" />
                        <div>
                          <button onClick={() => setSelectedProduct(product)} className="font-bold text-slate-800 text-left hover:text-accent-600 line-clamp-2 cursor-pointer">{product.name}</button>
                          <div className="text-[10px] text-slate-400">{product.outletId || 'Shared catalogue'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{product.sku}<br />{primaryBarcode(product)}</td>
                    <td className="py-3 px-4"><div className="font-semibold text-slate-700">{product.category}</div><div className="text-[10px] text-slate-400">{product.brand}</div></td>
                    <td className="py-3 px-4"><span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">{product.baseUnit}</span></td>
                    <td className="py-3 px-4 text-right"><div className="font-black text-slate-900">{formatMoney(product.retailPrice)}</div><div className="text-[10px] text-slate-400">Trade {formatMoney(product.tradePrice)}</div></td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full font-black border ${low ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{stock} {product.baseUnit}</span>
                    </td>
                    <td className="py-3 px-4 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${product.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{product.active ? 'Active' : 'Inactive'}</span></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setBarcodeProduct(product);
                            setBarcodeModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-accent-50 hover:text-accent-600 transition-colors cursor-pointer"
                          title="Print barcode label for this product"
                        >
                          <Barcode className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setSelectedProduct(product)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer" title="View detail"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => startEdit(product)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer" title="Edit product"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onToggleActive(product.id)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer" title="Deactivate product"><Power className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onOpenAdjustment(product)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer" title="Adjust stock"><Sliders className="w-3.5 h-3.5" /></button>
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
            <button onClick={() => { setSearchTerm(''); setCategoryFilter('All'); setBrandFilter('All'); setStockFilter('all'); }} className="mt-2 text-sm font-bold text-accent-600 hover:underline">Clear filters</button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{activeMode === 'import' ? 'Product Import' : activeMode === 'setup' ? 'Catalogue Setup' : activeMode === 'bulk-price' ? 'Bulk Price Update' : 'Product Catalogue'}</h1><InfoHint text="Manage shared product identity, outlet stock, costs, pricing, units, barcodes, imports, and bulk updates." /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setBarcodeProduct(selectedProduct || filteredProducts[0] || products[0] || null);
              setBarcodeModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer shadow-2xs"
            title="Generate and print product barcode labels (Thermal roll or A4 sheet)"
          >
            <Barcode className="w-4 h-4 text-accent-500" /> Print Barcodes
          </button>
          <button onClick={exportProducts} className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => onOpenGoodsReceipt()} className="flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer">
            <Truck className="w-4 h-4 text-accent-400" /> Goods Receipt
          </button>
          <button onClick={startCreate} className="flex items-center gap-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer shadow-xs">
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
                ? 'bg-accent-500 text-white shadow-xs'
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
                <p className="text-xs text-slate-400 font-mono mt-1">{selectedProduct.sku} / {primaryBarcode(selectedProduct)}</p>
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
                  <button onClick={() => setPriceHistoryProduct(selectedProduct)} className="text-xs font-bold text-accent-600 flex items-center gap-1"><History className="w-3.5 h-3.5" /> History</button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <div>Retail <strong className="block text-slate-900">{formatMoney(selectedProduct.retailPrice)}</strong></div>
                  <div>Trade <strong className="block text-slate-900">{formatMoney(selectedProduct.tradePrice)}</strong></div>
                  <div>Floor <strong className="block text-slate-900">{formatMoney(selectedProduct.floorPrice)}</strong></div>
                  {canViewCost && (() => {
                    // FR-PRICE-08: both margins side by side. The accounting
                    // margin is against the weighted average of what is on the
                    // shelf; the replacement margin is against what the last
                    // delivery cost — one says what the sale earned, the other
                    // says whether the price still works.
                    const key = stockKeyFor(selectedProduct, currentOutlet);
                    const averageCost = selectedProduct.costPrice[key];
                    const latestCost = selectedProduct.replacementCost?.[key];
                    // A loss reads as a loss. Flooring it at zero is how a
                    // product sold below cost looks fine on a product screen.
                    const margin = (cost?: number) =>
                      cost == null || selectedProduct.retailPrice <= 0
                        ? '—'
                        : `${(((selectedProduct.retailPrice - cost) / selectedProduct.retailPrice) * 100).toFixed(1)}%`;
                    const tone = (cost?: number) =>
                      cost != null && cost > selectedProduct.retailPrice ? 'text-rose-700' : 'text-emerald-700';

                    return (
                      <>
                        <div>Cost <strong className="block text-slate-900">{averageCost == null ? '—' : formatMoney(averageCost)}</strong></div>
                        <div>
                          Accounting margin
                          <strong className={`block ${tone(averageCost)}`}>{margin(averageCost)}</strong>
                        </div>
                        <div>
                          Latest purchase
                          <strong className="block text-slate-900">{latestCost == null ? '—' : formatMoney(latestCost)}</strong>
                        </div>
                        <div>
                          Replacement margin
                          <strong className={`block ${tone(latestCost)}`}>{margin(latestCost)}</strong>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">Units and barcodes</h3>
                  <button
                    onClick={() => {
                      setBarcodeProduct(selectedProduct);
                      setBarcodeModalOpen(true);
                    }}
                    className="text-xs font-bold text-accent-600 hover:text-accent-700 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Barcode className="w-3.5 h-3.5" /> Print Barcode Label
                  </button>
                </div>
                {primaryBarcode(selectedProduct) && (
                  <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-2xs">
                        <ProductBarcodeSvg
                          value={primaryBarcode(selectedProduct)}
                          width={1.2}
                          height={28}
                          fontSize={9}
                        />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">Primary Barcode</div>
                        <div className="text-[11px] font-mono text-slate-600">{primaryBarcode(selectedProduct)}</div>
                        <div className="text-[10px] text-slate-400">Scan at POS terminal or print stickers</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setBarcodeProduct(selectedProduct);
                        setBarcodeModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Label</span>
                    </button>
                  </div>
                )}
                <div className="divide-y divide-slate-100">
                  {(selectedProduct.sellingUnits || [{ name: selectedProduct.baseUnit, conversionFactor: 1, price: selectedProduct.retailPrice }]).map((unit) => (
                    <div key={unit.name} className="px-4 py-3 flex justify-between text-sm">
                      <span className="font-bold text-slate-800">{unit.name} <span className="text-slate-400 font-normal">x{unit.conversionFactor}</span></span>
                      <span className="font-mono text-slate-500">{barcodeForUnit(selectedProduct, unit.name) || 'Add barcode'}</span>
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
                <div className="w-10 h-10 rounded-lg bg-accent-500/20 border border-accent-500/40 text-accent-400 flex items-center justify-center">
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
                <label className="text-xs font-bold text-slate-700">Outlet<select required value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500"><option value="" disabled>Select outlet</option>{realOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-700 md:col-span-2">Product name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-accent-500" /></label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <label className="text-xs font-bold text-slate-700">SKU<input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono uppercase text-slate-800 focus:outline-accent-500" /></label>
                <label className="text-xs font-bold text-slate-700">Primary barcode<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-800 focus:outline-accent-500" /></label>
                <label className="text-xs font-bold text-slate-700">Category<select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Product['category'] | '' })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500"><option value="" disabled>Select category</option>{setupValues.categories.map((category) => <option key={category.id}>{category.name}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-700">Brand<input list="known-brands" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-accent-500" />
                  {/* Still free text — a new brand is created by naming it — but
                      the existing ones are offered, so "FOCUS" and "Focus
                      Lighting" do not quietly become two brands. */}
                  <datalist id="known-brands">{setupValues.brands.map((brand) => <option key={brand.id} value={brand.name} />)}</datalist></label>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2"><Archive className="w-4 h-4 text-accent-500" /> Units and conversions</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <label className="text-xs font-bold text-slate-700">Base unit<select required value={form.baseUnit} onChange={(e) => setForm({ ...form, baseUnit: e.target.value as Product['baseUnit'] | '' })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500"><option value="" disabled>Select unit</option>{setupValues.units.map((unit) => <option key={unit.id}>{unit.name}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-700">Extra unit<input value={form.sellingUnitName} onChange={(e) => setForm({ ...form, sellingUnitName: e.target.value })} placeholder="Carton, Drum, Box" className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Factor to base<input type="number" value={form.sellingUnitFactor} onChange={(e) => setForm({ ...form, sellingUnitFactor: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Unit override price<input type="number" value={form.sellingUnitPrice} onChange={(e) => setForm({ ...form, sellingUnitPrice: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500" /></label>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-accent-500" /> Pricing panel</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {canViewCost && <label className="text-xs font-bold text-slate-700">Cost<input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500" /></label>}
                  <label className="text-xs font-bold text-slate-700">Retail<input type="number" required value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Trade<input type="number" value={form.tradePrice} onChange={(e) => setForm({ ...form, tradePrice: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500" /></label>
                  <label className="text-xs font-bold text-slate-700">Floor<input type="number" value={form.floorPrice} onChange={(e) => setForm({ ...form, floorPrice: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm bg-white text-slate-800 focus:outline-accent-500" /></label>
                </div>
                {canViewCost && <div className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">Live margin: {Number(form.retailPrice) > 0 ? (((Number(form.retailPrice) - Number(form.cost || 0)) / Number(form.retailPrice)) * 100).toFixed(1) : '0.0'}%</div>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-xs font-bold text-slate-700">Stock<input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-accent-500" />
                  {/* Opening stock and cost are per outlet and nothing stores
                      them yet. Saying so beats accepting a number and dropping
                      it, which is what this form did. */}
                  <span className="mt-1 block text-[10px] font-semibold text-amber-700">Held for this session only — stock is recorded by Goods Receipt</span></label>
                <label className="text-xs font-bold text-slate-700">Reorder level<input type="number" value={form.minAlert} onChange={(e) => setForm({ ...form, minAlert: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-accent-500" /></label>
                <label className="text-xs font-bold text-slate-700">Image URL<input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="mt-1 w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-accent-500" /></label>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setAddModalOpen(false)} className="sm:w-1/3 py-3 rounded-lg border border-slate-300 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" className="sm:w-2/3 py-3 rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-bold text-sm shadow-xs transition-colors">{editingProduct ? 'Save Changes' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Generation and Printing Modal */}
      <ProductBarcodeModal
        isOpen={barcodeModalOpen}
        onClose={() => {
          setBarcodeModalOpen(false);
          setBarcodeProduct(null);
        }}
        product={barcodeProduct}
        products={selectedProductIds.length > 0 ? selectedProductsForPrint : products}
        currentOutlet={currentOutlet}
      />
    </div>
  );
};
