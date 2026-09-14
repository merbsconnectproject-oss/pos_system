import { useCallback, useState, useEffect, useRef, type FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, Home, LockKeyhole, RotateCcw, ServerCrash, ShieldCheck, WifiOff } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { PosModal } from './components/PosModal';
import { ProductsView } from './components/ProductsView';
import { InventoryView } from './components/InventoryView';
import { ShiftsModal } from './components/ShiftsModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { GoodsReceiptModal } from './components/GoodsReceiptModal';
import { StockAdjustmentModal } from './components/StockAdjustmentModal';
import { StockMovementsView } from './components/StockMovementsView';
import { SalesHistoryView } from './components/SalesHistoryView';
import { OutletComparisonView } from './components/OutletComparisonView';
import { CustomersView } from './components/CustomersView';
import { SuppliersView } from './components/SuppliersView';
import { AuditLogView } from './components/AuditLogView';
import { SettingsView } from './components/SettingsView';
import { ExpensesAccountingView } from './components/ExpensesAccountingView';
import { InstallmentsView } from './components/InstallmentsView';
import { ReturnsExchangesView } from './components/ReturnsExchangesView';
import { AnalyticsReportsView } from './components/AnalyticsReportsView';
import { CashControlView } from './components/CashControlView';
import { GoodsReceiptView } from './components/GoodsReceiptView';
import { ReportsView } from './components/ReportsView';
import { AuthView } from './components/AuthView';
import {
  OUTLETS,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_SALES,
  INITIAL_MOVEMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_USERS,
  INITIAL_ROLES_PERMISSIONS,
  INITIAL_SETTINGS,
  INITIAL_SHIFT_RECORDS,
  INITIAL_EXPENSES,
  INITIAL_INSTALLMENT_PLANS,
  INITIAL_RETURNS_EXCHANGES,
} from './mockData';
import {
  Outlet,
  OutletId,
  Product,
  Customer,
  Supplier,
  CompletedSale,
  StockMovement,
  AuditLogEntry,
  ShiftInfo,
  UserAccount,
  CashMovement,
  PaymentMethod,
  RolePermissions,
  ShiftRecord,
  GeneralSettings,
  Expense,
  CustomerInstallmentPlan,
  ReturnExchangeRecord,
} from './types';
import { canAccessTab, resolvePermissions } from './permissions';
import { roundMoney } from './money';
import { DEFAULT_ACCENT, applyAccent } from './accent';
import { authApi, AuthApiError, onSessionSignal, type AuthSession } from './authApi';
import { outletsApi } from './outletsApi';
import { auditApi } from './auditApi';
import { productsApi } from './productsApi';

/**
 * Outlets now come from the API, so a session's outlet id *is* the app's outlet
 * id. The name-and-prefix matching this used to do existed only to bridge
 * server outlets onto the seeded mock list, and matching on a display name was
 * never safe — two branches may share one.
 */
const localOutletId = (session: AuthSession, outlets: Outlet[]): OutletId =>
  session.activeOutlet?.id
  || outlets.find((outlet) => outlet.id !== 'all-outlets')?.id
  || outlets[0]?.id;

const accountFromSession = (session: AuthSession, outlets: Outlet[]): UserAccount => {
  const role = session.roles.find((value) => ['owner', 'manager', 'cashier', 'storekeeper'].includes(value)) || 'cashier';
  const allServerOutlets = [session.activeOutlet, ...session.outletChoices]
    .filter((outlet): outlet is NonNullable<AuthSession['activeOutlet']> => outlet !== null)
    .filter((outlet, index, list) => list.findIndex((candidate) => candidate.id === outlet.id) === index)
    .map((outlet) => ({ ...outlet, localId: outlet.id }));
  return {
    id: session.userId,
    fullName: session.fullName,
    username: session.username,
    email: '',
    phone: '',
    role,
    outletId: session.mustChooseOutlet || session.outletChoices.length > 1
      ? 'all-outlets'
      : localOutletId(session, outlets),
    active: true,
    pinCode: '',
    effectivePermissions: session.permissions,
    serverOutlets: allServerOutlets,
    lastLogin: new Date().toLocaleString('en-GB'),
  };
};

export default function App() {
  const [outlets, setOutlets] = useState<Outlet[]>(OUTLETS);
  const [currentOutletId, setCurrentOutletId] = useState<OutletId>(OUTLETS[0]?.id);

  // Authenticated session (null until a staff member signs in)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionLockReason, setSessionLockReason] = useState<'manual' | 'expired' | null>(null);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [appErrorReference, setAppErrorReference] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [posOpen, setPosOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const mainScrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
        return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  /**
   * Everything the app needs before a dashboard can be truthful.
   *
   * Used by both ways in — resuming an existing session on load, and signing
   * in — because they need exactly the same data. Only the mount path used to
   * fetch, so signing in left the seeded lists in place and the dashboard
   * showed mock figures until the next reload.
   *
   * The user is set last, on purpose: `!currentUser` is what gates the whole
   * app, so setting it before the data arrives renders a dashboard against
   * whatever state happens to be there.
   */
  const loadWorkspace = useCallback(async (session: AuthSession) => {
    // Settled, not `all`: a catalogue that fails to load is a poorer screen,
    // not a reason to throw away a valid session and send the user back to
    // sign-in. Each result is applied on its own merits.
    const [branches, catalogue] = await Promise.allSettled([outletsApi.list(), productsApi.list()]);

    const outletList = branches.status === 'fulfilled' && branches.value.length > 0
      ? branches.value
      : OUTLETS;
    if (branches.status === 'fulfilled' && branches.value.length > 0) setOutlets(branches.value);

    // An empty catalogue is a legitimate answer — a new installation has none.
    if (catalogue.status === 'fulfilled') setProducts(catalogue.value);

    setCurrentOutletId(localOutletId(session, outletList));
    setCurrentUser(accountFromSession(session, outletList));
  }, []);

  useEffect(() => {
    let active = true;
    authApi.current()
      .then((session) => { if (active) return loadWorkspace(session); })
      .catch((failure) => {
        // 401 is the ordinary answer for a browser that is not signed in.
        if (active && !(failure instanceof AuthApiError && failure.status === 401)) {
          setAppErrorReference(`AUTH-${Date.now().toString().slice(-6)}`);
        }
      })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, [loadWorkspace]);

  // Core entities state
  // Deliberately empty, not INITIAL_PRODUCTS: seeding state with mock data
  // makes "not loaded yet" indistinguishable from "this is your catalogue",
  // which is how a stale dashboard survived a sign-in unnoticed.
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [sales, setSales] = useState<CompletedSale[]>(INITIAL_SALES);
  const [movements, setMovements] = useState<StockMovement[]>(INITIAL_MOVEMENTS);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>(INITIAL_SHIFT_RECORDS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  // Radiance Lighting & Accounting Modules state
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [installmentPlans, setInstallmentPlans] = useState<CustomerInstallmentPlan[]>(INITIAL_INSTALLMENT_PLANS);
  const [returnsExchanges, setReturnsExchanges] = useState<ReturnExchangeRecord[]>(INITIAL_RETURNS_EXCHANGES);

  // Settings, Users & RBAC state
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_USERS);
  const [rolesPermissions, setRolesPermissions] = useState<RolePermissions[]>(INITIAL_ROLES_PERMISSIONS);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(INITIAL_SETTINGS);

  // Shift & Cash Drawer state (PRD BR-14)
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo>({
    id: 'shift-demo-001',
    outletId: currentOutletId,
    terminalId: '01',
    isOpen: true,
    openedAt: '08:00 AM',
    cashier: 'Kwame A. (Admin)',
    openingFloat: 200,
    expectedCash: 650,
  });

  // Modals state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [goodsReceiptModalOpen, setGoodsReceiptModalOpen] = useState(false);
  const [adjustmentTargetProduct, setAdjustmentTargetProduct] = useState<Product | null>(null);

  // Appearance accent color state (Counter Datasheet default: #c55200)
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT);

  const currentOutlet = outlets.find((o) => o.id === currentOutletId) || outlets[0];
  const roleBaseline = rolesPermissions.find((item) => item.role === currentUser?.role)?.permissions;
  const permissions = resolvePermissions(
    currentUser?.effectivePermissions || roleBaseline || [],
    currentUser?.effectivePermissions ? undefined : currentUser?.permissionOverrides,
  );
  const can = permissions.has;
  const handleSelectOutlet = (outletId: OutletId) => {
    // FR-OUT-05/06: only outlet.view_all may leave the assigned branch.
    if (!currentUser) return;
    if (!can('outlet.view_all') && outletId !== currentUser.outletId) return;
    if (currentUser.outletId !== 'all-outlets' && outletId !== currentUser.outletId) return;
    const serverOutlet = currentUser.serverOutlets?.find((outlet) => outlet.localId === outletId);
    if (!serverOutlet) {
      setCurrentOutletId(outletId);
      return;
    }
    void authApi.selectOutlet(serverOutlet.id).then((session) => {
      setCurrentOutletId(localOutletId(session, outlets));
      setCurrentUser(accountFromSession(session, outlets));
    }).catch(() => setAppErrorReference(`AUTH-${Date.now().toString().slice(-6)}`));
  };
  const validTabs = new Set([
    'dashboard',
    'outlet-comparison',
    'analytics',
    'cash-control',
    'reports',
    'products',
    'products-import',
    'products-setup',
    'products-bulk-price',
    'inventory',
    'inventory-low-stock',
    'inventory-valuation',
    'inventory-exceptions',
    'inventory-count',
    'inventory-transfer',
    'goods-receipt',
    'stock-movements',
    'sales-history',
    'customers',
    'suppliers',
    'audit-log',
    'expenses',
    'installments',
    'returns-exchanges',
    'settings',
    'server-error',
    'denied',
  ]);

  // L-09: a tab the user cannot reach is not rendered at all.
  const hasTabAccess = (tab: string) => (currentUser ? canAccessTab(permissions, tab) : true);

  useEffect(() => {
    if (currentUser && activeTab !== 'denied' && validTabs.has(activeTab) && !hasTabAccess(activeTab)) setActiveTab('denied');
  }, [activeTab, currentUser, rolesPermissions, permissions.codes.join(',')]);

  useEffect(() => {
    if (currentUser && currentUser && !can('pos.sell')) setPosOpen(false);
  }, [currentUser, permissions.codes.join(',')]);

  // FR-SET-03/04: one call repaints every accent surface; semantics stay fixed.
  useEffect(() => {
    document.documentElement.style.setProperty('--primary-accent', accentColor);
    applyAccent(accentColor);
  }, [accentColor]);

  useEffect(() => {
    const handleUnhandledError = () => {
      setAppErrorReference(`ERR-${Date.now().toString().slice(-6)}`);
      setActiveTab('server-error');
    };
    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledError);
    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledError);
    };
  }, []);

  // Global ⌘K keyboard shortcut listener
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === 'F2' && currentUser && can('pos.sell')) {
        e.preventDefault();
        setPosOpen(true);
      } else if (e.key === 'F4' && currentUser && (permissions.hasAny('shift.open', 'shift.close'))) {
        e.preventDefault();
        setShiftModalOpen(true);
      } else if (e.key === 'F9' && currentUser) {
        e.preventDefault();
        setSessionLockReason('manual');
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setSettingsOpen(false);
        setShiftModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [currentUser, permissions.codes.join(',')]);

  useEffect(() => {
    if (!currentUser || sessionLockReason) return;
    // FR-AUTH-05 / K-08: the idle lock period is configurable, not a constant.
    const idleTimeoutMs = Math.max(1, generalSettings.thresholds.idleLockMinutes) * 60 * 1000;
    let timeoutId = window.setTimeout(() => {
      handleLockSession('expired');
    }, idleTimeoutMs);

    const resetIdleTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        handleLockSession('expired');
      }, idleTimeoutMs);
    };

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('click', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
    };
  }, [currentUser, sessionLockReason, currentOutlet.name, generalSettings.thresholds.idleLockMinutes]);

  // PRD BR-1 & BR-2: Sale Completed handler
  const handleSaleCompleted = (sale: CompletedSale) => {
    setSales((prev) => [sale, ...prev]);

    // 1. Decrement stock for the specific outlet (BR-1)
    setProducts((prev) =>
      prev.map((p) => {
        const soldItems = sale.items.filter((it) => it.product.id === p.id);
        if (soldItems.length > 0) {
          const totalDeduction = soldItems.reduce((acc, it) => acc + (it.quantity * it.conversionFactor), 0);
          const currentStock = p.stock[sale.outletId] || 0;
          return {
            ...p,
            stock: {
              ...p.stock,
              [sale.outletId]: Math.max(0, Number((currentStock - totalDeduction).toFixed(3))),
            },
            salesCount: p.salesCount + soldItems.length,
          };
        }
        return p;
      })
    );

    // 2. Create immutable movement rows (BR-2)
    const newMovements: StockMovement[] = sale.items.map((it) => {
      const prevStock = it.product.stock[sale.outletId] || 0;
      const baseQty = it.quantity * it.conversionFactor;
      return {
        id: `mvt-${Date.now()}-${it.product.id}`,
        timestamp: sale.createdAt,
        outletId: sale.outletId,
        productId: it.product.id,
        productName: it.product.name,
        type: 'SALE',
        quantity: -baseQty,
        previousStock: prevStock,
        newStock: Math.max(0, Number((prevStock - baseQty).toFixed(3))),
        referenceNumber: sale.receiptNumber,
        reason: `POS sale to ${sale.customerName}`,
        user: sale.cashierName,
      };
    });
    setMovements((prev) => [...newMovements, ...prev]);

    // 3. Update customer stats
    if (sale.customerId) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === sale.customerId
            ? {
                ...c,
                totalPurchased: c.totalPurchased + sale.total,
                salesCount: c.salesCount + 1,
              }
            : c
        )
      );
    }

    // 4. Update expected cash in drawer if cash was tendered
    const cashPaid = sale.payments
      .filter((p) => p.method === 'cash')
      .reduce((sum, p) => sum + p.amount, 0);

    if (cashPaid > 0) {
      setShiftInfo((prev) => ({
        ...prev,
        expectedCash: prev.expectedCash + cashPaid,
      }));
    }

    // 5. Append audit log
    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: sale.createdAt,
      actor: sale.cashierName,
      action: 'SALE_COMPLETED',
      entity: `Receipt ${sale.receiptNumber}`,
      outletName: sale.outletName,
      details: `Completed sale of GH₵ ${sale.total.toFixed(2)} to ${sale.customerName} via ${sale.payments.map((p) => p.provider || p.method).join(', ')}`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  // PRD BR-3: Void Sale handler
  const handleVoidSale = (
    saleId: string,
    reason: string,
    approver: string,
    reversingMovements: StockMovement[]
  ) => {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return;

    // 1. Mark sale as VOIDED
    setSales((prev) =>
      prev.map((s) => (s.id === saleId ? { ...s, status: 'VOIDED' as const } : s))
    );

    // 2. Return stock to the outlet
    setProducts((prev) =>
      prev.map((p) => {
        const matchingMovement = reversingMovements.find((m) => m.productId === p.id);
        if (matchingMovement) {
          const currentStock = p.stock[sale.outletId] || 0;
          return {
            ...p,
            stock: {
              ...p.stock,
              [sale.outletId]: Number((currentStock + matchingMovement.quantity).toFixed(3)),
            },
          };
        }
        return p;
      })
    );

    // 3. Append reversing movements (BR-3)
    setMovements((prev) => [...reversingMovements, ...prev]);

    // 4. Adjust cash drawer if cash sale
    const cashPortion = sale.payments
      .filter((p) => p.method === 'cash')
      .reduce((sum, p) => sum + p.amount, 0);

    if (cashPortion > 0) {
      setShiftInfo((prev) => ({
        ...prev,
        expectedCash: Math.max(0, prev.expectedCash - cashPortion),
      }));
    }

    // 5. Audit Log entry
    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actor: approver,
      action: 'SALE_VOID',
      entity: `Receipt ${sale.receiptNumber}`,
      outletName: sale.outletName,
      details: `Voided sale. Reason: ${reason}`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  // Radiance Lighting: Accounting & Expense Handlers
  const handleAddExpense = (newExpense: Expense) => {
    setExpenses((prev) => [newExpense, ...prev]);
    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actor: newExpense.recordedBy,
      action: 'EXPENSE_RECORDED',
      entity: newExpense.referenceNumber || newExpense.title,
      outletName: newExpense.outletName,
      details: `Logged operational expense: ${newExpense.title} (${newExpense.category}) - GH₵ ${newExpense.amount.toFixed(2)}`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  const handleDeleteExpense = (expenseId: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
  };

  // Radiance Lighting: Customer Installment Plans Handlers
  const handleAddInstallmentPlan = (newPlan: CustomerInstallmentPlan) => {
    setInstallmentPlans((prev) => [newPlan, ...prev]);
    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actor: 'Ama Serwaa',
      action: 'INSTALLMENT_CREATED',
      entity: newPlan.planNumber,
      outletName: newPlan.outletName,
      details: `Created customer installment plan for ${newPlan.customerName}. Total: GH₵ ${newPlan.totalAmount.toFixed(2)}, Down: GH₵ ${newPlan.downPayment.toFixed(2)}`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  const handleUpdateInstallmentPlan = (updatedPlan: CustomerInstallmentPlan) => {
    setInstallmentPlans((prev) =>
      prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p))
    );
  };

  // Radiance Lighting: Goods Return and Swap (Exchange) Handler
  const handleAddReturnRecord = (
    record: ReturnExchangeRecord,
    stockAdjustments: Array<{ productId: string; quantityDelta: number; reason: string }>
  ) => {
    setReturnsExchanges((prev) => [record, ...prev]);

    // Adjust physical inventory in products
    setProducts((prev) =>
      prev.map((p) => {
        const adj = stockAdjustments.find((a) => a.productId === p.id);
        if (adj) {
          const currentStock = p.stock[record.outletId] || 0;
          return {
            ...p,
            stock: {
              ...p.stock,
              [record.outletId]: Math.max(0, Number((currentStock + adj.quantityDelta).toFixed(3))),
            },
          };
        }
        return p;
      })
    );

    // Append Stock Movements (CUSTOMER_RETURN & EXCHANGE_SWAP)
    const newMovements: StockMovement[] = stockAdjustments.map((adj) => {
      const prod = products.find((p) => p.id === adj.productId);
      const prevStock = prod?.stock[record.outletId] || 0;
      const updatedStock = Math.max(0, Number((prevStock + adj.quantityDelta).toFixed(3)));
      return {
        id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        productId: adj.productId,
        productName: prod ? prod.name : 'Fixture Item',
        outletId: record.outletId,
        type: adj.quantityDelta > 0 ? ('CUSTOMER_RETURN' as const) : ('EXCHANGE_SWAP' as const),
        quantity: Math.abs(adj.quantityDelta),
        previousStock: prevStock,
        newStock: updatedStock,
        referenceNumber: record.referenceNumber,
        timestamp: record.timestamp,
        user: record.cashierName,
        reason: adj.reason,
      };
    });
    setMovements((prev) => [...newMovements, ...prev]);

    // Audit log
    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actor: record.cashierName,
      action: record.type === 'EXCHANGE_SWAP' ? 'EXCHANGE_SWAP' : 'RETURN_REFUND',
      entity: record.referenceNumber,
      outletName: record.outletName,
      details: `${record.type === 'EXCHANGE_SWAP' ? 'Merchandise Swap' : 'Goods Return'} for ${record.customerName} on receipt ${record.originalReceiptNumber}. Net: GH₵ ${record.netDifference.toFixed(2)}`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  // PRD BR-4: Goods Receipt with Weighted Average Cost handler
  /** Posts every line of a goods receipt as one document (FR-SUP-04). */
  const handleCommitReceipt = (
    lines: { productId: string; quantityBase: number; unitCost: number; newAvgCost: number; movement: StockMovement }[],
    reference: string,
  ) => {
    setProducts((prev) =>
      prev.map((product) => {
        const line = lines.find((item) => item.productId === product.id);
        if (!line) return product;
        const outletKey = line.movement.outletId;
        return {
          ...product,
          stock: { ...product.stock, [outletKey]: (product.stock[outletKey] || 0) + line.quantityBase },
          costPrice: { ...product.costPrice, [outletKey]: line.newAvgCost },
        };
      }),
    );
    setMovements((prev) => [...lines.map((line) => line.movement), ...prev]);
    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toLocaleString('en-GB'),
        actor: currentUser?.fullName || 'Storekeeper',
        action: 'GOODS_RECEIPT',
        entity: reference,
        outletName: currentOutlet.name,
        details: `Posted ${lines.length} line${lines.length === 1 ? '' : 's'}; weighted average cost recalculated per line (BR-4).`,
      },
      ...prev,
    ]);
  };

  const handleConfirmReceipt = (
    productId: string,
    qtyReceived: number,
    _unitCost: number,
    newWeightedAvgCost: number,
    movement: StockMovement
  ) => {
    const outletKey = movement.outletId;

    // 1. Update product stock and weighted average cost for this outlet
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const prevStock = p.stock[outletKey] || 0;
          return {
            ...p,
            stock: {
              ...p.stock,
              [outletKey]: prevStock + qtyReceived,
            },
            costPrice: {
              ...p.costPrice,
              [outletKey]: newWeightedAvgCost,
            },
          };
        }
        return p;
      })
    );

    // 2. Append movement
    setMovements((prev) => [movement, ...prev]);

    // 3. Append audit log
    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: movement.timestamp,
      actor: movement.user,
      action: 'GOODS_RECEIPT',
      entity: `${movement.productName} (${movement.referenceNumber})`,
      outletName: currentOutlet.name,
      details: `Received ${qtyReceived} units. Weighted avg cost recomputed to GH₵ ${newWeightedAvgCost.toFixed(2)} (BR-4)`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  // PRD FR-STK-07: Stock Adjustment handler
  const handleConfirmAdjustment = (
    productId: string,
    newStock: number,
    movement: StockMovement
  ) => {
    const outletKey = movement.outletId;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          return {
            ...p,
            stock: {
              ...p.stock,
              [outletKey]: newStock,
            },
          };
        }
        return p;
      })
    );

    setMovements((prev) => [movement, ...prev]);

    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: movement.timestamp,
      actor: movement.user,
      action: 'STOCK_ADJUSTMENT',
      entity: `${movement.productName}`,
      outletName: currentOutlet.name,
      details: `Physical count adjustment to ${newStock}. ${movement.reason}`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  // PRD BR-17: Toggle Product Active/Inactive (No destructive deletion)
  const handleToggleActive = (productId: string) => {
    const current = products.find((p) => p.id === productId);
    if (!current) return;
    void productsApi.setActive(productId, !current.active)
      .then((saved) => setProducts((prev) => prev.map((p) => (p.id === productId ? merged(p, saved) : p))))
      .catch(reportProductFailure);
  };

  /**
   * FR-PROD-01: the catalogue is the server's.
   *
   * State follows the response, so a generated SKU or a trimmed name shows the
   * stored value, and a rejection — duplicate SKU, duplicate barcode, no
   * permission — leaves the list alone instead of showing a product that was
   * never saved.
   */
  const handleAddProduct = (newProd: Product) => {
    void productsApi.create(newProd)
      .then((saved) => setProducts((prev) => [merged(newProd, saved), ...prev]))
      .catch(reportProductFailure);
  };

  /**
   * Carry the per-outlet figures across the round trip.
   *
   * Stock, cost and reorder level are F's and the API does not store them yet.
   * Keeping whatever the form captured means the screen still shows what the
   * user typed this session, while everything the server does own comes back
   * from the server. They are lost on reload, which is honest — nothing has
   * recorded them.
   */
  const merged = (local: Product, saved: Product): Product => ({
    ...saved,
    costPrice: local.costPrice,
    stock: local.stock,
    minStockAlert: local.minStockAlert,
    salesCount: local.salesCount,
  });

  const reportProductFailure = (failure: unknown) => {
    if (failure instanceof AuthApiError && failure.status !== 401 && failure.status !== 423) {
      alert(failure.message);
      return;
    }
    if (!(failure instanceof AuthApiError)) setAppErrorReference(`PRD-${Date.now().toString().slice(-6)}`);
  };

  const handleAddCustomer = (customer: Customer) => {
    setCustomers((prev) => [customer, ...prev]);
  };

  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    setCustomers((prev) =>
      prev.map((customer) => (customer.id === updatedCustomer.id ? updatedCustomer : customer))
    );
    appendAuditLog({
      actor: currentUser?.fullName || 'System',
      action: 'CUSTOMER_UPDATED',
      entity: `${updatedCustomer.name} (${updatedCustomer.phone})`,
      outletName: currentOutlet.name,
      details: 'Customer profile or price-level mapping was updated.',
    });
  };

  const handleAddSupplier = (supplier: Supplier) => {
    setSuppliers((prev) => [supplier, ...prev]);
  };

  const handleUpdateSupplier = (updatedSupplier: Supplier) => {
    setSuppliers((prev) =>
      prev.map((supplier) => (supplier.id === updatedSupplier.id ? updatedSupplier : supplier))
    );
    appendAuditLog({
      actor: currentUser?.fullName || 'System',
      action: 'SUPPLIER_UPDATED',
      entity: `${updatedSupplier.name} (${updatedSupplier.phone})`,
      outletName: currentOutlet.name,
      details: 'Supplier profile, payment terms or outlet assignment was updated.',
    });
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    // No appendAuditLog here any more: the server records PRODUCT_UPDATED with
    // the before and after itself, and a second entry written by the browser
    // would be an unverifiable duplicate of it.
    void productsApi.update(updatedProduct.id, updatedProduct)
      .then((saved) => setProducts((prev) =>
        prev.map((product) => (product.id === saved.id ? merged(updatedProduct, saved) : product))))
      .catch(reportProductFailure);
  };

  const handleStartShift = (openingFloat: number) => {
    const shiftId = `shift-${Date.now()}`;
    const cashier = currentUser?.fullName || 'Cashier';
    const openedAt = new Date().toLocaleString('en-GB');
    setShiftInfo({
      id: shiftId,
      outletId: currentOutlet.id,
      terminalId: '01',
      isOpen: true,
      openedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cashier,
      openingFloat,
      expectedCash: openingFloat,
    });
    // H-01: the shift joins the history the moment it opens.
    setShiftRecords((prev) => [
      {
        id: shiftId,
        outletId: currentOutlet.id,
        outletName: currentOutlet.name,
        terminalId: '01',
        cashier,
        openingFloat,
        openedAt,
        salesTotal: 0,
        takingsByMethod: {},
        expectedCash: openingFloat,
        status: 'open',
      },
      ...prev,
    ]);

    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actor: 'Kwame A.',
      action: 'SHIFT_OPEN',
      entity: `Shift Terminal #01`,
      outletName: currentOutlet.name,
      details: `Opened drawer with opening float of GH₵ ${openingFloat.toFixed(2)}`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);
  };

  const handleCloseShift = (countedCash: number, note?: string) => {
    const variance = roundMoney(countedCash - shiftInfo.expectedCash);
    setShiftInfo((prev) => ({
      ...prev,
      isOpen: false,
      countedCash,
      variance,
      varianceNote: note,
    }));

    // FR-CASH-07: non-cash takings are recorded by method for reconciliation.
    const shiftSales = sales.filter(
      (sale) => sale.status === 'COMPLETED' && sale.outletId === shiftInfo.outletId,
    );
    const takingsByMethod = shiftSales.reduce<Partial<Record<PaymentMethod, number>>>((acc, sale) => {
      sale.payments.forEach((payment) => {
        acc[payment.method] = roundMoney((acc[payment.method] || 0) + payment.amount);
      });
      return acc;
    }, {});

    // FR-CASH-09: a closed shift is never reopened; this record is final.
    setShiftRecords((prev) =>
      prev.map((record) =>
        record.id === shiftInfo.id
          ? {
              ...record,
              status: 'closed',
              closedAt: new Date().toLocaleString('en-GB'),
              salesTotal: roundMoney(shiftSales.reduce((sum, sale) => sum + sale.total, 0)),
              takingsByMethod,
              expectedCash: shiftInfo.expectedCash,
              countedCash,
              variance,
              varianceNote: note,
            }
          : record,
      ),
    );

    const auditEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actor: 'Kwame A.',
      action: 'SHIFT_CLOSE',
      entity: `Shift Terminal #01`,
      outletName: currentOutlet.name,
      details: `Blind count submitted: GH₵ ${countedCash.toFixed(2)}. Variance: ${variance >= 0 ? '+' : ''}GH₵ ${variance.toFixed(2)}. ${note || ''}`,
    };
    setAuditLogs((prev) => [auditEntry, ...prev]);

  };

  // ==========================================
  // AUTH SESSION
  // ==========================================
  const appendAuditLog = (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
    const stamped: AuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}`,
      timestamp:
        new Date().toLocaleDateString('en-GB') +
        ' ' +
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setAuditLogs((prev) => [stamped, ...prev]);
  };

  const handleAuthenticated = (session: AuthSession) => {
    // Hold the "Starting secure session" screen until the workspace is loaded.
    // Setting the user first would drop straight onto a dashboard built from
    // whatever was in state, which is precisely the stale-until-refresh bug.
    setAuthLoading(true);
    setActiveTab('dashboard');
    void loadWorkspace(session).finally(() => setAuthLoading(false));
  };

  const handleLockSession = (reason: 'manual' | 'expired' = 'manual') => {
    if (!currentUser) return;
    void authApi.lock().then(() => {
      setUnlockPin('');
      setUnlockError(null);
      setSessionLockReason(reason);
    }).catch((failure) => {
      // A dead session arrives as an 'ended' signal and is handled centrally;
      // anything else here is a real server fault.
      const ended = failure instanceof AuthApiError && failure.status === 401;
      if (!ended) setAppErrorReference(`AUTH-${Date.now().toString().slice(-6)}`);
    });
  };

  const handleUnlockSession = (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    void authApi.unlock(unlockPin).then(() => {
      setSessionLockReason(null);
      setUnlockPin('');
      setUnlockError(null);
    }).catch((failure) => {
      if (!(failure instanceof AuthApiError)) {
        setUnlockError('Could not unlock the terminal.');
        return;
      }
      // PIN_INCORRECT leaves the session and the open shift alone, so the
      // message belongs on the unlock form. Anything else has already been
      // published as a session signal.
      setUnlockError(failure.code === 'PIN_INCORRECT'
        ? failure.message
        : 'Could not unlock the terminal. Sign in again if this continues.');
    });
  };

  /**
   * Return the UI to the sign-in screen without telling the server anything.
   *
   * Kept separate from {@link handleSignOut} because the server-ended case must
   * not call `/sign-out`: that request would 401, publish another 'ended'
   * signal, and tear down again in a loop.
   */
  const resetToSignIn = () => {
    setCurrentUser(null);
    setSessionLockReason(null);
    setUnlockPin('');
    setUnlockError(null);
    setPosOpen(false);
    setSettingsOpen(false);
    setSearchOpen(false);
    setShiftModalOpen(false);
  };

  const handleSignOut = () => {
    if (currentUser) void authApi.signOut().catch(() => undefined);
    resetToSignIn();
  };

  /**
   * BR-15: the audit log is the server's, not the browser's.
   *
   * Loaded once the user is known, and only for those who may read it —
   * `audit.view`. A cashier asking for it gets a 403, which is correct and
   * would otherwise show up as a console error on every sign-in.
   */
  useEffect(() => {
    if (!currentUser || !can('audit.view')) return;
    let active = true;
    auditApi.recent({ limit: 200 })
      .then((entries) => { if (active) setAuditLogs(entries); })
      .catch(() => { /* the view keeps whatever it has; the log is not load-bearing */ });
    return () => { active = false; };
  }, [currentUser?.id, currentOutletId]);

  // The server can lock or end this session on its own — an idle terminal with
  // an open shift, or an account deactivated mid-shift. Those arrive on
  // whichever request happens to be in flight, so they are handled once here
  // instead of at every call site.
  useEffect(() => onSessionSignal((signal) => {
    if (signal === 'ended') {
      resetToSignIn();
      return;
    }
    setUnlockPin('');
    setUnlockError(null);
    setSessionLockReason((current) => current ?? 'expired');
  }));

  const handleUpdateUserPassword = (userId: string, newPassword: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              password: newPassword,
              tempPassword: undefined,
              mustChangePasswordOnNextLogin: false,
              passwordResetAt:
                new Date().toLocaleDateString('en-GB') +
                ' ' +
                new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : u
      )
    );
  };

  // ==========================================
  // STORES & BRANCHES (Settings → Stores & Branches)
  // ==========================================
  /**
   * The server owns the branch list — FR-OUT-06.
   *
   * State follows what the API returns rather than what was typed, so a
   * normalised code or a trimmed name shows the stored value, and a rejection
   * (no `settings.general`, duplicate code, hyphen in the code) leaves the list
   * untouched instead of showing a branch that was never saved.
   */
  const handleAddOutlet = (outlet: Outlet) => {
    void outletsApi.create(outlet)
      .then((saved) => setOutlets((prev) => [...prev, saved]))
      .catch(reportOutletFailure);
  };

  const handleUpdateOutlet = (outletId: OutletId, changes: Partial<Outlet>) => {
    const current = outlets.find((o) => o.id === outletId);
    if (!current) return;

    const merged = { ...current, ...changes };
    const request = changes.active !== undefined && Object.keys(changes).length === 1
      ? outletsApi.setActive(outletId, changes.active)
      : outletsApi.update(outletId, merged);

    void request
      .then((saved) => setOutlets((prev) => prev.map((o) => (o.id === outletId ? saved : o))))
      .catch(reportOutletFailure);
  };

  const reportOutletFailure = (failure: unknown) => {
    if (failure instanceof AuthApiError && failure.status !== 401 && failure.status !== 423) {
      alert(failure.message);
      return;
    }
    if (!(failure instanceof AuthApiError)) setAppErrorReference(`OUT-${Date.now().toString().slice(-6)}`);
  };

  const handleOpenAddNew = (action: string) => {
    if (action === 'product') {
      setActiveTab(hasTabAccess('products') ? 'products' : 'denied');
    } else if (action === 'shift') {
      if (hasTabAccess('shifts')) setShiftModalOpen(true); else setActiveTab('denied');
    } else if (action === 'customer') {
      setActiveTab(hasTabAccess('customers') ? 'customers' : 'denied');
    } else if (action === 'supplier') {
      setActiveTab(hasTabAccess('suppliers') ? 'suppliers' : 'denied');
    }
  };

  // Gate the whole application behind the sign-in flow.
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-bold text-white">
        Starting secure session…
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthView
        companyName={generalSettings.companyName}
        accentColor={accentColor}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f8f9fa] text-slate-800 flex flex-col font-sans">
      {/* 1. TOP NAVBAR */}
      <Header
        currentUser={currentUser}
        onSignOut={handleSignOut}
        outlets={outlets}
        currentOutlet={currentOutlet}
        onSelectOutlet={handleSelectOutlet}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onOpenPos={() => can('pos.sell') && setPosOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(permissions.hasAny('settings.appearance', 'settings.terminal', 'settings.general'))}
        onOpenAddNew={handleOpenAddNew}
        canOpenTerminal={can('pos.sell') === true}
        canViewAllOutlets={can('outlet.view_all') === true}
        canModifySystemSettings={permissions.hasAny('settings.appearance', 'settings.terminal', 'settings.general')}
        canAddProducts={can('product.create') === true}
        canCreateCustomer={can('customer.manage') === true}
        canReceiveGoods={can('stock.receive') === true}
        onOpenUserProfile={() => setActiveTab(hasTabAccess('settings') ? 'settings' : 'denied')}
        onLockSession={() => handleLockSession('manual')}
      />

      {/* 2. MAIN APP SHELL: SIDEBAR + CONTENT VIEW */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenPos={() => can('pos.sell') && setPosOpen(true)}
          onOpenShift={() => (permissions.hasAny('shift.open', 'shift.close')) && setShiftModalOpen(true)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          permissions={permissions}
        />

        <main ref={mainScrollRef} className="flex-1 overflow-y-auto bg-[#f8f9fa] pb-12">
          {isOffline && <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800"><WifiOff className="h-4 w-4" /> Offline mode: committed work remains available and new transactions will queue for sync.</div>}
          {/* Main Dashboard */}
          {activeTab === 'dashboard' && (
            <Dashboard
              permissions={permissions}
              products={products}
              currentOutlet={currentOutlet}
              outlets={outlets}
              sales={sales}
              currentUser={currentUser}
              shiftInfo={shiftInfo}
              onOpenPos={() => can('pos.sell') && setPosOpen(true)}
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenShift={() => (permissions.hasAny('shift.open', 'shift.close')) && setShiftModalOpen(true)}
              onViewAllLowStock={() => setActiveTab('products')}
              onSelectOutlet={handleSelectOutlet}
              onSelectTab={setActiveTab}
              accentColor={accentColor}
            />
          )}

          {/* Multi-Outlet Comparison (Screen I-19) */}
          {activeTab === 'outlet-comparison' && (
            <OutletComparisonView
              outlets={outlets}
              products={products}
              sales={sales}
            />
          )}

          {/* Comprehensive Analytics, Reports & AI Inferences */}
          {activeTab === 'analytics' && (
            <AnalyticsReportsView
              products={products}
              sales={sales}
              expenses={expenses}
              installmentPlans={installmentPlans}
              returnsExchanges={returnsExchanges}
              currentOutlet={currentOutlet}
              outlets={outlets}
              accentColor={accentColor}
            />
          )}

          {activeTab === 'cash-control' && (
            <CashControlView
              shiftRecords={shiftRecords}
              shiftInfo={shiftInfo}
              sales={sales}
              cashMovements={cashMovements}
              currentOutlet={currentOutlet}
              outlets={outlets}
              onOpenShift={() => (permissions.hasAny('shift.open', 'shift.close')) && setShiftModalOpen(true)}
              onCloseShift={handleCloseShift}
              onAddMovement={(movement) => {
                setCashMovements((prev) => [movement, ...prev]);
                // BR-14: expected cash = float + cash sales − cash refunds − cash payouts.
                setShiftInfo((prev) => ({
                  ...prev,
                  expectedCash: roundMoney(
                    prev.expectedCash + (movement.direction === 'in' ? movement.amount : -movement.amount),
                  ),
                }));
                setAuditLogs((prev) => [{
                  id: `aud-${Date.now()}`,
                  timestamp: new Date().toLocaleString('en-GB'),
                  actor: movement.createdBy,
                  action: 'CASH_MOVEMENT_RECORDED',
                  entity: movement.id,
                  outletName: currentOutlet.name,
                  details: `${movement.direction === 'in' ? 'In' : 'Out'} ${movement.amount.toFixed(2)} — ${movement.reasonCode}${movement.note ? `: ${movement.note}` : ''}`,
                }, ...prev]);
              }}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              permissions={permissions}
              products={products}
              sales={sales}
              movements={movements}
              outlets={outlets}
              currentOutlet={currentOutlet}
              currentUser={currentUser}
            />
          )}

          {/* Product Catalogue & Per-Outlet Stock (BR-1, BR-10) */}
          {activeTab === 'products' && (
            <ProductsView
              permissions={permissions}
              products={products}
              currentOutlet={currentOutlet}
              outlets={outlets}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
              onToggleActive={handleToggleActive}
            />
          )}

          {activeTab === 'products-import' && (
            <ProductsView
              permissions={permissions}
              products={products}
              currentOutlet={currentOutlet}
              outlets={outlets}
              mode="import"
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
              onToggleActive={handleToggleActive}
            />
          )}

          {activeTab === 'products-setup' && (
            <ProductsView
              permissions={permissions}
              products={products}
              currentOutlet={currentOutlet}
              outlets={outlets}
              mode="setup"
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
              onToggleActive={handleToggleActive}
            />
          )}

          {activeTab === 'products-bulk-price' && (
            <ProductsView
              permissions={permissions}
              products={products}
              currentOutlet={currentOutlet}
              outlets={outlets}
              mode="bulk-price"
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
              onToggleActive={handleToggleActive}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              permissions={permissions}
              products={products}
              movements={movements}
              currentOutlet={currentOutlet}
              outlets={outlets}
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
            />
          )}

          {activeTab === 'inventory-low-stock' && (
            <InventoryView
              permissions={permissions}
              products={products}
              movements={movements}
              currentOutlet={currentOutlet}
              outlets={outlets}
              mode="low-stock"
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
            />
          )}

          {activeTab === 'inventory-valuation' && (
            <InventoryView
              permissions={permissions}
              products={products}
              movements={movements}
              currentOutlet={currentOutlet}
              outlets={outlets}
              mode="valuation"
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
            />
          )}

          {activeTab === 'inventory-exceptions' && (
            <InventoryView
              permissions={permissions}
              products={products}
              movements={movements}
              currentOutlet={currentOutlet}
              outlets={outlets}
              mode="exceptions"
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
            />
          )}

          {activeTab === 'inventory-count' && (
            <InventoryView
              permissions={permissions}
              products={products}
              movements={movements}
              currentOutlet={currentOutlet}
              outlets={outlets}
              mode="count"
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
            />
          )}

          {activeTab === 'inventory-transfer' && (
            <InventoryView
              permissions={permissions}
              products={products}
              movements={movements}
              currentOutlet={currentOutlet}
              outlets={outlets}
              mode="transfer"
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
            />
          )}

          {/* E-04/E-05: Receive stock */}
          {activeTab === 'goods-receipt' && (
            <GoodsReceiptView
              products={products}
              suppliers={suppliers}
              currentOutlet={currentOutlet}
              cashierName={currentUser?.fullName || 'Storekeeper'}
              onCommitReceipt={handleCommitReceipt}
            />
          )}

          {/* Stock Movements Log (Screen E-06, BR-2) */}
          {activeTab === 'stock-movements' && (
            <StockMovementsView
              movements={movements}
              currentOutlet={currentOutlet}
              outlets={outlets}
            />
          )}

          {/* Sales History & Receipts (Screen C-25 / Voiding BR-3) */}
          {activeTab === 'sales-history' && (
            <SalesHistoryView
              sales={sales}
              currentOutlet={currentOutlet}
              onVoidSale={handleVoidSale}
            />
          )}

          {/* Customers Directory (Trade vs Retail Pricing) */}
          {activeTab === 'customers' && (
            <CustomersView
              customers={customers}
              sales={sales}
              outlets={outlets}
              onAddCustomer={handleAddCustomer}
              onUpdateCustomer={handleUpdateCustomer}
            />
          )}

          {/* Suppliers Directory */}
          {activeTab === 'suppliers' && (
            <SuppliersView
              suppliers={suppliers}
              products={products}
              movements={movements}
              currentOutlet={currentOutlet}
              outlets={outlets}
              onAddSupplier={handleAddSupplier}
              onUpdateSupplier={handleUpdateSupplier}
              onReceiveStock={() => setGoodsReceiptModalOpen(true)}
            />
          )}

          {/* Security & Audit Trail Log (Screen J-06, BR-15) */}
          {activeTab === 'audit-log' && <AuditLogView logs={auditLogs} />}

          {/* Radiance Lighting: Accounting & Expenses P&L */}
          {activeTab === 'expenses' && (
            <ExpensesAccountingView
              expenses={expenses}
              onAddExpense={handleAddExpense}
              onDeleteExpense={handleDeleteExpense}
              sales={sales}
              currentOutlet={currentOutlet}
              outlets={outlets}
              accentColor={accentColor}
            />
          )}

          {/* Radiance Lighting: Pay in Installments (Credit Plans) */}
          {activeTab === 'installments' && (
            <InstallmentsView
              plans={installmentPlans}
              installmentPlans={installmentPlans}
              onAddPlan={handleAddInstallmentPlan}
              onUpdatePlan={handleUpdateInstallmentPlan}
              products={products}
              customers={customers}
              currentOutlet={currentOutlet}
              outlets={outlets}
              accentColor={accentColor}
            />
          )}

          {/* Radiance Lighting: Goods Returns and Exchanges / Swaps */}
          {activeTab === 'returns-exchanges' && (
            <ReturnsExchangesView
              records={returnsExchanges}
              onAddRecord={handleAddReturnRecord}
              sales={sales}
              products={products}
              currentOutlet={currentOutlet}
              outlets={outlets}
              accentColor={accentColor}
            />
          )}

          {/* Comprehensive System Settings Hub */}
          {activeTab === 'settings' && (
            <SettingsView
              permissions={permissions}
              currentOutlet={currentOutlet}
              outlets={outlets}
              onAddOutlet={handleAddOutlet}
              onUpdateOutlet={handleUpdateOutlet}
              currentUser={currentUser}
              users={users}
              onUpdateUsers={setUsers}
              rolesPermissions={rolesPermissions}
              onUpdateRolesPermissions={setRolesPermissions}
              generalSettings={generalSettings}
              onUpdateGeneralSettings={setGeneralSettings}
              onAddAuditLog={(entry) =>
                setAuditLogs((prev) => [
                  {
                    ...entry,
                    id: `aud-${Date.now()}`,
                    timestamp: new Date().toLocaleString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  },
                  ...prev,
                ])
              }
              products={products}
              sales={sales}
              accentColor={accentColor}
              onChangeAccent={setAccentColor}
            />
          )}

          {activeTab === 'denied' && (
            <div className="min-h-[70vh] flex items-center justify-center p-6"><div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700"><ShieldCheck className="h-6 w-6" /></div><h1 className="mt-5 text-xl font-black text-slate-900">Permission required</h1><p className="mt-2 text-sm text-slate-500">Your role does not include access to this screen. Ask an administrator to grant the required permission.</p><button type="button" onClick={() => setActiveTab('dashboard')} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-xs font-bold text-white"><Home className="h-4 w-4" /> Back to dashboard</button></div></div>
          )}

          {activeTab === 'server-error' && (
            <div className="min-h-[70vh] flex items-center justify-center p-6">
              <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-xs">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
                  <ServerCrash className="w-7 h-7" />
                </div>
                <h1 className="text-xl font-black text-slate-900 mt-5">Server error</h1>
                <p className="text-sm text-slate-500 mt-2">
                  Something unrecoverable happened. Retry the current screen or return to the dashboard.
                </p>
                <div className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  Reference code: <span className="font-mono font-bold text-slate-700">{appErrorReference || 'ERR-500'}</span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAppErrorReference(null);
                      setActiveTab('dashboard');
                    }}
                    className="py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAppErrorReference(null);
                      setActiveTab('dashboard');
                    }}
                    className="py-2.5 rounded-xl bg-accent-500 text-white font-bold text-xs hover:bg-accent-600 flex items-center justify-center gap-2"
                  >
                    <Home className="w-4 h-4" />
                    <span>Dashboard</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {!validTabs.has(activeTab) && (
            <div className="min-h-[70vh] flex items-center justify-center p-6">
              <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-xs">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <h1 className="text-xl font-black text-slate-900 mt-5">Page not found</h1>
                <p className="text-sm text-slate-500 mt-2">
                  The requested screen is not available in this workspace.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="mt-6 px-5 py-2.5 rounded-xl bg-accent-500 text-white font-bold text-xs hover:bg-accent-600 inline-flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to dashboard</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {currentUser && sessionLockReason && (
        <div className="fixed inset-0 z-90 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleUnlockSession}
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-7 shadow-2xl text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto">
              <LockKeyhole className="w-8 h-8 text-accent-600" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-5">
              {sessionLockReason === 'expired' ? 'Session expired' : 'Screen locked'}
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              {sessionLockReason === 'expired'
                ? 'This terminal was locked after idle timeout. The active shift and cart state remain intact.'
                : 'Unlock with the shift owner PIN to continue without ending the shift.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3 text-left bg-slate-50 border border-slate-200 rounded-xl p-3">
              <img
                src={
                  currentUser.avatarUrl ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
                }
                alt={currentUser.fullName}
                className="w-10 h-10 rounded-xl object-cover border border-slate-200"
              />
              <div>
                <div className="text-sm font-black text-slate-900">{currentUser.fullName}</div>
                <div className="text-xs text-slate-500">{currentOutlet.name}</div>
              </div>
            </div>
            <div className="mt-5">
              <label className="text-xs font-bold text-slate-700 block mb-2 text-left">
                Unlock PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={unlockPin}
                onChange={(e) => {
                  setUnlockError(null);
                  setUnlockPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                className="w-full text-center text-3xl tracking-widest font-black py-3.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-accent-500 text-slate-900"
                autoFocus
              />
              {unlockError && (
                <p className="text-xs text-rose-600 font-bold mt-2">{unlockError}</p>
              )}
            </div>
            <button
              type="submit"
              className="mt-5 w-full py-3 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-black text-sm flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Unlock terminal</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 w-full py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs"
            >
              Switch user
            </button>
          </form>
        </div>
      )}

      {/* 3. MODALS & POPUPS */}
      {/* Full POS Checkout Terminal (Screen C-01) */}
      <PosModal
        permissions={permissions}
        onLockSession={() => handleLockSession('manual')}
        isOpen={posOpen}
        onClose={() => setPosOpen(false)}
        products={products}
        currentOutlet={currentOutlet}
        customers={customers}
        shiftInfo={shiftInfo}
        onOpenShift={() => (permissions.hasAny('shift.open', 'shift.close')) && setShiftModalOpen(true)}
        onAddCustomer={(customer) => setCustomers((prev) => [customer, ...prev])}
        onSaleCompleted={handleSaleCompleted}
      />

      {/* Cashier Shift & Drawer Modal (BR-14) */}
      <ShiftsModal
        varianceExplainThreshold={generalSettings.thresholds.cashVarianceExplain}
        isOpen={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        shiftInfo={shiftInfo}
        onStartShift={handleStartShift}
        onCloseShift={handleCloseShift}
        currentOutlet={currentOutlet}
      />

      {/* Goods Receipt (GRN) Modal (BR-4 Weighted Average Costing) */}
      <GoodsReceiptModal
        isOpen={goodsReceiptModalOpen}
        onClose={() => setGoodsReceiptModalOpen(false)}
        products={products}
        currentOutlet={currentOutlet}
        suppliers={suppliers}
        onConfirmReceipt={handleConfirmReceipt}
      />

      {/* Stock Adjustment Modal (FR-STK-07 Reason Codes) */}
      <StockAdjustmentModal
        isOpen={Boolean(adjustmentTargetProduct)}
        onClose={() => setAdjustmentTargetProduct(null)}
        product={adjustmentTargetProduct}
        currentOutlet={currentOutlet}
        onConfirmAdjustment={handleConfirmAdjustment}
      />

      {/* Settings & Appearance Drawer */}
      <SettingsDrawer
        permissions={permissions}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpen={() => setSettingsOpen(true)}
        accentColor={accentColor}
        onChangeAccent={setAccentColor}
        outlets={outlets}
        onOpenFullSettings={() => setActiveTab('settings')}
      />

      {/* Global ⌘K Search Modal */}
      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        products={products}
        onSelectProduct={() => {
          setSearchOpen(false);
          setActiveTab(hasTabAccess('products') ? 'products' : 'denied');
        }}
        onOpenPos={() => {
          setSearchOpen(false);
          if (can('pos.sell')) setPosOpen(true);
        }}
        onOpenShift={() => {
          setSearchOpen(false);
          if (permissions.hasAny('shift.open', 'shift.close')) setShiftModalOpen(true);
        }}
      />
    </div>
  );
}
