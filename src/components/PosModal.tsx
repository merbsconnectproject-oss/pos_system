import React, { useState, useEffect, useRef } from 'react';
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
  Package,
  Zap,
  Plug,
  Cable,
  Wrench,
  PaintBucket,
  HardHat,
  Lightbulb,
  AlertTriangle,
  Clock,
  List,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import {
  Product,
  CartItem,
  CompletedSale,
  Outlet,
  PaymentMethod,
  PaymentSplit,
  Customer,
  ShiftInfo,
} from '../types';
import { findByBarcodeOrSku } from '../catalogue';
import type { PermissionSet } from '../permissions';
import { useScanner } from '../useScanner';
import { createBlock, issueReceiptNumber, remainingInBlock } from '../receiptSequence';
import { printReceipt } from '../printService';
import { formatQuantity, lineTotal, moneyEquals, roundMoney, roundQuantity, sumMoney } from '../money';
import { ManagerPinModal } from './ManagerPinModal';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  momo: 'Mobile Money',
  card: 'Card',
  transfer: 'Bank Transfer',
};

interface PosModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  currentOutlet: Outlet;
  customers: Customer[];
  shiftInfo: ShiftInfo;
  onOpenShift: () => void;
  /**
   * FR-CUST-03: saved by the server, which owns the id and decides whether
   * that number already belongs to somebody. The saved record comes back and
   * is what gets attached — a locally invented id would match no customer.
   */
  onAddCustomer: (customer: Customer) => Promise<Customer>;
  /**
   * BR-6: the server issues the receipt number, so this returns the committed
   * sale rather than accepting one. The number is printed and handed over — it
   * has to be the one the database recorded, not one this screen guessed.
   *
   * Resolves to null when the sale was refused; the cart is kept so the cashier
   * can fix it rather than losing what they rang up.
   */
  onSaleCompleted: (sale: CompletedSale) => Promise<CompletedSale | null>;
  permissions: PermissionSet;
  /**
   * FR-POS-10: the largest discount this cashier may give unapproved, as a
   * percentage. The server enforces it too and is the authority; this is so
   * the cashier is told before the customer is, not after.
   */
  discountCeilingPercent: number;
  onLockSession?: () => void;
}

export const PosModal: React.FC<PosModalProps> = ({
  isOpen,
  onClose,
  products,
  currentOutlet,
  customers,
  shiftInfo,
  onOpenShift,
  onAddCustomer,
  onSaleCompleted,
  permissions,
  discountCeilingPercent,
  onLockSession,
}) => {
  const canOversell = permissions.has('stock.oversell');
  const canDiscount = permissions.has('sale.discount');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [catalogueView, setCatalogueView] = useState<'list' | 'grid' | 'table'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchPhone, setCustomerSearchPhone] = useState('');
  const [cartDiscountPercent, setCartDiscountPercent] = useState<number>(0);
  const [discountDraft, setDiscountDraft] = useState('0');
  const [heldCarts, setHeldCarts] = useState<Array<{ label: string; items: CartItem[]; customer: Customer | null; total: number; heldAt: string }>>([]);
  const [holdLabel, setHoldLabel] = useState('');
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [heldDrawerOpen, setHeldDrawerOpen] = useState(false);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [unitPickerProduct, setUnitPickerProduct] = useState<Product | null>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<Customer['customerType'] | ''>('');
  const [inlineNotice, setInlineNotice] = useState<{ type: 'warning' | 'error' | 'success'; title: string; message: string } | null>(null);

  // Payment modal states
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activePaymentTab, setActivePaymentTab] = useState<'cash' | 'momo' | 'card' | 'transfer' | 'split'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  
  // MoMo details
  const [momoProvider, setMomoProvider] = useState<'MTN MoMo' | 'Telecel Cash' | 'AT Money'>('MTN MoMo');
  const [momoPhone, setMomoPhone] = useState('');
  const [momoReference, setMomoReference] = useState('');
  const [momoVerified, setMomoVerified] = useState(false);

  // FR-PAY-04 / C-15: split across two or more methods, with a live remaining balance.
  const [splitParts, setSplitParts] = useState<{ id: string; method: PaymentMethod; amount: number; reference: string }[]>([
    { id: 'split-1', method: 'cash', amount: 0, reference: '' },
    { id: 'split-2', method: 'momo', amount: 0, reference: '' },
  ]);
  const [cardReference, setCardReference] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [externalPaymentVerified, setExternalPaymentVerified] = useState(false);

  // Receipt modal state
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [receiptReprint, setReceiptReprint] = useState(false);
  const [receiptPrintStatus, setReceiptPrintStatus] = useState<'ready' | 'sent' | 'failed'>('ready');
  const [mobileCartDrawerOpen, setMobileCartDrawerOpen] = useState(false);

  // Manager PIN modal state for Floor Price Override (BR-10)
  const [floorOverrideTarget, setFloorOverrideTarget] = useState<{ productId: string; requestedPrice: number } | null>(null);

  // Barcode simulation
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  // FR-POS-05: a rescanned product flashes its existing line rather than adding a second.
  const [flashLineKey, setFlashLineKey] = useState<string | null>(null);
  // C-18 / FR-RCPT-05: a print failure never blocks or reverses a committed sale.
  const [printFailed, setPrintFailed] = useState(false);
  // C-21: an insufficient-stock strip, not a modal — it must not block the counter.
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [receiptBlock, setReceiptBlock] = useState(() =>
    createBlock(currentOutlet.receiptPrefix, shiftInfo.terminalId || '01', 4312),
  );
  const [oversellPrompt, setOversellPrompt] = useState<{
    product: Product;
    unitIndex: number;
    available: number;
    requested: number;
    unitName: string;
  } | null>(null);

  const outletId = currentOutlet.id === 'all-outlets' ? 'inco-hardware' : currentOutlet.id;

  const getProductFallbackIcon = (category: string) => {
    const normalizedCategory = category.toLowerCase();
    if (normalizedCategory.includes('cable') || normalizedCategory.includes('wire')) return Cable;
    if (normalizedCategory.includes('socket') || normalizedCategory.includes('plug')) return Plug;
    if (normalizedCategory.includes('lighting') || normalizedCategory.includes('lamp')) return Lightbulb;
    if (normalizedCategory.includes('tool') || normalizedCategory.includes('hardware')) return Wrench;
    if (normalizedCategory.includes('paint') || normalizedCategory.includes('adhesive')) return PaintBucket;
    if (normalizedCategory.includes('safety') || normalizedCategory.includes('building')) return HardHat;
    if (normalizedCategory.includes('electrical') || normalizedCategory.includes('breaker')) return Zap;
    return Package;
  };

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
  const subtotal = sumMoney(cart.map((item) => item.lineTotal));
  const discountTotal = roundMoney((subtotal * cartDiscountPercent) / 100);
  const total = Math.max(0, roundMoney(subtotal - discountTotal));
  const cashTenderedNum = parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, roundMoney(cashTenderedNum - total));
  const splitTotal = sumMoney(splitParts.map((part) => part.amount));
  const splitRemaining = roundMoney(total - splitTotal);

  // FR-POS-03..06: scanner keystrokes reach the cart wherever focus sits.
  useScanner({
    enabled: isOpen && !paymentModalOpen && !completedSale,
    onScan: (code) => {
      const stocked = products.filter(
        (p) => !p.outletId || p.outletId === 'all-outlets' || p.outletId === outletId,
      );
      const match = findByBarcodeOrSku(stocked, code);
      if (!match) {
        // C-19 / FR-POS-07: an unknown code is an inline strip, never a modal.
        setUnknownBarcode(code);
        return;
      }
      setUnknownBarcode(null);
      const unitIndex = match.product.sellingUnits?.findIndex((unit) => unit.name === match.unitName);
      handleAddToCart(match.product, unitIndex !== undefined && unitIndex >= 0 ? unitIndex : undefined);
    },
  });

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !paymentModalOpen && !completedSale) {
        onClose();
      } else if (e.key === 'F2' && cart.length > 0 && !paymentModalOpen) {
        e.preventDefault();
        setPaymentModalOpen(true);
      } else if (e.key === 'F3' && cart.length > 0 && !paymentModalOpen) {
        e.preventDefault();
        setHoldModalOpen(true);
      } else if (e.key === 'F4' && !paymentModalOpen) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F9' && !paymentModalOpen) {
        e.preventDefault();
        onLockSession?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, cart, paymentModalOpen, completedSale]);

  if (!isOpen) return null;

  // Add product to cart with selling unit support & trade pricing
  const handleAddToCart = (product: Product, unitIndex?: number, options?: { force?: boolean }) => {
    if (unitIndex === undefined && product.sellingUnits && product.sellingUnits.length > 1) {
      setUnitPickerProduct(product);
      return;
    }

    const selectedUnitIndex = unitIndex ?? 0;
    const unit = product.sellingUnits && product.sellingUnits[selectedUnitIndex]
      ? product.sellingUnits[selectedUnitIndex]
      : { name: product.baseUnit, conversionFactor: 1, price: product.retailPrice, tradePrice: product.tradePrice };

    // FR-PRICE-04 · FR-PRICE-05: the customer's level, then their agreed rate.
    const unitPrice = priceFor(product, unit, selectedCustomer);
    const frozenCost = frozenCostFor(product, unit.conversionFactor);

    // BR-9 / FR-POS-13: negative stock is blocked unless the user holds stock.oversell.
    const stockOnHand = product.stock[outletId] || 0;
    const alreadyInCart = cart
      .filter((item) => item.product.id === product.id)
      .reduce((sum, item) => sum + item.quantity * item.conversionFactor, 0);
    const requestedBase = roundQuantity(alreadyInCart + unit.conversionFactor);
    if (requestedBase > stockOnHand && !options?.force) {
      setOversellPrompt({
        product,
        unitIndex: selectedUnitIndex,
        available: stockOnHand,
        requested: requestedBase,
        unitName: unit.name,
      });
      return;
    }

    // FR-POS-05: a rescan increments the existing line and flashes it.
    const lineKey = `${product.id}-${unit.name}`;
    const lineExists = cart.some(
      (item) => item.product.id === product.id && item.selectedUnit === unit.name,
    );
    if (lineExists) {
      setFlashLineKey(lineKey);
      window.setTimeout(() => setFlashLineKey(null), 700);
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.selectedUnit === unit.name);
      if (existing) {
        const newQty = existing.quantity + 1;
        return prev.map((item) =>
          item.product.id === product.id && item.selectedUnit === unit.name
            ? { ...item, quantity: roundQuantity(newQty), lineTotal: lineTotal(newQty, item.unitPrice) }
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
    setUnitPickerProduct(null);
    setTimeout(() => setScanNotice(null), 1500);
  };

  /** C-05: switch a line to a different selling unit, reconverting quantity and price. */
  const handleChangeLineUnit = (productId: string, currentUnitName: string, nextUnitName: string) => {
    setCart((prev) => {
      const line = prev.find((item) => item.product.id === productId && item.selectedUnit === currentUnitName);
      if (!line || currentUnitName === nextUnitName) return prev;
      const product = line.product;
      const nextUnit = product.sellingUnits?.find((unit) => unit.name === nextUnitName);
      const factor = nextUnit?.conversionFactor ?? 1;
      const price = priceFor(product,
        { price: nextUnit?.price, tradePrice: nextUnit?.tradePrice, conversionFactor: factor },
        selectedCustomer);
      const frozenCost = frozenCostFor(product, factor);
      return prev.map((item) =>
        item.product.id === productId && item.selectedUnit === currentUnitName
          ? {
              ...item,
              selectedUnit: nextUnitName,
              conversionFactor: factor,
              unitPrice: price,
              frozenCostPrice: frozenCost,
              lineTotal: lineTotal(item.quantity, price, item.discount),
            }
          : item,
      );
    });
  };

  /**
   * FR-POS-10: a per-line discount, capped by the role's discount ceiling.
   *
   * <p>The cap is a percentage of the line, so it is worked out against this
   * line's gross rather than applied as a flat amount — the same cedi off a
   * bulb and off a distribution board are not the same concession. The server
   * refuses anything past it regardless of what this does.
   */
  const handleLineDiscount = (productId: string, unitName: string, amount: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId || item.selectedUnit !== unitName) return item;
        const gross = roundMoney(item.quantity * item.unitPrice);
        const ceiling = roundMoney((gross * discountCeilingPercent) / 100);
        const capped = Math.min(Math.max(0, roundMoney(amount)), ceiling, gross);
        return { ...item, discount: capped, lineTotal: lineTotal(item.quantity, item.unitPrice, capped) };
      }),
    );
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
            lineTotal: lineTotal(newQty, item.unitPrice),
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
            lineTotal: lineTotal(i.quantity, newPrice),
          };
        }
        return i;
      })
    );
  };

  const handleFloorPinSuccess = (approverName: string, approverId: string) => {
    if (!floorOverrideTarget) return;
    const { productId, requestedPrice } = floorOverrideTarget;

    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          return {
            ...item,
            unitPrice: requestedPrice,
            lineTotal: lineTotal(item.quantity, requestedPrice),
            floorPriceApproved: true,
            floorPriceApprover: approverName,
            floorPriceApproverId: approverId,
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
      // FR-PRICE-04: attaching a customer re-prices what is already rung up.
      // Every line, not only the trade ones — a customer attached by mistake
      // and then removed has to go back to retail too.
      setCart((prev) =>
        prev.map((item) => {
          const price = priceFor(item.product,
            { conversionFactor: item.conversionFactor }, found);
          return { ...item, unitPrice: price, lineTotal: lineTotal(item.quantity, price, item.discount) };
        }),
      );
    }
  };

  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const label = holdLabel.trim() || `Held #${heldCarts.length + 1} (${selectedCustomer?.name || 'Walk-in'})`;
    setHeldCarts([
      ...heldCarts,
      {
        label,
        items: [...cart],
        customer: selectedCustomer,
        total,
        heldAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setCart([]);
    setSelectedCustomer(null);
    setHoldLabel('');
    setHoldModalOpen(false);
    setInlineNotice({
      type: 'success',
      title: 'Sale held',
      message: `${label} is parked and can be resumed from Held Sales.`,
    });
  };

  const handleResumeCart = (index: number) => {
    const selected = heldCarts[index];
    setCart(selected.items);
    setSelectedCustomer(selected.customer);
    setHeldCarts(heldCarts.filter((_, i) => i !== index));
    setHeldDrawerOpen(false);
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;
    const clean = barcodeInput.trim();
    const stocked = products.filter(
      (p) => !p.outletId || p.outletId === 'all-outlets' || p.outletId === outletId
    );
    const match = findByBarcodeOrSku(stocked, clean);
    if (match) {
      // FR-PROD-04: the scanned code names a unit, so a carton code adds a full carton.
      const unitIndex = match.product.sellingUnits?.findIndex((unit) => unit.name === match.unitName);
      handleAddToCart(match.product, unitIndex !== undefined && unitIndex >= 0 ? unitIndex : undefined);
      setBarcodeInput('');
    } else {
      const otherStoreProd = findByBarcodeOrSku(products, clean)?.product;
      if (otherStoreProd) {
        const otherStoreName =
          otherStoreProd.outletId === 'inco-hardware'
            ? 'Inco Hardware'
            : otherStoreProd.outletId === 'radiance-lighting'
            ? 'Radiance Lighting'
            : 'Apex Electricals';
        setInlineNotice({
          type: 'warning',
          title: 'Barcode belongs to another outlet',
          message: `${otherStoreProd.name} belongs to ${otherStoreName}, not ${currentOutlet.name}.`,
        });
      } else {
        setInlineNotice({
          type: 'warning',
          title: 'Unknown barcode',
          message: `No product found for barcode or SKU "${clean}". Search manually or assign it to a product from the catalogue.`,
        });
      }
    }
  };

  const handleApplyDiscount = () => {
    // FR-POS-10: the configured ceiling for this role, not a literal.
    const nextDiscount = Math.min(discountCeilingPercent, Math.max(0, Number(discountDraft) || 0));
    setCartDiscountPercent(nextDiscount);
    setDiscountModalOpen(false);
  };

  /**
   * FR-PRICE-04: which price level this customer buys at.
   *
   * <p>The server decides it from the customer type and sends it on the
   * record. This screen used to test `type === 'electrician' || 'contractor'`
   * in three separate places — which quietly charged a **company** retail,
   * because that case was never in the list.
   */
  const priceLevel = (customer: Customer | null): 'RETAIL' | 'TRADE' => {
    if (!customer) return 'RETAIL';
    if (customer.priceLevel) return customer.priceLevel;
    // Only reached for a customer created in this tab before the save returns.
    return customer.customerType === 'retail' ? 'RETAIL' : 'TRADE';
  };

  /**
   * FR-PRICE-04 · FR-PRICE-05: the price this customer pays for this unit.
   *
   * <p>The level first, then their agreed rate on top. The server allows a
   * discount up to that rate without counting it against the cashier's own
   * ceiling, so the two have to agree about what the rate means.
   */
  const priceFor = (
    product: Product,
    unit: { price?: number; tradePrice?: number; conversionFactor: number },
    customer: Customer | null,
  ) => {
    const base = priceLevel(customer) === 'TRADE'
      ? unit.tradePrice ?? product.tradePrice * unit.conversionFactor
      : unit.price ?? product.retailPrice * unit.conversionFactor;

    const rate = customer?.discountRate ?? 0;
    return rate > 0 ? roundMoney(base * (1 - rate / 100)) : base;
  };

  /**
   * BR-5: what this line cost, frozen.
   *
   * <p>Zero when nothing was recorded — stock adjusted in rather than
   * received has no cost, and 70% of retail was a guess that looked precise
   * on a profit report.
   */
  const frozenCostFor = (product: Product, factor: number) =>
    (product.costPrice[outletId] ?? 0) * factor;

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return;

    setCustomerSaving(true);
    setCustomerError(null);
    try {
      // The id is the server's. Attaching a locally minted one would put a
      // customer on the sale that no later screen can look up.
      const saved = await onAddCustomer({
        id: '',
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        customerType: newCustomerType || 'retail',
        totalPurchased: 0,
        salesCount: 0,
      });
      setSelectedCustomer(saved);
      setCustomerSearchPhone(saved.phone);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerType('retail');
      setCustomerModalOpen(false);
    } catch (failure) {
      // FR-CUST-03: most often this is the number already belonging to
      // somebody, and the server says who.
      setCustomerError(failure instanceof Error ? failure.message : 'That customer could not be saved.');
    } finally {
      setCustomerSaving(false);
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
        setInlineNotice({ type: 'error', title: 'Reference required', message: 'Enter the MoMo transaction reference before completing the sale.' });
        return;
      }
      if (!momoVerified) {
        setInlineNotice({ type: 'error', title: 'Confirm receipt', message: 'Confirm the payment SMS on the shop phone before completing the sale.' });
        return;
      }
      payments.push({
        method: 'momo',
        amount: total,
        provider: momoProvider,
        reference: momoReference,
        verified: true,
      });
    } else if (activePaymentTab === 'card') {
      if (!cardReference.trim() || !externalPaymentVerified) {
        setInlineNotice({ type: 'error', title: 'Card details required', message: 'Enter the card reference and confirm the funds were received.' });
        return;
      }
      payments.push({
        method: 'card',
        amount: total,
        provider: 'Visa/Mastercard',
        reference: cardReference,
        verified: true,
      });
    } else if (activePaymentTab === 'transfer') {
      if (!transferReference.trim() || !externalPaymentVerified) {
        setInlineNotice({ type: 'error', title: 'Transfer details required', message: 'Enter the transfer reference and confirm the funds were received.' });
        return;
      }
      payments.push({
        method: 'transfer',
        amount: total,
        provider: 'Bank Transfer',
        reference: transferReference,
        verified: true,
      });
    } else if (activePaymentTab === 'split') {
      const funded = splitParts.filter((part) => part.amount > 0);
      if (!moneyEquals(splitTotal, total)) {
        setInlineNotice({
          type: 'error',
          title: 'Split does not balance',
          message: `Parts total ${formatMoney(splitTotal)} against ${formatMoney(total)} due. ${
            splitRemaining > 0
              ? `${formatMoney(splitRemaining)} still to allocate.`
              : `${formatMoney(-splitRemaining)} over.`
          }`,
        });
        return;
      }
      // FR-PAY-03: non-cash parts need a reference and an explicit confirmation.
      const missingRef = funded.find((part) => part.method !== 'cash' && !part.reference.trim());
      if (missingRef) {
        setInlineNotice({
          type: 'error',
          title: 'Reference required',
          message: `Enter the reference for the ${PAYMENT_METHOD_LABELS[missingRef.method]} part before completing.`,
        });
        return;
      }
      funded.forEach((part) => {
        payments.push({
          method: part.method,
          amount: part.amount,
          provider: part.method === 'momo' ? momoProvider : undefined,
          reference: part.method === 'cash' ? undefined : part.reference.trim(),
          verified: part.method !== 'cash' ? true : undefined,
        });
      });
    }

    // BR-6 is the server's: it holds the terminal's block under a row lock, so
    // two tills cannot issue the same number. What is built here is the request;
    // the receipt number on it is a placeholder until the server answers.
    const sale: CompletedSale = {
      id: crypto.randomUUID(),
      receiptNumber: '',
      outletId,
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

    // FR-RCPT-01: the sale is committed before any print is attempted — and
    // now genuinely so, because nothing is shown until the server has it.
    setCommitting(true);
    void onSaleCompleted(sale).then((committed) => {
      setCommitting(false);
      // Refused: the cart is left exactly as it was so the cashier can correct
      // the price or the payment instead of ringing it all up again.
      if (!committed) return;

      setCompletedSale(committed);
      setReceiptPrintStatus('ready');
      setReceiptReprint(false);
      setPrintFailed(false);

      // FR-RCPT-05: a print failure surfaces a retry; it never reverses the sale.
      void printReceipt({
        receiptNumber: committed.receiptNumber,
        paperWidth: '80mm',
        payload: committed.receiptNumber,
      }).then((result) => {
        if (!result.ok) setPrintFailed(true);
      });
      setPaymentModalOpen(false);
      setCart([]);
      setSelectedCustomer(null);
      setCashTendered('');
      setMomoReference('');
      setMomoVerified(false);
      setCardReference('');
      setTransferReference('');
      setExternalPaymentVerified(false);
    });
  };

  const filteredProducts = products.filter((p) => {
    const matchesOutlet = !p.outletId || p.outletId === 'all-outlets' || p.outletId === outletId;
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcodes.some((entry) => entry.code.includes(searchQuery));
    return matchesOutlet && matchesCat && matchesSearch && p.active;
  });
  const searchResults = searchQuery.trim() ? filteredProducts.slice(0, 6) : [];

  const formatMoney = (amount: number) => `GH₵ ${amount.toFixed(2)}`;
  const receiptPaymentTotal =
    completedSale?.payments.reduce((sum, payment) => sum + payment.amount, 0) || 0;
  const receiptCashRendered = completedSale
    ? receiptPaymentTotal + completedSale.changeDue
    : 0;
  const receiptChangeReturned = completedSale
    ? Math.max(0, receiptCashRendered - completedSale.total)
    : 0;
  const receiptPaymentLabel =
    completedSale?.payments.map((payment) => payment.provider || payment.method).join(' + ') ||
    'Cash';

  if (!shiftInfo.isOpen) {
    return (
      <div className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-modal-backdrop">
        <div className="bg-white rounded-2xl w-full max-w-xl border border-slate-200 shadow-2xl p-8 text-center animate-modal-card">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-6">Open a shift to begin selling</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            POS is blocked until the cashier records an opening float for this terminal.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-3 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onOpenShift}
              className="py-3 rounded-xl bg-accent-500 text-white text-sm font-black hover:bg-accent-600"
            >
              Open shift
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-modal-backdrop">
      <div className="bg-slate-100 rounded-xl w-full max-w-[1550px] h-[95vh] flex flex-col overflow-hidden shadow-2xl border border-slate-300 animate-modal-card">
        {/* POS Top Bar */}
        <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-accent-500 text-white p-1.5 rounded-lg font-black text-xs tracking-wider">
              POS
            </div>
            <div>
              <div className="font-black text-sm flex items-center gap-2">
                <span>{currentOutlet.name}</span>
                <span className="text-[11px] font-semibold text-accent-400 bg-white/10 px-2 py-0.5 rounded-md">
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
            <Barcode className="w-4 h-4 text-accent-400" />
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan barcode or type SKU..."
              className="text-xs bg-transparent text-white placeholder-slate-400 focus:outline-none w-48 font-mono"
            />
            <button type="submit" className="text-[10px] bg-accent-500 hover:bg-accent-600 text-white font-bold px-2 py-0.5 rounded">
              Enter
            </button>
          </form>

          <div className="flex items-center gap-2">
            {heldCarts.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setHeldDrawerOpen(true)}
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

        {/* C-21: insufficient stock — reduce, or sell anyway with stock.oversell */}
        {oversellPrompt && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            <div className="font-bold">
              Only {formatQuantity(oversellPrompt.available)} {oversellPrompt.product.baseUnit} of{' '}
              {oversellPrompt.product.name} at {currentOutlet.name}.
              <span className="ml-1 font-semibold">
                This adds {formatQuantity(oversellPrompt.requested)}.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOversellPrompt(null)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-800"
              >
                Reduce quantity
              </button>
              {canOversell && (
                <button
                  type="button"
                  onClick={() => {
                    const prompt = oversellPrompt;
                    setOversellPrompt(null);
                    handleAddToCart(prompt.product, prompt.unitIndex, { force: true });
                  }}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white"
                  title="Recorded as a flagged movement on the exceptions report (BR-9)"
                >
                  Sell anyway
                </button>
              )}
            </div>
          </div>
        )}

        {/* C-19: scanned code not in the catalogue */}
        {unknownBarcode && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            <div className="font-bold">
              No product matches barcode <span className="font-mono">{unknownBarcode}</span>.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery(unknownBarcode);
                  setUnknownBarcode(null);
                  searchInputRef.current?.focus();
                }}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-800"
              >
                Search manually
              </button>
              <button
                type="button"
                onClick={() => setUnknownBarcode(null)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-800"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Scan Toast Notice */}
        {scanNotice && (
          <div className="bg-emerald-600 text-white text-xs font-bold py-1.5 px-4 text-center animate-fade-in shadow-md">
            ✓ {scanNotice}
          </div>
        )}

        {inlineNotice && (
          <div
            className={`text-xs font-bold py-2 px-4 flex items-center justify-between gap-3 border-b ${
              inlineNotice.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : inlineNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-900 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{inlineNotice.title}: {inlineNotice.message}</span>
            </div>
            <button type="button" onClick={() => setInlineNotice(null)} className="p-1 rounded hover:bg-white/60">
              <X className="w-4 h-4" />
            </button>
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
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search electrical items or SKU..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-accent-500 shadow-2xs"
                />
                {searchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-9 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-2">
                    {searchResults.length > 0 ? (
                      searchResults.map((product) => {
                        const stock = product.stock[outletId] || 0;
                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => {
                              handleAddToCart(product);
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-left"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 truncate">{product.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {product.sku} • {product.baseUnit} • {formatMoney(product.retailPrice)}
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
                              {stock} {product.baseUnit}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center">
                        <div className="text-xs font-black text-slate-800">No product matches</div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                          }}
                          className="mt-2 text-xs font-bold text-accent-600 hover:underline"
                        >
                          Create product from catalogue
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

            {/* Category Pills */}
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-accent-500 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                </div>
                <div className="flex shrink-0 rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Catalogue view">
                  <button type="button" aria-pressed={catalogueView === 'list'} onClick={() => setCatalogueView('list')} className={`rounded-md p-1.5 ${catalogueView === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`} title="List view"><List className="h-4 w-4" /></button>
                  <button type="button" aria-pressed={catalogueView === 'grid'} onClick={() => setCatalogueView('grid')} className={`rounded-md p-1.5 ${catalogueView === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`} title="Grid view"><LayoutGrid className="h-4 w-4" /></button>
                  <button type="button" aria-pressed={catalogueView === 'table'} onClick={() => setCatalogueView('table')} className={`rounded-md p-1.5 ${catalogueView === 'table' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`} title="Table view"><Rows3 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>

            {/* Product catalogue: list is the default for fast, legible terminal scanning. */}
            <div className={`flex-1 overflow-y-auto pr-1 ${catalogueView === 'list' ? 'space-y-2' : catalogueView === 'table' ? 'space-y-1' : 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr'}`}>
              {filteredProducts.map((p) => {
                const stockOnHand = p.stock[outletId] || 0;
                const minAlert = p.minStockAlert[outletId] || 10;
                const isLow = stockOnHand <= minAlert;
                const isOutOfStock = stockOnHand <= 0;
                const FallbackIcon = getProductFallbackIcon(p.category);
                const hasImage = Boolean(p.imageUrl && p.imageUrl.trim());

                return (
                  <div
                    key={p.id}
                    onClick={() => handleAddToCart(p)}
                    className={`bg-white rounded-xl border border-slate-200 p-3 flex cursor-pointer transition-all hover:shadow-sm hover:border-slate-300 group ${catalogueView === 'list' || catalogueView === 'table' ? 'flex-row items-center gap-4 min-h-0' : 'flex-col justify-between min-h-[252px]'} ${
                      isOutOfStock ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''
                    }`}
                  >
                    <div className={`space-y-3 ${catalogueView === 'list' || catalogueView === 'table' ? 'flex min-w-0 flex-1 items-center gap-4 space-y-0' : ''}`}>
                      <div className={`relative rounded overflow-hidden bg-[#F1F5F9] border border-slate-200 ${catalogueView === 'list' ? 'h-16 w-20 shrink-0' : catalogueView === 'table' ? 'hidden' : 'aspect-[4/3]'}`}>
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                          <FallbackIcon className="w-6 h-6 stroke-[1.75]" />
                        </div>
                        {hasImage && (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                            className="relative z-10 w-full h-full object-cover rounded group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        )}
                        <span
                          className={`absolute z-20 top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-sm ${
                            isOutOfStock
                              ? 'bg-rose-50/95 text-rose-700 border-rose-200'
                              : isLow
                              ? 'bg-amber-50/95 text-amber-700 border-amber-200'
                              : 'bg-slate-100/95 text-slate-700 border-slate-200'
                          }`}
                        >
                          {stockOnHand} {p.baseUnit}
                        </span>
                      </div>

                      <h4 className={`${catalogueView === 'list' ? 'text-base font-black text-slate-900 min-h-0' : catalogueView === 'table' ? 'text-sm font-bold text-slate-900 min-h-0' : 'text-xs font-medium text-slate-700 min-h-[2rem]'} line-clamp-2 leading-snug`}>
                        {p.name}
                      </h4>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {p.sku} • {p.brand}
                      </div>
                    </div>

                    <div className={`${catalogueView === 'list' || catalogueView === 'table' ? 'mt-0 pt-0 border-0' : 'mt-4 pt-3 border-t border-slate-100'} flex items-end justify-between gap-3`}>
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          GH₵ {p.retailPrice.toFixed(2)}
                          <span className="text-[10px] text-slate-400 font-normal"> / {p.baseUnit}</span>
                        </div>
                        {selectedCustomer && (selectedCustomer.customerType === 'electrician' || selectedCustomer.customerType === 'contractor') && (
                          <div className="text-[10px] font-bold text-slate-500">
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
                              className="text-[9px] font-bold bg-slate-100 hover:bg-accent-50 hover:text-accent-700 px-1.5 py-1 rounded border border-slate-200"
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
              <div className="lg:hidden p-3 bg-white/95 backdrop-blur-md border-t border-slate-300 shadow-xl flex items-center justify-between z-10 shrink-0">
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
                    className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer"
                  >
                    Pay (F2) →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: CART & CHECKOUT DRAWER */}
          <div
            className={`w-full lg:w-[440px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col justify-between shrink-0 shadow-xl ${
              mobileCartDrawerOpen
                ? 'fixed inset-0 z-50 lg:relative lg:inset-auto flex animate-sheet-up'
                : 'hidden lg:flex'
            }`}
          >
            {/* Mobile-only header to close drawer */}
            <div className="lg:hidden flex items-center justify-between p-3.5 border-b border-slate-300 bg-slate-900 text-white">
              <div className="font-black text-sm flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-accent-400" />
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
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-accent-500" />
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
                {!selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(true)}
                    className="text-[11px] text-accent-600 font-bold hover:underline"
                  >
                    Attach / create
                  </button>
                )}
              </div>

              {selectedCustomer ? (
                <div className="bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between shadow-2xs gap-3">
                  <div>
                    <div className="font-bold text-xs text-slate-900">{selectedCustomer.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" /> {selectedCustomer.phone}
                    </div>
                  </div>
                  <span className="bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0">
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
                    className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-accent-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                  >
                    Find
                  </button>
                </div>
              )}
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center text-slate-400 py-16 px-8">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-4">
                    <ShoppingCart className="w-8 h-8 stroke-[1.5] text-slate-400" />
                  </div>
                  <p className="text-xs font-bold tracking-wide text-slate-600">Cart is currently empty</p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed max-w-[220px]">
                    Click any product or scan a barcode to begin checkout.
                  </p>
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div
                    key={`${item.product.id}-${item.selectedUnit}`}
                    className={`pt-3 first:pt-0 space-y-2.5 rounded-lg transition-colors duration-300 ${
                      flashLineKey === `${item.product.id}-${item.selectedUnit}`
                        ? 'bg-emerald-100/70'
                        : ''
                    }`}
                  >
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
                              : 'border-slate-300 bg-white'
                          }`}
                        />
                      </div>

                      <div className="font-black text-slate-900 text-sm">
                        GH₵ {item.lineTotal.toFixed(2)}
                      </div>
                    </div>

                    {/* C-05: unit switch and line discount */}
                    <div className="flex flex-wrap items-center gap-2 pl-0.5">
                      {item.product.sellingUnits && item.product.sellingUnits.length > 1 && (
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                          Unit
                          <select
                            value={item.selectedUnit}
                            onChange={(event) =>
                              handleChangeLineUnit(item.product.id, item.selectedUnit, event.target.value)
                            }
                            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-700"
                          >
                            {item.product.sellingUnits.map((unit) => (
                              <option key={unit.name} value={unit.name}>
                                {unit.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {canDiscount && (
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                          Less GH₵
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.discount || ''}
                            placeholder="0.00"
                            onChange={(event) =>
                              handleLineDiscount(
                                item.product.id,
                                item.selectedUnit,
                                parseFloat(event.target.value) || 0,
                              )
                            }
                            className="w-14 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right text-[11px] font-bold text-slate-700"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Footer: Subtotal, Total, Hold and Pay (F2) */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/90 space-y-4">
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono font-bold">GH₵ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountDraft(String(cartDiscountPercent));
                      setDiscountModalOpen(true);
                    }}
                    className="text-accent-600 font-bold hover:underline"
                  >
                    Discount
                  </button>
                  <span className="font-mono font-bold">{cartDiscountPercent}%</span>
                </div>
                {cartDiscountPercent > 0 && (
                  <div className="flex justify-between text-accent-600 font-bold">
                    <span>Discount ({cartDiscountPercent}%):</span>
                    <span className="font-mono">- GH₵ {discountTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-slate-900 pt-1 border-t border-slate-300">
                  <span>TOTAL DUE:</span>
                  <span className="text-accent-600 font-mono text-xl">GH₵ {total.toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setHoldModalOpen(true)}
                  disabled={cart.length === 0}
                  className="py-3 rounded-xl border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>Hold (Park)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(true)}
                  disabled={cart.length === 0}
                  className="py-3 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <DollarSign className="w-4 h-4 stroke-[3]" />
                  <span>Pay (F2)</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCart([]);
                  setSelectedCustomer(null);
                  setCartDiscountPercent(0);
                }}
                disabled={cart.length === 0}
                className="w-full py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              >
                Clear cart
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PAYMENT MODAL (FR-SALE-10 to FR-SALE-15) */}
      {paymentModalOpen && (
        <div 
          onClick={() => setPaymentModalOpen(false)}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-70 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-300 flex flex-col max-h-[92vh] animate-modal-card"
          >
            <div className="bg-slate-900 text-white px-6 py-5 sm:px-8 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-xl leading-tight">Collect Payment</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Total Payable: <strong className="text-accent-400 text-sm font-black">GH₵ {total.toFixed(2)}</strong>
                </p>
              </div>
              <button 
                onClick={() => setPaymentModalOpen(false)} 
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Payment Method Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-slate-300 bg-slate-50 text-xs font-bold shrink-0">
              <button
                onClick={() => setActivePaymentTab('cash')}
                className={`py-3.5 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  activePaymentTab === 'cash' ? 'bg-white text-accent-600 border-b-2 border-accent-500 font-black' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <DollarSign className="w-4 h-4" /> Cash (Cedis)
              </button>
              <button
                onClick={() => setActivePaymentTab('momo')}
                className={`py-3.5 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  activePaymentTab === 'momo' ? 'bg-white text-accent-600 border-b-2 border-accent-500 font-black' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Smartphone className="w-4 h-4" /> Mobile Money
              </button>
              <button
                onClick={() => {
                  setActivePaymentTab('card');
                  setExternalPaymentVerified(false);
                }}
                className={`py-3.5 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  activePaymentTab === 'card' ? 'bg-white text-accent-600 border-b-2 border-accent-500 font-black' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CreditCard className="w-4 h-4" /> Card
              </button>
              <button
                onClick={() => {
                  setActivePaymentTab('transfer');
                  setExternalPaymentVerified(false);
                }}
                className={`py-3.5 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  activePaymentTab === 'transfer' ? 'bg-white text-accent-600 border-b-2 border-accent-500 font-black' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Building2 className="w-4 h-4" /> Transfer
              </button>
              <button
                onClick={() => {
                  setActivePaymentTab('split');
                  // Seed with the whole amount on cash; the cashier reallocates from there.
                  setSplitParts([
                    { id: 'split-1', method: 'cash', amount: total, reference: '' },
                    { id: 'split-2', method: 'momo', amount: 0, reference: '' },
                  ]);
                }}
                className={`py-3.5 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  activePaymentTab === 'split' ? 'bg-white text-accent-600 border-b-2 border-accent-500 font-black' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Calculator className="w-4 h-4" /> Split Payment
              </button>
            </div>

            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              {/* Tab 1: CASH */}
              {activePaymentTab === 'cash' && (
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-bold text-slate-800 block mb-2">Cash Tendered (GH₵) *</label>
                    <input
                      type="number"
                      step="any"
                      autoFocus
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder={`e.g. ${Math.ceil(total / 10) * 10}`}
                      className="w-full text-3xl font-black font-mono border border-slate-300 rounded-lg p-3.5 text-center text-slate-900 focus:outline-accent-500"
                    />
                  </div>

                  {/* Ghana Cedi Quick Denominations */}
                  <div>
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-2">Quick Ghana Cedi Notes:</span>
                    <div className="grid grid-cols-5 gap-2.5">
                      {[10, 20, 50, 100, 200].map((denom) => (
                        <button
                          key={denom}
                          type="button"
                          onClick={() => setCashTendered(denom.toString())}
                          className="py-3 bg-slate-100 hover:bg-accent-50 hover:text-accent-600 hover:border-accent-300 font-black rounded-lg border border-slate-300 text-sm cursor-pointer transition-colors"
                        >
                          GH₵ {denom}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Change Due Display */}
                  <div className="bg-slate-50 border border-slate-300 rounded-xl p-5 flex justify-between items-center">
                    <span className="font-bold text-slate-700 text-base">Change Due to Customer:</span>
                    <span className="text-2xl font-black text-emerald-600 font-mono">
                      GH₵ {changeDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Tab 2: MOBILE MONEY (FR-SALE-10 to FR-SALE-15) */}
              {activePaymentTab === 'momo' && (
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-bold text-slate-800 block mb-2">Select MoMo Network Provider *</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['MTN MoMo', 'Telecel Cash', 'AT Money'] as const).map((prov) => (
                        <button
                          key={prov}
                          type="button"
                          onClick={() => setMomoProvider(prov)}
                          className={`py-3 rounded-lg font-bold border text-sm cursor-pointer transition-all ${
                            momoProvider === prov
                              ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {prov}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-slate-800 block mb-1.5">Customer Phone Number</label>
                    <input
                      type="tel"
                      value={momoPhone}
                      onChange={(e) => setMomoPhone(e.target.value)}
                      placeholder="0244123456"
                      className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono focus:outline-accent-500"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-bold text-slate-800 block mb-1.5">
                      MoMo Transaction Reference ID (Mandatory) *
                    </label>
                    <input
                      type="text"
                      required
                      value={momoReference}
                      onChange={(e) => setMomoReference(e.target.value)}
                      placeholder="e.g. MM-2026-984210"
                      className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono uppercase focus:outline-accent-500"
                    />
                    <span className="text-xs text-slate-400 mt-1.5 block">
                      Verify transaction ID from the shop phone / merchant SMS before proceeding.
                    </span>
                  </div>

                  <label className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-4 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={momoVerified}
                      onChange={(e) => setMomoVerified(e.target.checked)}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-emerald-900 text-sm">
                      I verify payment confirmation received on the shop phone / merchant terminal
                    </span>
                  </label>
                </div>
              )}

              {/* Tab 3: CARD */}
              {activePaymentTab === 'card' && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-slate-50 border border-slate-300 p-5 flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-base">Amount Due</span>
                    <span className="text-2xl font-black text-slate-900 font-mono">{formatMoney(total)}</span>
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-800 block mb-1.5">Card Terminal Reference *</label>
                    <input
                      type="text"
                      value={cardReference}
                      onChange={(e) => setCardReference(e.target.value)}
                      placeholder="e.g. CARD-984210"
                      className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono uppercase focus:outline-accent-500"
                    />
                  </div>
                  <label className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-4 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={externalPaymentVerified}
                      onChange={(e) => setExternalPaymentVerified(e.target.checked)}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-emerald-900 text-sm">
                      I confirm the card terminal approved this payment
                    </span>
                  </label>
                </div>
              )}

              {/* Tab 4: BANK TRANSFER */}
              {activePaymentTab === 'transfer' && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-slate-50 border border-slate-300 p-5 flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-base">Amount Due</span>
                    <span className="text-2xl font-black text-slate-900 font-mono">{formatMoney(total)}</span>
                  </div>
                  <div>
                    <label className="text-sm font-bold text-slate-800 block mb-1.5">Bank Transfer Reference *</label>
                    <input
                      type="text"
                      value={transferReference}
                      onChange={(e) => setTransferReference(e.target.value)}
                      placeholder="e.g. TRF-2026-984210"
                      className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-mono uppercase focus:outline-accent-500"
                    />
                  </div>
                  <label className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-4 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={externalPaymentVerified}
                      onChange={(e) => setExternalPaymentVerified(e.target.checked)}
                      className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-emerald-900 text-sm">
                      I confirm the bank transfer has been received
                    </span>
                  </label>
                </div>
              )}

              {/* Tab 5: SPLIT PAYMENT */}
              {activePaymentTab === 'split' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {splitParts.map((part, index) => (
                      <div key={part.id} className="rounded-xl border border-slate-300 bg-white p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Part {index + 1}
                          </span>
                          {splitParts.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setSplitParts((prev) => prev.filter((item) => item.id !== part.id))}
                              className="text-xs font-bold text-rose-600 hover:text-rose-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="text-xs font-bold text-slate-700">
                            Method
                            <select
                              value={part.method}
                              onChange={(event) =>
                                setSplitParts((prev) =>
                                  prev.map((item) =>
                                    item.id === part.id
                                      ? { ...item, method: event.target.value as PaymentMethod }
                                      : item,
                                  ),
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900"
                            >
                              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
                                <option key={method} value={method}>
                                  {PAYMENT_METHOD_LABELS[method]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs font-bold text-slate-700">
                            Amount (GH₵)
                            <div className="mt-1 flex gap-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={part.amount || ''}
                                onChange={(event) =>
                                  setSplitParts((prev) =>
                                    prev.map((item) =>
                                      item.id === part.id
                                        ? { ...item, amount: roundMoney(parseFloat(event.target.value) || 0) }
                                        : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900"
                              />
                              <button
                                type="button"
                                title="Allocate the remaining balance to this part"
                                onClick={() =>
                                  setSplitParts((prev) =>
                                    prev.map((item) =>
                                      item.id === part.id
                                        ? { ...item, amount: roundMoney(Math.max(0, item.amount + splitRemaining)) }
                                        : item,
                                    ),
                                  )
                                }
                                className="shrink-0 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                              >
                                Rest
                              </button>
                            </div>
                          </label>
                        </div>
                        {part.method !== 'cash' && (
                          <label className="block text-xs font-bold text-slate-700">
                            {PAYMENT_METHOD_LABELS[part.method]} reference
                            <input
                              type="text"
                              value={part.reference}
                              onChange={(event) =>
                                setSplitParts((prev) =>
                                  prev.map((item) =>
                                    item.id === part.id ? { ...item, reference: event.target.value } : item,
                                  ),
                                )
                              }
                              placeholder="Transaction reference"
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm"
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setSplitParts((prev) => [
                        ...prev,
                        {
                          id: `split-${Date.now()}`,
                          method: 'card',
                          amount: roundMoney(Math.max(0, splitRemaining)),
                          reference: '',
                        },
                      ])
                    }
                    className="w-full rounded-lg border border-dashed border-slate-400 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    + Add another method
                  </button>

                  {/* Live remaining balance — the sale cannot complete until this is zero (FR-PAY-05) */}
                  <div
                    className={`flex items-center justify-between rounded-xl border p-4 text-sm font-bold ${
                      moneyEquals(splitTotal, total)
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-amber-300 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <span>
                      Allocated <strong>{formatMoney(splitTotal)}</strong> of {formatMoney(total)}
                    </span>
                    <span>
                      {moneyEquals(splitTotal, total)
                        ? 'Balanced'
                        : splitRemaining > 0
                        ? `${formatMoney(splitRemaining)} remaining`
                        : `${formatMoney(-splitRemaining)} over`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Modal Footer */}
            <div className="p-5 sm:px-8 border-t border-slate-300 bg-slate-50 flex flex-col sm:flex-row gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="sm:w-1/3 py-3 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-100 text-sm cursor-pointer transition-colors"
              >
                Back to Cart
              </button>
              <button
                type="button"
                onClick={handleFinalizeSale}
                className="sm:w-2/3 py-3 rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-black text-sm shadow-md cursor-pointer transition-colors"
              >
                Complete Sale &amp; Issue Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNIT PICKER (C-04) */}
      {unitPickerProduct && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-300 shadow-2xl p-6 space-y-5 animate-modal-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">Choose selling unit</h3>
                <p className="text-xs text-slate-500 mt-1">{unitPickerProduct.name}</p>
              </div>
              <button type="button" onClick={() => setUnitPickerProduct(null)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid gap-3">
              {(unitPickerProduct.sellingUnits || []).map((unit, idx) => (
                <button
                  key={unit.name}
                  type="button"
                  onClick={() => handleAddToCart(unitPickerProduct, idx)}
                  className="p-4 rounded-xl border border-slate-300 hover:border-accent-300 hover:bg-accent-50/30 text-left flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-black text-slate-900">{unit.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Converts to {unit.conversionFactor} {unitPickerProduct.baseUnit}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-900">{formatMoney(unit.price)}</div>
                    <div className="text-[11px] text-slate-400">each</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DISCOUNT ENTRY (C-06) */}
      {discountModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl w-full max-w-md border border-slate-300 shadow-2xl p-6 space-y-5 animate-modal-card">
            <div>
              <h3 className="text-lg font-black text-slate-900">Apply cart discount</h3>
              <p className="text-xs text-slate-500 mt-1">
                {discountCeilingPercent > 0
                  ? `You may give up to ${discountCeilingPercent}% without approval.`
                  : 'Your role may not give a discount without approval.'}
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">Discount percent</label>
              <div className="relative">
                <Percent className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="number"
                  value={discountDraft}
                  onChange={(e) => setDiscountDraft(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-lg font-black text-slate-900 focus:outline-accent-500"
                  min="0"
                  max="25"
                />
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Current subtotal</span>
                <span className="font-bold text-slate-900">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Resulting total</span>
                <span className="font-black text-slate-900">
                  {formatMoney(Math.max(0, subtotal - (subtotal * (Number(discountDraft) || 0)) / 100))}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setDiscountModalOpen(false)} className="py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={handleApplyDiscount} className="py-3 rounded-xl bg-accent-500 text-white font-black text-sm hover:bg-accent-600">
                Apply discount
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ATTACH / QUICK CREATE CUSTOMER (C-09, C-10) */}
      {customerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl w-full max-w-2xl border border-slate-300 shadow-2xl overflow-hidden animate-modal-card">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Attach customer</h3>
                <p className="text-xs text-slate-500 mt-1">Search by phone or create a counter customer with two fields.</p>
              </div>
              <button type="button" onClick={() => setCustomerModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700">Phone search</label>
                <input
                  type="text"
                  value={customerSearchPhone}
                  onChange={(e) => handleCustomerPhoneLookup(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-accent-500"
                  placeholder="0244567890"
                />
                <div className="space-y-2">
                  {customers
                    .filter((customer) => !customerSearchPhone || customer.phone.includes(customerSearchPhone))
                    .slice(0, 5)
                    .map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setCustomerSearchPhone(customer.phone);
                          setCustomerModalOpen(false);
                        }}
                        className="w-full p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-left flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-bold text-slate-900">{customer.name}</div>
                          <div className="text-xs text-slate-500">{customer.phone}</div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5 capitalize">
                          {customer.customerType}
                        </span>
                      </button>
                    ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerModalOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                >
                  Continue as walk-in
                </button>
              </div>
              <form onSubmit={handleQuickCreateCustomer} className="space-y-3">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Quick create</div>
                {customerError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
                    {customerError}
                  </div>
                )}
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-accent-500"
                  placeholder="Customer name"
                  required
                />
                <input
                  type="text"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-accent-500"
                  placeholder="Phone number"
                  required
                />
                <select
                  value={newCustomerType}
                  onChange={(e) => setNewCustomerType(e.target.value as Customer['customerType'])}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-accent-500"
                >
                  <option value="retail">Retail</option>
                  <option value="electrician">Electrician</option>
                  <option value="contractor">Contractor</option>
                  <option value="company">Company</option>
                </select>
                <button
                  type="submit"
                  disabled={customerSaving}
                  className="w-full py-3 rounded-xl bg-accent-500 disabled:opacity-50 text-white font-black text-sm hover:bg-accent-600"
                >
                  {customerSaving ? 'Saving…' : 'Create and attach'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* HOLD SALE (C-23) */}
      {holdModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-70 flex items-center justify-center p-4 animate-modal-backdrop">
          <div className="bg-white rounded-2xl w-full max-w-md border border-slate-300 shadow-2xl p-6 space-y-5 animate-modal-card">
            <div>
              <h3 className="text-lg font-black text-slate-900">Hold sale</h3>
              <p className="text-xs text-slate-500 mt-1">Park this cart without reserving stock.</p>
            </div>
            <input
              type="text"
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-accent-500"
              placeholder={`Held #${heldCarts.length + 1} (${selectedCustomer?.name || 'Walk-in'})`}
            />
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs flex justify-between">
              <span className="text-slate-500">{cart.length} lines</span>
              <span className="font-black text-slate-900">{formatMoney(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setHoldModalOpen(false)} className="py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={handleHoldCart} className="py-3 rounded-xl bg-accent-500 text-white font-black text-sm hover:bg-accent-600">
                Hold sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HELD SALES DRAWER (C-22) */}
      {heldDrawerOpen && (
        <div className="fixed inset-0 z-70 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-modal-backdrop">
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-300 animate-drawer-right flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Held sales</h3>
                <p className="text-xs text-slate-500 mt-1">Resume or delete parked carts.</p>
              </div>
              <button type="button" onClick={() => setHeldDrawerOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {heldCarts.map((held, idx) => (
                <div key={`${held.label}-${idx}`} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900">{held.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {held.items.length} lines • {formatMoney(held.total)} • {held.heldAt}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                      Parked
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => handleResumeCart(idx)} className="py-2.5 rounded-xl bg-accent-500 text-white text-xs font-black hover:bg-accent-600">
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeldCarts((prev) => prev.filter((_, i) => i !== idx))}
                      className="py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {heldCarts.length === 0 && <div className="text-sm text-slate-500 text-center py-12">No held sales.</div>}
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED SALE DIGITAL RECEIPT MODAL (PRD §9) */}
      {completedSale && (
        <div 
          onClick={() => setCompletedSale(null)}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-80 flex items-center justify-center p-4 sm:p-6 animate-modal-backdrop"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl w-full max-w-lg shadow-2xl p-6 sm:p-8 border border-slate-300 space-y-5 animate-modal-card flex flex-col max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-900">Sale complete</h3>
                <p className="text-xs text-slate-500 mt-0.5">Receipt {completedSale.receiptNumber} is ready to hand over</p>
              </div>
              <button onClick={() => setCompletedSale(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {printFailed && (
              <div className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <p className="text-xs font-black text-amber-900">Sale saved. Receipt did not print.</p>
                <p className="mt-1 text-[11px] text-amber-800">
                  Receipt {completedSale.receiptNumber} is committed and stock is decremented. Printing can be
                  retried at any time.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintFailed(false)}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Retry print
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintFailed(false)}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800"
                  >
                    Continue without printing
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Change due</div>
              <div className="mt-1 text-4xl font-black tracking-tight text-slate-900">
                {formatMoney(receiptChangeReturned)}
              </div>
              <div
                className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black ${
                  receiptPrintStatus === 'failed'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : receiptPrintStatus === 'sent'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                {receiptPrintStatus === 'failed'
                  ? 'Print failed. Reprint when printer is ready.'
                  : receiptPrintStatus === 'sent'
                  ? 'Receipt sent to printer'
                  : 'Receipt ready to print'}
              </div>
            </div>

            {/* PRD §9 Digital Receipt Form */}
            <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] text-slate-800 space-y-0 select-text">
              {/* Header Block */}
              <section className="pb-5">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wide">Sale Completed Successfully</span>
                  </div>
                  {receiptReprint && (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700">
                      Reprint
                    </span>
                  )}
                </div>

                <div className="pt-5 text-center">
                  <div className="text-lg font-black uppercase tracking-wide text-slate-900">
                    {completedSale.outletName}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {currentOutlet.address}
                  </div>
                  <div className="text-xs text-slate-500">
                    Tel: {currentOutlet.phone}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Receipt No</span>
                    <span className="font-semibold text-slate-700">{completedSale.receiptNumber}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Date</span>
                    <span className="font-semibold text-slate-700">{completedSale.createdAt}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Cashier</span>
                    <span className="font-semibold text-slate-700">{completedSale.cashierName}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Customer</span>
                    <span className="font-semibold text-slate-700">{completedSale.customerName}</span>
                  </div>
                </div>
              </section>

              {/* Itemized Table Block */}
              <section className="border-t border-[#F1F5F9] py-5">
                <div className="grid grid-cols-[1fr_92px_96px] gap-3 pb-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  <span>Product / Specs</span>
                  <span className="text-right">Qty / Price</span>
                  <span className="text-right">Line Total</span>
                </div>
                <div className="space-y-4">
                  {completedSale.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_92px_96px] gap-3 items-start text-xs">
                      <div>
                        <div className="font-medium leading-snug text-slate-700">{it.product.name}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          SKU {it.product.sku} • {it.selectedUnit}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-slate-500">
                        <div className="font-semibold text-slate-600">{it.quantity} {it.selectedUnit}</div>
                        <div>{formatMoney(it.unitPrice)} each</div>
                      </div>
                      <div className="text-right font-bold text-slate-900">
                        {formatMoney(it.lineTotal)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Financial Summary Block */}
              <section className="border-t border-[#F1F5F9] py-5 space-y-3">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-slate-900">{formatMoney(completedSale.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>VAT / Taxes</span>
                  <span className="font-bold text-slate-900">{formatMoney(0)}</span>
                </div>
                {completedSale.discountTotal > 0 && (
                  <div className="flex justify-between text-xs font-bold text-accent-700">
                    <span>Discount</span>
                    <span>- {formatMoney(completedSale.discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between items-end rounded-xl bg-slate-50 border border-slate-200 px-4 py-4">
                  <span className="text-sm font-black uppercase tracking-wide text-slate-900">Total</span>
                  <span className="text-2xl font-black tracking-tight text-slate-900">
                    {formatMoney(completedSale.total)}
                  </span>
                </div>
              </section>

              {/* Payment Details Block */}
              <section className="border-t border-[#F1F5F9] pt-5 space-y-3">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Payment Method</span>
                  <span className="font-bold capitalize text-slate-900">{receiptPaymentLabel}</span>
                </div>
                {completedSale.payments.map((payment, i) => (
                  <div key={`${payment.method}-${i}`} className="flex justify-between text-xs text-slate-600">
                    <span>Paid via {payment.provider || payment.method}</span>
                    <span className="font-bold text-slate-900">{formatMoney(payment.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Cash Rendered</span>
                  <span className="font-bold text-slate-900">{formatMoney(receiptCashRendered)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-900">
                  <span>Change Returned</span>
                  <span>{formatMoney(receiptChangeReturned)}</span>
                </div>
                <p className="pt-3 text-center text-xs text-slate-400">Thank you for your business.</p>
              </section>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1 shrink-0">
              <button
                onClick={() => setCompletedSale(null)}
                className="sm:w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-lg text-sm font-bold cursor-pointer transition-colors"
              >
                New Sale
              </button>
              <button
                onClick={() => setCompletedSale(null)}
                className="sm:w-1/3 bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 py-3 rounded-lg text-sm font-bold cursor-pointer transition-colors"
              >
                Email / Skip
              </button>
              <button
                onClick={() => {
                  setReceiptReprint(true);
                  try {
                    window.print();
                    setReceiptPrintStatus('sent');
                  } catch {
                    setReceiptPrintStatus('failed');
                  }
                }}
                className="sm:w-1/3 bg-slate-900 hover:bg-black text-white py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
              >
                <Printer className="w-5 h-5" />
                <span>{receiptPrintStatus === 'ready' ? 'Print' : 'Reprint'}</span>
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
        permission="sale.approve_below_floor"
        onSuccess={handleFloorPinSuccess}
      />
    </div>
  );
};
