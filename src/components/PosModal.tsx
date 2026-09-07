import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  PauseCircle,
  Receipt,
  Printer,
  CheckCircle2,
  Barcode,
  Smartphone,
  CreditCard,
  Building2,
  DollarSign,
  ArrowLeft,
  User,
  ShieldAlert,
  Percent,
  Calculator,
  Tag,
  Phone,
} from 'lucide-react';
import {
  Product,
  CartItem,
  CompletedSale,
  Outlet,
  PaymentMethod,
  PaymentSplit,
  Customer,
} from '../types';
import { ManagerPinModal } from './ManagerPinModal';

interface PosModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  currentOutlet: Outlet;
  customers: Customer[];
  onSaleCompleted: (sale: CompletedSale) => void;
}

export const PosModal: React.FC<PosModalProps> = ({
  isOpen,
  onClose,
  products,
  currentOutlet,
  customers,
  onSaleCompleted,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchPhone, setCustomerSearchPhone] = useState('');
  const [cartDiscountPercent, setCartDiscountPercent] = useState<number>(0);
  const [heldCarts, setHeldCarts] = useState<Array<{ label: string; items: CartItem[]; customer: Customer | null }>>([]);

  // Payment modal states
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activePaymentTab, setActivePaymentTab] = useState<'cash' | 'momo' | 'split'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  
  // MoMo details
  const [momoProvider, setMomoProvider] = useState<'MTN MoMo' | 'Telecel Cash' | 'AT Money'>('MTN MoMo');
  const [momoPhone, setMomoPhone] = useState('');
  const [momoReference, setMomoReference] = useState('');
  const [momoVerified, setMomoVerified] = useState(false);

  // Split payment details
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [splitMomoAmount, setSplitMomoAmount] = useState<number>(0);
  const [splitMomoRef, setSplitMomoRef] = useState('');

  // Receipt modal state
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [receiptReprint, setReceiptReprint] = useState(false);
  const [mobileCartDrawerOpen, setMobileCartDrawerOpen] = useState(false);

  // Manager PIN modal state for Floor Price Override (BR-10)
  const [floorOverrideTarget, setFloorOverrideTarget] = useState<{ productId: string; requestedPrice: number } | null>(null);

  // Barcode simulation
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const outletId = currentOutlet.id === 'all-outlets' ? 'inco-hardware' : currentOutlet.id;

  // Reset category and cart when active outlet changes
  useEffect(() => {
    setSelectedCategory('All');
    setCart([]);
  }, [currentOutlet.id]);

  // Categories tailored specifically to the distinct store line
  const categories =
    outletId === 'inco-hardware'
      ? [
          'All',
          'Power Tools & Machinery',
          'Hand Tools & Hardware',
          'Plumbing & Sanitary',
          'Paints & Adhesives',
          'Fasteners & Fixings',
          'Building & Site Safety',
        ]
      : outletId === 'apex-electricals'
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

  // Calculate totals
  const subtotal = cart.reduce((acc, item) => acc + item.lineTotal, 0);
  const discountTotal = (subtotal * cartDiscountPercent) / 100;
  const total = Math.max(0, subtotal - discountTotal);
  const cashTenderedNum = parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, cashTenderedNum - total);

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !paymentModalOpen && !completedSale) {
        onClose();
      } else if (e.key === 'F2' && cart.length > 0 && !paymentModalOpen) {
        e.preventDefault();
        setPaymentModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, cart, paymentModalOpen, completedSale]);

  if (!isOpen) return null;

  // Add product to cart with selling unit support & trade pricing
  const handleAddToCart = (product: Product, unitIndex = 0) => {
    const unit = product.sellingUnits && product.sellingUnits[unitIndex]
      ? product.sellingUnits[unitIndex]
      : { name: product.baseUnit, conversionFactor: 1, price: product.retailPrice, tradePrice: product.tradePrice };

    // Apply trade price if customer is electrician or contractor
    const isTradeCustomer = selectedCustomer && (selectedCustomer.customerType === 'electrician' || selectedCustomer.customerType === 'contractor');
    const unitPrice = isTradeCustomer ? (unit.tradePrice || product.tradePrice) : (unit.price || product.retailPrice);
    const frozenCost = (product.costPrice[outletId] || product.retailPrice * 0.7) * unit.conversionFactor;

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.selectedUnit === unit.name);
      if (existing) {
        const newQty = existing.quantity + 1;
        return prev.map((item) =>
          item.product.id === product.id && item.selectedUnit === unit.name
            ? { ...item, quantity: newQty, lineTotal: newQty * item.unitPrice }
            : item
        );
      } else {
        return [
          ...prev,
          {
            product,
            quantity: 1,
            selectedUnit: unit.name,
            conversionFactor: unit.conversionFactor,
            unitPrice,
            frozenCostPrice: frozenCost,
            discount: 0,
            lineTotal: unitPrice,
          },
        ];
      }
    });

    setScanNotice(`Added ${product.name} (${unit.name})`);
    setTimeout(() => setScanNotice(null), 1500);
  };

  const handleUpdateQuantity = (productId: string, unitName: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(productId, unitName);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId && item.selectedUnit === unitName) {
          return {
            ...item,
            quantity: newQty,
            lineTotal: Number((newQty * item.unitPrice).toFixed(2)),
          };
        }
        return item;
      })
    );
  };

  const handleUpdatePrice = (productId: string, unitName: string, newPrice: number) => {
    const item = cart.find((i) => i.product.id === productId && i.selectedUnit === unitName);
    if (!item) return;

    // Floor price check in base units (BR-10)
    const effectiveFloorPrice = item.product.floorPrice * item.conversionFactor;
    if (newPrice < effectiveFloorPrice && !item.floorPriceApproved) {
      // Trigger manager PIN modal
      setFloorOverrideTarget({ productId, requestedPrice: newPrice });
      return;
    }

    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id === productId && i.selectedUnit === unitName) {
          return {
            ...i,
            unitPrice: newPrice,
            lineTotal: Number((i.quantity * newPrice).toFixed(2)),
          };
        }
        return i;
      })
    );
  };

  const handleFloorPinSuccess = (approverName: string) => {
    if (!floorOverrideTarget) return;
    const { productId, requestedPrice } = floorOverrideTarget;

    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          return {
            ...item,
            unitPrice: requestedPrice,
            lineTotal: Number((item.quantity * requestedPrice).toFixed(2)),
            floorPriceApproved: true,
            floorPriceApprover: approverName,
          };
        }
        return item;
      })
    );

    setFloorOverrideTarget(null);
  };

  const handleRemoveItem = (productId: string, unitName: string) => {
    setCart((prev) => prev.filter((i) => !(i.product.id === productId && i.selectedUnit === unitName)));
  };

  const handleCustomerPhoneLookup = (phone: string) => {
    setCustomerSearchPhone(phone);
    const found = customers.find((c) => c.phone.includes(phone));
    if (found) {
      setSelectedCustomer(found);
      // Recalculate cart items with trade pricing if trade customer!
      if (found.customerType === 'electrician' || found.customerType === 'contractor') {
        setCart((prev) =>
          prev.map((item) => {
            const tradePrice = item.product.tradePrice * item.conversionFactor;
            return {
              ...item,
              unitPrice: tradePrice,
              lineTotal: Number((item.quantity * tradePrice).toFixed(2)),
            };
          })
        );
      }
    }
  };

  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const label = `Held #${heldCarts.length + 1} (${selectedCustomer?.name || 'Walk-in'})`;
    setHeldCarts([...heldCarts, { label, items: [...cart], customer: selectedCustomer }]);
    setCart([]);
    setSelectedCustomer(null);
    alert(`Sale held as "${label}". You can resume anytime from the Held list.`);
  };

  const handleResumeCart = (index: number) => {
    const selected = heldCarts[index];
    setCart(selected.items);
    setSelectedCustomer(selected.customer);
    setHeldCarts(heldCarts.filter((_, i) => i !== index));
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;
    const clean = barcodeInput.trim();
    const found = products.find(
      (p) =>
        (!p.outletId || p.outletId === 'all-outlets' || p.outletId === outletId) &&
        (p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase())
    );
    if (found) {
      handleAddToCart(found);
      setBarcodeInput('');
    } else {
      const otherStoreProd = products.find(
        (p) => p.barcode === clean || p.sku.toLowerCase() === clean.toLowerCase()
      );
      if (otherStoreProd) {
        const otherStoreName =
          otherStoreProd.outletId === 'inco-hardware' ? 'Inco Hardware' : 'Apex Electricals';
        alert(`Product "${otherStoreProd.name}" belongs to ${otherStoreName} catalog and is not stocked at ${currentOutlet.name}.`);
      } else {
        alert(`No product found matching barcode / SKU "${clean}"`);
      }
    }
  };

  // Complete Payment and Sale
  const handleFinalizeSale = () => {
    const payments: PaymentSplit[] = [];

    if (activePaymentTab === 'cash') {
      payments.push({
        method: 'cash',
        amount: total,
      });
    } else if (activePaymentTab === 'momo') {
      if (!momoReference.trim()) {
        alert('Mandatory MoMo Transaction Reference ID required (FR-SALE-12)');
        return;
      }
      if (!momoVerified) {
        alert('Please confirm SMS verification on the shop phone before completing (FR-SALE-13)');
        return;
      }
      payments.push({
        method: 'momo',
        amount: total,
        provider: momoProvider,
        reference: momoReference,
        verified: true,
      });
    } else if (activePaymentTab === 'split') {
      const splitTotal = splitCashAmount + splitMomoAmount;
      if (Math.abs(splitTotal - total) > 0.05) {
        alert(`Split amounts (GH₵ ${splitTotal.toFixed(2)}) must equal total (GH₵ ${total.toFixed(2)})`);
        return;
      }
      if (splitCashAmount > 0) {
        payments.push({ method: 'cash', amount: splitCashAmount });
      }
      if (splitMomoAmount > 0) {
        payments.push({
          method: 'momo',
          amount: splitMomoAmount,
          provider: momoProvider,
          reference: splitMomoRef || 'SPLIT-MOMO',
          verified: true,
        });
      }
    }

    const receiptSeq = Math.floor(1000 + Math.random() * 9000);
    const receiptNumber = `${currentOutlet.receiptPrefix}-${receiptSeq}`;

    const sale: CompletedSale = {
      id: `sale-${Date.now()}`,
      receiptNumber,
      outletId: outletId as 'inco-hardware' | 'apex-electricals',
      outletName: currentOutlet.name,
      terminalId: '01',
      cashierName: 'Kwame A.',
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer ? selectedCustomer.name : 'Walk-in Customer',
      customerPhone: selectedCustomer?.phone,
      customerType: selectedCustomer?.customerType || 'retail',
      items: [...cart],
      subtotal,
      discountTotal,
      total,
      payments,
      changeDue: activePaymentTab === 'cash' ? changeDue : 0,
      createdAt: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'COMPLETED',
    };

    onSaleCompleted(sale);
    setCompletedSale(sale);
    setPaymentModalOpen(false);
    setCart([]);
    setSelectedCustomer(null);
    setCashTendered('');
    setMomoReference('');
    setMomoVerified(false);
  };

  const filteredProducts = products.filter((p) => {
    const matchesOutlet = !p.outletId || p.outletId === 'all-outlets' || p.outletId === outletId;
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery);
    return matchesOutlet && matchesCat && matchesSearch && p.active;
  });

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-modal-backdrop">
      <div className="bg-slate-100 rounded-2xl w-full max-w-[1550px] h-[95vh] flex flex-col overflow-hidden shadow-2xl border border-slate-300 animate-modal-card">
        {/* POS Top Bar */}
        <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 text-white p-1.5 rounded-lg font-black text-xs tracking-wider">
              POS
            </div>
            <div>
              <div className="font-black text-sm flex items-center gap-2">
                <span>{currentOutlet.name}</span>
                <span className="text-[11px] font-semibold text-orange-400 bg-white/10 px-2 py-0.5 rounded-md">
                  Terminal #01
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {outletId === 'inco-hardware' ? 'Tools, Hardware & Plumbing Catalog' : 'Electricals, Cables & Switchgear Catalog'}
                </span>
              </div>
              <div className="text-[10px] text-slate-300">
                Cashier: <strong>Kwame A.</strong> • Currency: <strong>GHS (GH₵)</strong> • Town: <strong>{currentOutlet.town}</strong>
              </div>
            </div>
          </div>

          {/* Barcode Quick Scanner input */}
          <form onSubmit={handleBarcodeSubmit} className="hidden md:flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-lg">
            <Barcode className="w-4 h-4 text-orange-400" />
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan barcode or type SKU..."
              className="text-xs bg-transparent text-white placeholder-slate-400 focus:outline-none w-48 font-mono"
            />
            <button type="submit" className="text-[10px] bg-orange-500 hover:bg-orange-600 text-white font-bold px-2 py-0.5 rounded">
              Enter
            </button>
          </form>

          <div className="flex items-center gap-2">
            {heldCarts.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => handleResumeCart(0)}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs"
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>Resume Held ({heldCarts.length})</span>
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors"
              title="Close POS (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scan Toast Notice */}
        {scanNotice && (
          <div className="bg-emerald-600 text-white text-xs font-bold py-1.5 px-4 text-center animate-fade-in shadow-md">
            ✓ {scanNotice}
          </div>
        )}

        {/* POS Body: Left Catalogue & Right Cart Checkout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* LEFT: PRODUCTS CATALOGUE GRID */}
          <div className="flex-1 flex flex-col overflow-hidden p-3 sm:p-4 space-y-3">
            {/* Search and Category Pills */}
            <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search electrical items or SKU..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-orange-500 shadow-2xs"
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-orange-500 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Cards Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-1">
              {filteredProducts.map((p) => {
                const stockOnHand = p.stock[outletId] || 0;
                const minAlert = p.minStockAlert[outletId] || 10;
                const isLow = stockOnHand <= minAlert;
                const isOutOfStock = stockOnHand <= 0;

                return (
                  <div
                    key={p.id}
                    onClick={() => !isOutOfStock && handleAddToCart(p)}
                    className={`bg-white rounded-xl border border-slate-200/90 p-3 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md hover:border-orange-300 group ${
                      isOutOfStock ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''
                    }`}
                  >
                    <div>
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-100 mb-2">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <span
                          className={`absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-black ${
                            isOutOfStock
                              ? 'bg-red-500 text-white'
                              : isLow
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-900/80 text-white'
                          }`}
                        >
                          {stockOnHand} {p.baseUnit}
                        </span>
                      </div>

                      <h4 className="font-bold text-slate-800 text-xs line-clamp-2 leading-snug">
                        {p.name}
                      </h4>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {p.sku} • {p.brand}
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-black text-slate-900">
                          GH₵ {p.retailPrice.toFixed(2)}
                          <span className="text-[10px] text-slate-400 font-normal"> /{p.baseUnit}</span>
                        </div>
                        {selectedCustomer && (selectedCustomer.customerType === 'electrician' || selectedCustomer.customerType === 'contractor') && (
                          <div className="text-[10px] font-bold text-blue-600">
                            Trade: GH₵ {p.tradePrice.toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Selling Units Quick Selector (BR-12) */}
                      {p.sellingUnits && p.sellingUnits.length > 1 && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex gap-1"
                        >
                          {p.sellingUnits.map((u, uIdx) => (
                            <button
                              key={u.name}
                              onClick={() => handleAddToCart(p, uIdx)}
                              className="text-[9px] font-bold bg-slate-100 hover:bg-orange-100 hover:text-orange-700 px-1.5 py-1 rounded border border-slate-200"
                              title={`Add as ${u.name}`}
                            >
                              {u.conversionFactor > 1 ? `${u.conversionFactor}x` : '1x'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile Cart Floating Bar (visible when cart has items on smaller screens) */}
            {cart.length > 0 && !mobileCartDrawerOpen && (
              <div className="lg:hidden p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-xl flex items-center justify-between z-10 shrink-0">
                <div>
                  <div className="text-[11px] font-bold text-slate-500">
                    {cart.reduce((a, b) => a + b.quantity, 0)} items in cart
                  </div>
                  <div className="text-base font-black text-slate-900 font-mono">
                    GH₵ {total.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMobileCartDrawerOpen(true)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    View Cart
                  </button>
                  <button
                    onClick={() => {
                      setMobileCartDrawerOpen(true);
                      setPaymentModalOpen(true);
                    }}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer"
                  >
                    Pay (F2) →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: CART & CHECKOUT DRAWER */}
          <div
            className={`w-full lg:w-[440px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col justify-between shrink-0 shadow-lg ${
              mobileCartDrawerOpen
                ? 'fixed inset-0 z-50 lg:relative lg:inset-auto flex animate-sheet-up'
                : 'hidden lg:flex'
            }`}
          >
            {/* Mobile-only header to close drawer */}
            <div className="lg:hidden flex items-center justify-between p-3.5 border-b border-slate-200 bg-slate-900 text-white">
              <div className="font-black text-sm flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-orange-400" />
                <span>Order Cart ({cart.length} items)</span>
              </div>
              <button
                onClick={() => setMobileCartDrawerOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Lookup & Classification (FR-CUST-03) */}
            <div className="p-3 border-b border-slate-200 bg-slate-50/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-orange-500" />
                  <span>Customer (Trade Discount Auto-Applied)</span>
                </span>
                {selectedCustomer && (
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-[11px] text-red-500 font-bold hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              {selectedCustomer ? (
                <div className="bg-white border border-blue-200 p-2.5 rounded-xl flex items-center justify-between shadow-2xs">
                  <div>
                    <div className="font-bold text-xs text-slate-900">{selectedCustomer.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" /> {selectedCustomer.phone}
                    </div>
                  </div>
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px] px-2 py-0.5 rounded-full capitalize">
                    {selectedCustomer.customerType} (Trade Pricing)
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customerSearchPhone}
                    onChange={(e) => handleCustomerPhoneLookup(e.target.value)}
                    placeholder="Type phone: e.g. 0244567890 (Yaw Mensah)"
                    className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-orange-500 font-mono"
                  />
                </div>
              )}
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 py-12">
                  <ShoppingCart className="w-10 h-10 stroke-[1.5] text-slate-300" />
                  <p className="text-xs font-semibold">Cart is currently empty</p>
                  <p className="text-[11px] text-slate-400">Click any product or scan barcode to begin</p>
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div key={`${item.product.id}-${item.selectedUnit}`} className="pt-2.5 first:pt-0 space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-2">
                        <div className="font-bold text-xs text-slate-900 leading-tight">
                          {item.product.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Unit: <strong>{item.selectedUnit}</strong>
                          {item.floorPriceApproved && (
                            <span className="text-amber-600 font-bold ml-2">✓ Floor PIN Approved</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.product.id, item.selectedUnit)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Quantity + Unit Price Line */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                        <button
                          onClick={() => handleUpdateQuantity(item.product.id, item.selectedUnit, item.quantity - 1)}
                          className="w-6 h-6 rounded bg-white hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700 shadow-2xs"
                        >
                          <Minus className="w-3 h-3" />
                        </button>

                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateQuantity(item.product.id, item.selectedUnit, parseFloat(e.target.value) || 0)
                          }
                          className="w-14 text-center font-black text-xs bg-transparent focus:outline-none"
                        />

                        <button
                          onClick={() => handleUpdateQuantity(item.product.id, item.selectedUnit, item.quantity + 1)}
                          className="w-6 h-6 rounded bg-white hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700 shadow-2xs"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Editable Price per unit with Floor Price Check (BR-10) */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">@ GH₵</span>
                        <input
                          type="number"
                          step="any"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleUpdatePrice(item.product.id, item.selectedUnit, parseFloat(e.target.value) || 0)
                          }
                          className={`w-16 text-right font-bold text-xs border rounded px-1.5 py-0.5 ${
                            item.unitPrice < item.product.floorPrice * item.conversionFactor
                              ? 'border-amber-400 bg-amber-50 text-amber-900 font-black'
                              : 'border-slate-200 bg-white'
                          }`}
                        />
                      </div>

                      <div className="font-black text-slate-900 text-sm">
                        GH₵ {item.lineTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Footer: Subtotal, Total, Hold and Pay (F2) */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/90 space-y-3">
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono font-bold">GH₵ {subtotal.toFixed(2)}</span>
                </div>
                {cartDiscountPercent > 0 && (
                  <div className="flex justify-between text-orange-600 font-bold">
                    <span>Discount ({cartDiscountPercent}%):</span>
                    <span className="font-mono">- GH₵ {discountTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-slate-900 pt-1 border-t border-slate-200">
                  <span>TOTAL DUE:</span>
                  <span className="text-orange-600 font-mono text-xl">GH₵ {total.toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleHoldCart}
                  disabled={cart.length === 0}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>Hold (Park)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(true)}
                  disabled={cart.length === 0}
                  className="flex-[2] py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <DollarSign className="w-4 h-4 stroke-[3]" />
                  <span>PAY (F2) • GH₵ {total.toFixed(2)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PAYMENT MODAL (FR-SALE-10 to FR-SALE-15) */}
      {paymentModalOpen && (
        <div 
          onClick={() => setPaymentModalOpen(false)}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 flex flex-col animate-modal-card"
          >
            <div className="bg-[#1e293b] text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm">Collect Payment</h3>
                <p className="text-[11px] text-slate-300">
                  Total Payable: <strong className="text-orange-400 text-sm">GH₵ {total.toFixed(2)}</strong>
                </p>
              </div>
              <button onClick={() => setPaymentModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Payment Method Tabs */}
            <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs font-bold">
              <button
                onClick={() => setActivePaymentTab('cash')}
                className={`py-3 flex items-center justify-center gap-1.5 transition-colors ${
                  activePaymentTab === 'cash' ? 'bg-white text-orange-600 border-b-2 border-orange-500' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <DollarSign className="w-4 h-4" /> Cash (Cedis)
              </button>
              <button
                onClick={() => setActivePaymentTab('momo')}
                className={`py-3 flex items-center justify-center gap-1.5 transition-colors ${
                  activePaymentTab === 'momo' ? 'bg-white text-orange-600 border-b-2 border-orange-500' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Smartphone className="w-4 h-4" /> Mobile Money
              </button>
              <button
                onClick={() => {
                  setActivePaymentTab('split');
                  setSplitCashAmount(Math.round(total / 2));
                  setSplitMomoAmount(Number((total - Math.round(total / 2)).toFixed(2)));
                }}
                className={`py-3 flex items-center justify-center gap-1.5 transition-colors ${
                  activePaymentTab === 'split' ? 'bg-white text-orange-600 border-b-2 border-orange-500' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Calculator className="w-4 h-4" /> Split Payment
              </button>
            </div>

            {/* Tab 1: CASH */}
            {activePaymentTab === 'cash' && (
              <div className="p-5 space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Cash Tendered (GH₵) *</label>
                  <input
                    type="number"
                    step="any"
                    autoFocus
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    placeholder={`e.g. ${Math.ceil(total / 10) * 10}`}
                    className="w-full text-2xl font-black font-mono border border-slate-300 rounded-xl p-3 text-center"
                  />
                </div>

                {/* Ghana Cedi Quick Denominations */}
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold block mb-1.5">Quick Ghana Cedi Notes:</span>
                  <div className="grid grid-cols-5 gap-2">
                    {[10, 20, 50, 100, 200].map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        onClick={() => setCashTendered(denom.toString())}
                        className="py-2 bg-slate-100 hover:bg-orange-50 hover:text-orange-600 font-black rounded-lg border border-slate-200 text-xs"
                      >
                        GH₵ {denom}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Change Due Display */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between items-center">
                  <span className="font-bold text-slate-700">Change Due to Customer:</span>
                  <span className="text-xl font-black text-emerald-600 font-mono">
                    GH₵ {changeDue.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Tab 2: MOBILE MONEY (FR-SALE-10 to FR-SALE-15) */}
            {activePaymentTab === 'momo' && (
              <div className="p-5 space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Select MoMo Network Provider *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['MTN MoMo', 'Telecel Cash', 'AT Money'] as const).map((prov) => (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => setMomoProvider(prov)}
                        className={`py-2 rounded-lg font-bold border text-xs ${
                          momoProvider === prov
                            ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {prov}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Customer Phone Number</label>
                  <input
                    type="tel"
                    value={momoPhone}
                    onChange={(e) => setMomoPhone(e.target.value)}
                    placeholder="0244123456"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    MoMo Transaction Reference ID (Mandatory) *
                  </label>
                  <input
                    type="text"
                    required
                    value={momoReference}
                    onChange={(e) => setMomoReference(e.target.value)}
                    placeholder="e.g. MM-2026-984210"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Check the transaction ID from customer SMS or drawer phone before confirming.
                  </span>
                </div>

                <label className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 p-3 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={momoVerified}
                    onChange={(e) => setMomoVerified(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span className="font-bold text-emerald-900 text-xs">
                    I verify payment received on the shop phone / merchant terminal
                  </span>
                </label>
              </div>
            )}

            {/* Tab 3: SPLIT PAYMENT */}
            {activePaymentTab === 'split' && (
              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Part 1: Cash Amount (GH₵)</label>
                    <input
                      type="number"
                      step="any"
                      value={splitCashAmount}
                      onChange={(e) => setSplitCashAmount(parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Part 2: MoMo Amount (GH₵)</label>
                    <input
                      type="number"
                      step="any"
                      value={splitMomoAmount}
                      onChange={(e) => setSplitMomoAmount(parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-300 rounded-lg p-2 font-bold text-amber-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">MoMo Transaction Ref ID</label>
                  <input
                    type="text"
                    value={splitMomoRef}
                    onChange={(e) => setSplitMomoRef(e.target.value)}
                    placeholder="Ref ID for the MoMo portion"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between font-bold">
                  <span>Split Sum: GH₵ {(splitCashAmount + splitMomoAmount).toFixed(2)}</span>
                  <span>Required: GH₵ {total.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Payment Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-100 text-xs"
              >
                Back to Cart
              </button>
              <button
                type="button"
                onClick={handleFinalizeSale}
                className="flex-2 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm shadow-md"
              >
                Complete Sale & Issue Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED SALE THERMAL RECEIPT MODAL (PRD §9) */}
      {completedSale && (
        <div 
          onClick={() => setCompletedSale(null)}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-80 flex items-center justify-center p-4 animate-modal-backdrop"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 border border-slate-200 space-y-4 animate-modal-card"
          >
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-1.5 text-emerald-600 font-black text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Sale Completed Successfully</span>
              </div>
              <button onClick={() => setCompletedSale(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PRD §9 Thermal Receipt Form */}
            <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300 font-mono text-xs text-slate-800 space-y-2 select-text">
              {receiptReprint && (
                <div className="text-center font-black text-red-600 border border-red-300 bg-red-50 py-1 tracking-widest text-[11px]">
                  *** REPRINT ***
                </div>
              )}
              <div className="text-center">
                <div className="font-black text-base uppercase">{completedSale.outletName}</div>
                <div className="text-[10px] text-slate-500">
                  {completedSale.outletId === 'inco-hardware' ? '12 Main Street, Koforidua' : 'Harper Road, Kumasi'}
                </div>
                <div className="text-[10px] text-slate-500">
                  Tel: {completedSale.outletId === 'inco-hardware' ? '+233 24 000 0002' : '+233 24 000 0003'}
                </div>
              </div>

              <div className="border-t border-b border-dashed border-slate-300 py-1.5 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Receipt:</span>
                  <span className="font-bold">{completedSale.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{completedSale.createdAt}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cashier:</span>
                  <span>{completedSale.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span>{completedSale.customerName}</span>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1.5 py-1">
                {completedSale.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <div>
                      <div>{it.product.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {it.quantity} {it.selectedUnit} x GH₵ {it.unitPrice.toFixed(2)}
                      </div>
                    </div>
                    <span className="font-bold">GH₵ {it.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>GH₵ {completedSale.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300">
                  <span>TOTAL:</span>
                  <span>GH₵ {completedSale.total.toFixed(2)}</span>
                </div>
                {completedSale.payments.map((p, i) => (
                  <div key={i} className="flex justify-between text-[11px] text-slate-600">
                    <span>Paid via {p.provider || p.method}:</span>
                    <span>GH₵ {p.amount.toFixed(2)}</span>
                  </div>
                ))}
                {completedSale.changeDue > 0 && (
                  <div className="flex justify-between text-[11px] text-emerald-700 font-bold">
                    <span>Change Due:</span>
                    <span>GH₵ {completedSale.changeDue.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="text-center pt-3 text-[10px] text-slate-400">
                Thank you for your business!
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setReceiptReprint(true)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-bold"
              >
                Mark Reprint
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 bg-slate-900 hover:bg-black text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Manager PIN Modal for Floor Price Override (BR-10) */}
      <ManagerPinModal
        isOpen={Boolean(floorOverrideTarget)}
        onClose={() => setFloorOverrideTarget(null)}
        title="Manager Approval: Floor Price Override"
        description="Cashier entered a price below the minimum floor price threshold. Manager authorization PIN required to proceed."
        onSuccess={handleFloorPinSuccess}
      />
    </div>
  );
};
