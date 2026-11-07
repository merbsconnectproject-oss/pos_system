import React, { useState, useEffect, useRef, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Printer,
  X,
  Copy,
  Check,
  Download,
  Barcode,
  Sliders,
  Maximize2,
  Package,
  Layers,
  ChevronDown,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { Product, Outlet } from '../types';
import { primaryBarcode } from '../catalogue';

export type BarcodeLabelSize = 'roll-40x25' | 'roll-50x30' | 'roll-60x40' | 'sheet-a4-24' | 'sheet-a4-40';

export interface ProductBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  products?: Product[];
  currentOutlet?: Outlet;
  onPrintComplete?: () => void;
}

/**
 * High-precision vector SVG Barcode generator using JsBarcode.
 * Guarantees razor-sharp lines without rasterization fuzz on 203/300 DPI thermal printers.
 */
export const ProductBarcodeSvg: React.FC<{
  value: string;
  format?: 'CODE128' | 'EAN13' | 'CODE39';
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
}> = ({
  value,
  format = 'CODE128',
  width = 1.6,
  height = 36,
  displayValue = true,
  fontSize = 10,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;

    try {
      JsBarcode(svgRef.current, value, {
        format: format,
        width: width,
        height: height,
        displayValue: displayValue,
        font: 'monospace',
        textAlign: 'center',
        textPosition: 'bottom',
        textMargin: 2,
        fontSize: fontSize,
        background: 'transparent',
        lineColor: '#000000',
        margin: 0,
      });
    } catch {
      // Fallback to CODE128 if EAN-13 fails checksum or length
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width: width,
          height: height,
          displayValue: displayValue,
          font: 'monospace',
          textAlign: 'center',
          textPosition: 'bottom',
          textMargin: 2,
          fontSize: fontSize,
          background: 'transparent',
          lineColor: '#000000',
          margin: 0,
        });
      } catch (e) {
        console.error('Failed to render barcode fallback:', e);
      }
    }
  }, [value, format, width, height, displayValue, fontSize]);

  // An empty value used to render an empty <svg> — a label that printed blank
  // and a preview that looked broken, with nothing anywhere saying the product
  // simply has no code. Say so instead.
  if (!value) {
    return (
      <div
        className={`mx-auto flex flex-col items-center justify-center gap-0.5 border border-dashed border-current/50 px-3 py-2 text-center ${className}`}
        style={{ minHeight: height }}
        role="img"
        aria-label="This product has no barcode"
      >
        <span className="text-[9px] font-bold uppercase tracking-wider">No barcode</span>
        <span className="text-[8px] leading-tight opacity-80">Products &rsaquo; edit &rsaquo; Generate</span>
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      className={`mx-auto block ${className}`}
      shapeRendering="crispEdges"
      aria-label={`Barcode ${value}`}
    />
  );
};

export const ProductBarcodeModal: React.FC<ProductBarcodeModalProps> = ({
  isOpen,
  onClose,
  product: initialProduct,
  products = [],
  currentOutlet,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct || products[0] || null);
  const [labelSize, setLabelSize] = useState<BarcodeLabelSize>('roll-50x30');
  const [copies, setCopies] = useState<number>(1);
  const [printAllSelected, setPrintAllSelected] = useState<boolean>(false);
  const [barcodeFormat, setBarcodeFormat] = useState<'CODE128' | 'EAN13' | 'CODE39'>('CODE128');

  // Label field toggles
  const [showStoreName, setShowStoreName] = useState<boolean>(true);
  const [showProductName, setShowProductName] = useState<boolean>(true);
  const [showSku, setShowSku] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showUnit, setShowUnit] = useState<boolean>(true);
  const [showBarcodeText, setShowBarcodeText] = useState<boolean>(true);

  const [copied, setCopied] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(140);

  // Sync initial product if changed
  useEffect(() => {
    if (initialProduct) {
      setSelectedProduct(initialProduct);
    } else if (products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0]);
    }
  }, [initialProduct, products]);

  // Keyboard shortcut: Esc to close, Ctrl/Cmd + P to print
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !selectedProduct) return null;

  // Active product stock for "Match Stock" feature
  const outletKey = currentOutlet?.id || 'inco-hardware';
  const currentStock = selectedProduct.stock[outletKey] || Object.values(selectedProduct.stock)[0] || 1;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyBarcode = async () => {
    try {
      await navigator.clipboard.writeText(primaryBarcode(selectedProduct));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadSvg = () => {
    const svgElement = document.getElementById('preview-barcode-svg');
    if (!svgElement) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElement);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `barcode_${selectedProduct.sku}_${primaryBarcode(selectedProduct)}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Dimensions based on selected label size
  const getDimensions = () => {
    switch (labelSize) {
      case 'roll-40x25':
        return {
          widthMm: 40,
          heightMm: 25,
          barcodeHeight: 24,
          barcodeWidth: 1.2,
          fontSize: 8,
          nameClass: 'text-[9px]',
          priceClass: 'text-xs',
        };
      case 'roll-60x40':
        return {
          widthMm: 60,
          heightMm: 40,
          barcodeHeight: 38,
          barcodeWidth: 1.8,
          fontSize: 10,
          nameClass: 'text-xs',
          priceClass: 'text-sm font-black',
        };
      case 'sheet-a4-24':
        return {
          widthMm: 64,
          heightMm: 33.8,
          barcodeHeight: 30,
          barcodeWidth: 1.5,
          fontSize: 9,
          nameClass: 'text-[10.5px]',
          priceClass: 'text-xs font-black',
        };
      case 'sheet-a4-40':
        return {
          widthMm: 48.5,
          heightMm: 25.4,
          barcodeHeight: 22,
          barcodeWidth: 1.2,
          fontSize: 8,
          nameClass: 'text-[9px]',
          priceClass: 'text-xs',
        };
      case 'roll-50x30':
      default:
        return {
          widthMm: 50,
          heightMm: 30,
          barcodeHeight: 28,
          barcodeWidth: 1.4,
          fontSize: 9,
          nameClass: 'text-[10px]',
          priceClass: 'text-xs font-black',
        };
    }
  };

  if (!isOpen || !selectedProduct) {
    return null;
  }

  const dim = getDimensions();

  // List of items to print in batch or single
  const printItems: { product: Product; count: number }[] = printAllSelected
    ? products.map((p) => ({ product: p, count: copies }))
    : [{ product: selectedProduct, count: copies }];

  // Expanded copies array for sheet/print rendering
  const expandedLabels: Product[] = [];
  printItems.forEach((item) => {
    for (let i = 0; i < item.count; i++) {
      expandedLabels.push(item.product);
    }
  });

  // FR-PROD-04: printing a sheet of blank stickers wastes a roll and is only
  // discovered at the shelf. Name the products that cannot print before it does.
  const withoutBarcode = Array.from(
    new Map(expandedLabels.filter((p) => !primaryBarcode(p)).map((p) => [p.id, p])).values(),
  );

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-modal-title"
        className="fixed inset-0 z-75 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-modal-backdrop"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-modal-card"
        >
          {/* Header */}
          <header className="p-4 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-600/20 border border-accent-500/30 flex items-center justify-center text-accent-400">
                <Barcode className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="barcode-modal-title" className="text-base font-bold text-white">
                    Print Product Barcode Labels
                  </h2>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    {selectedProduct.sku}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generate crisp, scanner-ready barcode labels for thermal printers or sticker sheets
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-accent-600 hover:bg-accent-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print {expandedLabels.length} {expandedLabels.length === 1 ? 'Label' : 'Labels'}</span>
              </button>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Body: Left settings, Right interactive preview */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-0">
            {/* Left Control Panel */}
            <div className="lg:col-span-5 p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/60 overflow-y-auto space-y-4 text-xs">
              {/* Product Selector */}
              {products.length > 1 && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
                    Target Product
                  </label>
                  <div className="relative">
                    <select
                      value={selectedProduct.id}
                      onChange={(e) => {
                        const found = products.find((p) => p.id === e.target.value);
                        if (found) setSelectedProduct(found);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs appearance-none focus:outline-accent-500 focus:border-accent-500 cursor-pointer"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku} - {primaryBarcode(p)})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Label Size & Printer Format */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
                  Label Format & Printer Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[
                    { id: 'roll-50x30', label: '50 × 30 mm', desc: 'Standard shelf / box' },
                    { id: 'roll-40x25', label: '40 × 25 mm', desc: 'Small tag / jewelry' },
                    { id: 'roll-60x40', label: '60 × 40 mm', desc: 'Large pallet / bin' },
                    { id: 'sheet-a4-24', label: 'A4 Sheet (24-up)', desc: '3×8 sticker sheet' },
                    { id: 'sheet-a4-40', label: 'A4 Sheet (40-up)', desc: '4×10 sticker sheet' },
                  ].map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => setLabelSize(size.id as BarcodeLabelSize)}
                      className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        labelSize === size.id
                          ? 'bg-accent-600/15 border-accent-500 text-white'
                          : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold text-xs">{size.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{size.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Copies & Quantity */}
              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase text-slate-400">
                    Label Quantity (Copies)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCopies(Math.max(1, currentStock))}
                    className="text-[11px] font-semibold text-accent-400 hover:text-accent-300 hover:underline cursor-pointer"
                  >
                    Match Stock ({currentStock} in {currentOutlet?.name || 'store'})
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-slate-700 bg-slate-800 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCopies((c) => Math.max(1, c - 1))}
                      className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 font-bold text-sm cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-14 text-center bg-transparent font-mono font-bold text-white text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCopies((c) => Math.min(500, c + 1))}
                      className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 font-bold text-sm cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {[1, 5, 10, 20].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCopies(num)}
                        className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                          copies === num
                            ? 'bg-accent-500 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                {products.length > 1 && (
                  <label className="flex items-center gap-2 pt-1 text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={printAllSelected}
                      onChange={(e) => setPrintAllSelected(e.target.checked)}
                      className="accent-accent-500 rounded"
                    />
                    <span>Print for all {products.length} products in list ({copies} each)</span>
                  </label>
                )}
              </div>

              {/* Label Field Options */}
              <div className="space-y-2">
                <label className="block text-[11px] font-bold uppercase text-slate-400">
                  Label Content Fields
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showStoreName}
                      onChange={(e) => setShowStoreName(e.target.checked)}
                      className="accent-accent-500"
                    />
                    <span>Store / Brand</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showProductName}
                      onChange={(e) => setShowProductName(e.target.checked)}
                      className="accent-accent-500"
                    />
                    <span>Product Title</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={(e) => setShowPrice(e.target.checked)}
                      className="accent-accent-500"
                    />
                    <span>Price (GH₵)</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showUnit}
                      onChange={(e) => setShowUnit(e.target.checked)}
                      className="accent-accent-500"
                    />
                    <span>Unit (e.g. {selectedProduct.baseUnit})</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSku}
                      onChange={(e) => setShowSku(e.target.checked)}
                      className="accent-accent-500"
                    />
                    <span>SKU Code</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showBarcodeText}
                      onChange={(e) => setShowBarcodeText(e.target.checked)}
                      className="accent-accent-500"
                    />
                    <span>Barcode Text</span>
                  </label>
                </div>
              </div>

              {/* Barcode Format Selection */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Barcode Symbology
                </label>
                <div className="flex gap-2">
                  {(['CODE128', 'EAN13', 'CODE39'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setBarcodeFormat(fmt)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                        barcodeFormat === fmt
                          ? 'bg-accent-600/20 border-accent-500 text-accent-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyBarcode}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Barcode'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save Barcode SVG</span>
                </button>
              </div>
            </div>

            {/* Right Preview Surface */}
            <div className="lg:col-span-7 p-4 sm:p-6 bg-slate-950/60 flex flex-col overflow-y-auto">
              {/* Preview Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Eye className="w-4 h-4 text-accent-400" />
                  <span className="font-semibold text-slate-200">Live Label Preview</span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    ({dim.widthMm}mm × {dim.heightMm}mm)
                  </span>
                </div>

                {/* Zoom control */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Zoom</span>
                  <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
                    {[100, 140, 180].map((z) => (
                      <button
                        key={z}
                        onClick={() => setPreviewZoom(z)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                          previewZoom === z ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {z}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Label Centering Container */}
              <div className="flex-1 flex items-center justify-center p-4">
                <div
                  style={{
                    transform: `scale(${previewZoom / 100})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease',
                  }}
                  className="shadow-2xl rounded-sm"
                >
                  {/* Single Label Card: matches thermal roll exact physical proportion */}
                  <div
                    style={{
                      width: `${dim.widthMm * 3.78}px`,
                      minHeight: `${dim.heightMm * 3.78}px`,
                    }}
                    className="bg-white text-black p-2.5 rounded-sm border border-slate-400 shadow-md flex flex-col justify-between select-none"
                  >
                    {/* Header: Store / Brand */}
                    {showStoreName && (
                      <div className="text-[8px] font-black uppercase tracking-wider text-black text-center truncate border-b border-black/20 pb-0.5 mb-1">
                        {currentOutlet?.name || selectedProduct.brand || 'RADIANCE POS'}
                      </div>
                    )}

                    {/* Product Name */}
                    {showProductName && (
                      <div
                        className={`font-black text-black text-center line-clamp-2 leading-tight ${dim.nameClass}`}
                        title={selectedProduct.name}
                      >
                        {selectedProduct.name}
                      </div>
                    )}

                    {/* Barcode SVG */}
                    <div className="my-1 flex justify-center items-center">
                      <ProductBarcodeSvg
                        value={primaryBarcode(selectedProduct)}
                        format={barcodeFormat}
                        width={dim.barcodeWidth}
                        height={dim.barcodeHeight}
                        displayValue={showBarcodeText}
                        fontSize={dim.fontSize}
                        className="max-w-full"
                      />
                    </div>

                    {/* Bottom Metadata: SKU + Price */}
                    <div className="flex items-end justify-between gap-1 pt-1 border-t border-black/30 mt-auto">
                      {showSku && (
                        <div className="text-[8px] font-mono text-black leading-tight">
                          <span className="font-bold">SKU:</span> {selectedProduct.sku}
                        </div>
                      )}
                      {showPrice && (
                        <div className="text-right ml-auto leading-none">
                          <span className={`font-black text-black ${dim.priceClass}`}>
                            GH₵ {selectedProduct.retailPrice.toFixed(2)}
                          </span>
                          {showUnit && (
                            <span className="text-[8px] font-normal text-black block text-right mt-0.5">
                              /{selectedProduct.baseUnit}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* The warning and the footer are pinned to the bottom together, so
                  the warning keeps the full width of the panel. Inside the footer
                  row it shared a flex cell with the sticker count and was drawn
                  as a narrow column beside the print button. */}
              <div className="mt-auto">
                {withoutBarcode.length > 0 && (
                  <div
                    role="alert"
                    className="mb-3 rounded-lg border border-amber-700/70 bg-amber-950/50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-200"
                  >
                    <strong className="font-bold">
                      {withoutBarcode.length} {withoutBarcode.length === 1 ? 'product has' : 'products have'} no barcode
                    </strong>{' '}
                    and will print a blank label: {withoutBarcode.slice(0, 4).map((p) => p.name).join(', ')}
                    {withoutBarcode.length > 4 ? `, and ${withoutBarcode.length - 4} more` : ''}.
                    {' '}Give each one a code in Products &rsaquo; edit &rsaquo; <strong>Generate</strong>, then print.
                  </div>
                )}

                {/* Print Summary Footer */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    Ready to print: <strong className="text-white">{expandedLabels.length} {expandedLabels.length === 1 ? 'sticker' : 'stickers'}</strong> on {labelSize.startsWith('roll') ? 'thermal continuous roll' : 'A4 sheet'}.
                  </div>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 bg-accent-600 hover:bg-accent-500 text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Send to Printer</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden isolated print surface for barcode labels */}
      <div id="printable-barcode-labels" aria-hidden="true">
        <div className={`barcode-print-container ${labelSize}`}>
          {expandedLabels.map((prod, idx) => (
            <div
              key={`${prod.id}-${idx}`}
              className="barcode-label-slip"
              style={{
                width: `${dim.widthMm}mm`,
                height: `${dim.heightMm}mm`,
                maxWidth: `${dim.widthMm}mm`,
                maxHeight: `${dim.heightMm}mm`,
              }}
            >
              {showStoreName && (
                <div className="barcode-label-store">
                  {currentOutlet?.name || prod.brand || 'RADIANCE POS'}
                </div>
              )}
              {showProductName && (
                <div className="barcode-label-name">
                  {prod.name}
                </div>
              )}
              <div className="barcode-label-svg-wrap">
                <ProductBarcodeSvg
                  value={primaryBarcode(prod)}
                  format={barcodeFormat}
                  width={dim.barcodeWidth}
                  height={dim.barcodeHeight}
                  displayValue={showBarcodeText}
                  fontSize={dim.fontSize}
                />
              </div>
              <div className="barcode-label-footer">
                {showSku && <span className="barcode-label-sku">SKU: {prod.sku}</span>}
                {showPrice && (
                  <span className="barcode-label-price">
                    GH₵ {prod.retailPrice.toFixed(2)}
                    {showUnit ? `/${prod.baseUnit}` : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
