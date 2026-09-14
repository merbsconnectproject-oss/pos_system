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
  INITIAL_SETTINGS,
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
import type { StockWire } from './stockApi';
import { stockApi, withStock, type MovementType } from './stockApi';
import { suppliersApi, goodsReceiptApi } from './suppliersApi';
import { salesApi, toCompletedSale, cartFromWire } from './salesApi';
import { shiftsApi, toShiftInfo, toShiftRecord, type CashMovementKind } from './shiftsApi';
import { customersApi } from './customersApi';
import { settingsApi } from './settingsApi';
import { usersApi, toRolePermissions } from './usersApi';
import { terminalsApi } from './salesApi';

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
    // allSettled so one failing list cannot cost the user their session — but
    // a rejection is reported rather than swallowed, because a silent empty
    // list looks exactly like "you have no sales yet".
    const [branches, catalogue, movementHistory, supplierList, saleHistory, openShift, shiftHistory,
           roleCatalogue, settings, customerList] =
      await Promise.allSettled([
        outletsApi.list(), productsApi.list(), stockApi.movements({ limit: 200 }), suppliersApi.list(),
        salesApi.recent(undefined, undefined, 100), shiftsApi.current(), shiftsApi.recent(undefined, 50),
        usersApi.catalogue(), settingsApi.load(), customersApi.list(),
      ]);



    const outletList = branches.status === 'fulfilled' && branches.value.length > 0
      ? branches.value
      : OUTLETS;
    if (branches.status === 'fulfilled' && branches.value.length > 0) setOutlets(branches.value);

    // An empty catalogue is a legitimate answer — a new installation has none.
    // BR-1: stock is per outlet, so it arrives as rows and is folded into each
    // product's per-outlet maps rather than as a figure on the product.
    if (catalogue.status === 'fulfilled') {
      const levels = await stockApi.atOutlet(localOutletId({ ...session }, outletList)).catch(() => []);
      setProducts(withStock(catalogue.value, levels));
    }
    if (movementHistory.status === 'fulfilled') setMovements(movementHistory.value);
    if (supplierList.status === 'fulfilled') setSuppliers(supplierList.value);

    // FR-POS-18: past transactions come back from the server. Without this the
    // history is empty until someone sells something in this browser session,
    // which is not what "past" means.
    if (saleHistory.status === 'fulfilled') {
      // The catalogue is needed to rebuild each sale's lines, so this reads the
      // list that was just loaded rather than component state, which React has
      // not committed yet.
      const loadedCatalogue = catalogue.status === 'fulfilled' ? catalogue.value : [];
      setSales(saleHistory.value.map((wire) => toCompletedSale(
        wire,
        cartFromWire(wire, loadedCatalogue),
        outletList.find((outlet) => outlet.id === wire.outletId)?.name || '',
      )));
    }

    // FR-CASH-01: whether a shift is open is the server's answer, not a
    // seeded one. A till that believes it has a shift when the server disagrees
    // sells into nothing.
    if (openShift.status === 'fulfilled') {
      setShiftInfo(openShift.value
        ? toShiftInfo(openShift.value)
        : { id: '', outletId: '', terminalId: '', isOpen: false, openedAt: '',
            cashier: '', openingFloat: 0, expectedCash: 0 });
    }
    if (shiftHistory.status === 'fulfilled') {
      setShiftRecords(shiftHistory.value.map((wire) => toShiftRecord(
        wire, outletList.find((outlet) => outlet.id === wire.outletId)?.name || '')));
    }

    if (roleCatalogue.status === 'fulfilled') {
      setRolesPermissions(toRolePermissions(roleCatalogue.value.roles));
    }

    // FR-SET: the thresholds the server enforces, the accent this browser
    // paints with and the receipt policy it prints. Loaded rather than seeded,
    // because a screen showing a variance threshold the server does not use is
    // telling the shop a rule is in force that is not.
    // FR-CUST-05: one list for the whole business, not one per branch.
    if (customerList.status === 'fulfilled') setCustomers(customerList.value);

    if (settings.status === 'fulfilled') {
      setGeneralSettings(settings.value);
      setAccentColor(settings.value.accentColor);
    }

    const loaded: Record<string, PromiseSettledResult<unknown>> = {
      branches, catalogue, movements: movementHistory, suppliers: supplierList, sales: saleHistory,
      shift: openShift, shiftHistory, roles: roleCatalogue, settings, customers: customerList,
    };
    Object.entries(loaded).forEach(([name, result]) => {
      if (result.status === 'rejected') console.error(`[workspace] ${name} failed to load`, result.reason);
    });

    // FR-USER: staff are only readable with user.manage, so a cashier gets a
    // 403 here. Asked for on its own and allowed to fail — a cashier has no
    // staff screen, and one refusal should not cost them the rest of the
    // workspace.
    const account = accountFromSession(session, outletList);
    if (account.effectivePermissions?.includes('user.manage')) {
      const staff = await usersApi.list(true).catch(() => []);
      if (staff.length > 0) setUsers(staff);
    }

    setCurrentOutletId(localOutletId(session, outletList));
    setCurrentUser(account);
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
  // FR-CUST-05: loaded from the server with the rest of the workspace. Seeded
  // customers are people the shop has never met, and attaching one to a sale
  // records a purchase against somebody who does not exist.
  const [customers, setCustomers] = useState<Customer[]>([]);
  // FR-SUP-01: the directory is the server's.
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  // FR-POS-18: past transactions are the server's — BR-3 makes them
  // immutable records, and a seeded list is not a record of anything.
  const [sales, setSales] = useState<CompletedSale[]>([]);
  // The ledger is the server's — BR-2. Seeding it with fiction is how a
  // stale figure passes for a record of what happened.
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  // FR-CASH: shifts are the server's — a seeded one would claim takings
  // that were never counted.
  const [shiftRecords, setShiftRecords] = useState<ShiftRecord[]>([]);
  // BR-15: the log is loaded from the server. Seeding it meant a screen that
  // showed invented entries until the fetch returned — and kept showing them
  // if it failed.
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Radiance Lighting & Accounting Modules state
  // Stage 2 modules. Nothing on the server records any of these yet, so they
  // start empty rather than showing figures nobody entered — an expense total
  // on an owner's analytics screen is a claim about money.
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [installmentPlans, setInstallmentPlans] = useState<CustomerInstallmentPlan[]>([]);
  const [returnsExchanges, setReturnsExchanges] = useState<ReturnExchangeRecord[]>([]);

  // Settings, Users & RBAC state
  // FR-USER-01: staff are the server's. A seeded list invents colleagues
  // who can be assigned to branches and never sign in.
  const [users, setUsers] = useState<UserAccount[]>([]);
  // `J-06`: the role baselines come from the same enum the server
  // authorises with, so the matrix cannot describe rights it does not grant.
  const [rolesPermissions, setRolesPermissions] = useState<RolePermissions[]>([]);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(INITIAL_SETTINGS);

  // Shift & Cash Drawer state (PRD BR-14)
  /**
   * Closed until the server says otherwise — FR-CASH-01.
   *
   * It used to start open with a float and an expectation nobody had counted,
   * which meant the till believed it could sell before anyone opened a drawer.
   * The server now refuses that (FR-POS-02), so an invented shift would only
   * produce a confusing failure at the payment screen.
   */
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo>({
    id: '',
    outletId: '',
    terminalId: '',
    isOpen: false,
    openedAt: '',
    cashier: '',
    openingFloat: 0,
    expectedCash: 0,
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
  /**
   * FR-POS · FR-PAY · BR-6/BR-7: complete the sale on the server.
   *
   * Returns the committed sale so the till can print the receipt number the
   * database issued. Nothing is decremented locally any more — the server moves
   * the stock through the ledger, and the levels come back from it, so the
   * screen cannot drift from what was actually sold.
   *
   * Resolves to null when the sale was refused. The cart stays intact: a
   * cashier who priced below the floor or tendered short should be able to fix
   * it, not ring the whole basket up again.
   */
  const handleSaleCompleted = async (sale: CompletedSale): Promise<CompletedSale | null> => {
    try {
      const committed = await salesApi.complete({
        // BR-7: the id the till generated. Submitting it twice records one sale.
        id: sale.id,
        outletId: currentOutlet.id,
        customerId: sale.customerId,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        cart: sale.items,
        payments: sale.payments,
      });

      const stored = toCompletedSale(committed, sale.items, currentOutlet.name);
      setSales((prev) => [stored, ...prev]);

      // The stock the ledger settled on, not an arithmetic guess.
      const levels = await stockApi.atOutlet(currentOutlet.id).catch(() => []);
      if (levels.length > 0) setProducts((prev) => withStock(prev, levels));
      void refreshMovements();

      return stored;
    } catch (failure) {
      reportStockFailure(failure);
      return null;
    }
  };

  // PRD BR-3: Void Sale handler
  /**
   * BR-3 · FR-POS-19: void on the server, which writes the reversing movements.
   *
   * The stock comes back through the ledger rather than by arithmetic here, and
   * the sale keeps its record — the customer may still be holding its receipt.
   * The approver's identity was established by the server when the manager
   * entered their PIN; the void itself is authorised again by `sale.void`.
   */
  const handleVoidSale = (
    saleId: string,
    reason: string,
    approver: string,
    _reversingMovements: StockMovement[]
  ) => {
    void salesApi.voidSale(saleId, reason)
      .then(async (voided) => {
        setSales((prev) => prev.map((existing) => existing.id === saleId
          ? { ...existing, status: 'VOIDED' as const, voidReason: voided.voidReason || reason,
              voidedBy: voided.voidedBy || approver, voidedAt: voided.voidedAt || undefined }
          : existing));

        const levels = await stockApi.atOutlet(currentOutlet.id).catch(() => []);
        if (levels.length > 0) setProducts((prev) => withStock(prev, levels));
        void refreshMovements();
      })
      .catch(reportStockFailure);
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
  /**
   * FR-SUP-02…05: the multi-line receiving screen posts one document.
   *
   * All lines land together or none do — the server writes them in one
   * transaction, so a delivery cannot half-arrive. The resulting quantities and
   * averages come back per line and replace the screen's preview, which was
   * computed from whatever stock the browser held.
   */
  const handleCommitReceipt = (
    lines: { productId: string; purchaseUnit: string; conversionFactor: number; quantity: number; unitCost: number }[],
    reference: string,
    supplierId: string,
  ) => {
    void goodsReceiptApi.receive(currentOutlet.id, supplierId, reference, lines)
      .then((result) => {
        setProducts((prev) => prev.map((product) => {
          const line = result.lines.find((item) => item.productId === product.id);
          if (!line) return product;
          return {
            ...product,
            stock: { ...product.stock, [currentOutlet.id]: line.resultingQuantity },
            costPrice: { ...product.costPrice, [currentOutlet.id]: line.resultingAverageCost },
          };
        }));
      })
      .then(refreshMovements)
      .then(refreshSuppliers)
      .catch(reportStockFailure);
  };

  /**
   * FR-SUP-04 · BR-4: a delivery is a document, and confirming it moves stock
   * and the weighted average cost together.
   *
   * The modal's own average is discarded — it was computed from whatever stock
   * the browser held, which is exactly the number that can be stale. The line
   * that comes back carries what the ledger settled on.
   *
   * The modal receives in base units, so the purchase unit is the product's own
   * and the factor is 1. FR-UOM-05's "3 drums of 100 m" conversion is in the
   * API and tested there; the screen has no purchase-unit picker yet.
   */
  const handleConfirmReceipt = (
    productId: string,
    qtyReceived: number,
    unitCost: number,
    _newWeightedAvgCost: number,
    movement: StockMovement,
    supplierId: string,
  ) => {
    const product = products.find((p) => p.id === productId);
    void goodsReceiptApi.receive(currentOutlet.id, supplierId, movement.referenceNumber || '', [{
      productId,
      purchaseUnit: product?.baseUnit || 'pcs',
      conversionFactor: 1,
      quantity: qtyReceived,
      unitCost,
    }])
      .then((result) => {
        const line = result.lines[0];
        if (line) {
          applyLevel(productId, {
            productId,
            outletId: currentOutlet.id,
            quantity: line.resultingQuantity,
            averageCost: line.resultingAverageCost,
            reorderLevel: product?.minStockAlert[currentOutlet.id] ?? 0,
            low: line.resultingQuantity <= (product?.minStockAlert[currentOutlet.id] ?? 0),
          });
        }
      })
      .then(refreshMovements)
      // FR-SUP-07: totalSupplied is summed from receipts, so booking one in
      // changes it. Without this the directory keeps the figure it was last
      // sent and a delivery looks like it bought nothing.
      .then(refreshSuppliers)
      .catch(reportStockFailure);
  };

  const refreshSuppliers = () =>
    suppliersApi.list()
      .then(setSuppliers)
      .catch(() => { /* the directory keeps what it has */ });

  /**
   * FR-INV-05: a physical count becomes an adjustment in whichever direction
   * closes the gap.
   *
   * The modal reports the counted total; the ledger records the difference,
   * because BR-2 wants the change that happened rather than the number it
   * ended at. A count that matches writes nothing — there was no movement.
   */
  const handleConfirmAdjustment = (
    productId: string,
    newStock: number,
    movement: StockMovement
  ) => {
    const product = products.find((p) => p.id === productId);
    const current = product?.stock[currentOutlet.id] ?? 0;
    const delta = newStock - current;
    if (delta === 0) return;

    const type: MovementType = delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
    void stockApi.record({
      productId,
      outletId: currentOutlet.id,
      type,
      quantity: Math.abs(delta),
      reason: movement.reason || 'Physical count',
      note: movement.referenceNumber,
    })
      .then((level) => applyLevel(productId, level))
      .then(refreshMovements)
      .catch(reportStockFailure);
  };

  /** One product's figures for one outlet, replaced with what the server holds. */
  const applyLevel = (productId: string, level: StockWire) => {
    setProducts((prev) => prev.map((product) => product.id !== productId ? product : {
      ...product,
      stock: { ...product.stock, [level.outletId]: level.quantity },
      // FR-PRICE-07: a caller without `price.view_cost` is sent no cost, and
      // the map keeps the gap rather than filling it with a zero that would
      // read as "this was free".
      costPrice: level.averageCost == null
        ? product.costPrice
        : { ...product.costPrice, [level.outletId]: level.averageCost },
      minStockAlert: { ...product.minStockAlert, [level.outletId]: level.reorderLevel },
    }));
  };

  const refreshMovements = () =>
    stockApi.movements({ limit: 200 })
      .then(setMovements)
      .catch(() => { /* the ledger is a record to consult, not load-bearing */ });

  const reportStockFailure = (failure: unknown) => {
    if (failure instanceof AuthApiError && failure.status !== 401 && failure.status !== 423) {
      alert(failure.message);
      return;
    }
    if (!(failure instanceof AuthApiError)) setAppErrorReference(`STK-${Date.now().toString().slice(-6)}`);
  };

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

  /**
   * FR-CUST-02 · FR-CUST-03: a customer is saved, not held in this tab.
   *
   * <p>The server decides the id and the phone's uniqueness, so what comes
   * back replaces what was sent. A locally invented `cust-1757…` id would be
   * attached to a sale and match nobody.
   */
  const handleAddCustomer = async (customer: Customer) => {
    const saved = await customersApi.create(customer);
    setCustomers((prev) => [saved, ...prev.filter((existing) => existing.id !== saved.id)]);
    return saved;
  };

  const handleUpdateCustomer = async (updatedCustomer: Customer) => {
    const saved = await customersApi.update(updatedCustomer);
    setCustomers((prev) => prev.map((customer) => (customer.id === saved.id ? saved : customer)));
    // The server writes the audit entry; this is the local view of the log.
    appendAuditLog({
      actor: currentUser?.fullName || 'System',
      action: 'CUSTOMER_UPDATED',
      entity: `${saved.name} (${saved.phone})`,
      outletName: currentOutlet.name,
      details: 'Customer profile or price-level mapping was updated.',
    });
    return saved;
  };

  /** BR-17: deactivated, never deleted — they are on receipts already printed. */
  const handleSetCustomerActive = async (customerId: string, active: boolean) => {
    const saved = await customersApi.setActive(customerId, active);
    setCustomers((prev) => prev.map((customer) => (customer.id === saved.id ? saved : customer)));
    return saved;
  };

  const handleAddSupplier = (supplier: Supplier) => {
    void suppliersApi.create(supplier)
      .then((saved) => setSuppliers((prev) => [...prev, saved]))
      .catch(reportStockFailure);
  };

  const handleUpdateSupplier = (updatedSupplier: Supplier) => {
    void suppliersApi.update(updatedSupplier.id, updatedSupplier)
      .then((saved) => setSuppliers((prev) => prev.map((s) => (s.id === saved.id ? saved : s))))
      .catch(reportStockFailure);
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

  /** FR-PROD-10: one server transaction, then reconcile the catalogue from its response. */
  const handleImportProducts = async (rows: Product[]) => {
    const result = await productsApi.import(rows);
    setProducts((current) => {
      const importedIds = new Set(result.products.map((product) => product.id));
      const importedSkus = new Set(result.products.map((product) => product.sku.toLowerCase()));
      const untouched = current.filter((product) =>
        !importedIds.has(product.id) && !importedSkus.has(product.sku.toLowerCase()));
      const reconciled = result.products.map((saved) => {
        const local = current.find((product) => product.id === saved.id || product.sku.toLowerCase() === saved.sku.toLowerCase());
        return local ? merged(local, saved) : saved;
      });
      return [...reconciled, ...untouched];
    });
    return result;
  };

  /**
   * FR-CASH-01 · BR-13: open a shift on the server.
   *
   * The till is asked for rather than assumed — BR-6 numbers receipts from the
   * terminal's own block, and "01" was a placeholder that would have been wrong
   * at any outlet with two counters.
   */
  const handleStartShift = (openingFloat: number) => {
    void terminalsApi.atOutlet(currentOutlet.id)
      .then((tills) => {
        if (tills.length === 0) throw new Error('No till is configured for this branch');
        return shiftsApi.open(tills[0].id, openingFloat);
      })
      .then((wire) => {
        setShiftInfo(toShiftInfo(wire));
        setShiftRecords((prev) => [toShiftRecord(wire, currentOutlet.name), ...prev]);
      })
      .catch(reportShiftFailure);
  };

  /**
   * FR-CASH-04/05: close on a blind count.
   *
   * Only the count is sent. What was expected and the variance come back from
   * the server, which is what keeps the close blind — the figure is not in the
   * browser to be read before submitting.
   *
   * FR-CASH-06: past the threshold the server refuses without a note, and the
   * shift stays open so the cashier can add one.
   */
  const handleCloseShift = (countedCash: number, note?: string) => {
    if (!shiftInfo.id) return;
    void shiftsApi.close(shiftInfo.id, countedCash, note)
      .then((wire) => {
        setShiftInfo(toShiftInfo(wire));
        setShiftRecords((prev) => prev.map((record) =>
          record.id === wire.id ? toShiftRecord(wire, currentOutlet.name) : record));
      })
      .catch(reportShiftFailure);
  };

  /** FR-CASH-03: a pay-in or pay-out, each with a reason. */
  const handleCashMovement = (type: CashMovementKind, amount: number, reason: string, note?: string) => {
    if (!shiftInfo.id) return;
    void shiftsApi.recordCash(shiftInfo.id, type, amount, reason, note)
      .then((wire) => setShiftInfo(toShiftInfo(wire)))
      .catch(reportShiftFailure);
  };

  const reportShiftFailure = (failure: unknown) => {
    if (failure instanceof AuthApiError && failure.status !== 401 && failure.status !== 423) {
      alert(failure.message);
      return;
    }
    if (!(failure instanceof AuthApiError)) setAppErrorReference(`SHF-${Date.now().toString().slice(-6)}`);
  };

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

  /**
   * FR-USER-04: the staff screen reassigns people between branches.
   *
   * It hands back the whole list, so the change is found by diffing on the one
   * field it edits — outlet assignment. Diffing a whole record would mean
   * inferring intent from absence, which is how a dropped field silently
   * clears something; one named field is a comparison, not a guess.
   *
   * The list is re-read afterwards rather than merged, because the server
   * decides what the assignment actually became.
   */
  /**
   * FR-SET: settings are saved, not held in this tab.
   *
   * <p>The screen shows what the server accepted rather than what was typed —
   * a threshold that displays as saved while the server enforces the old one
   * is the failure this whole feature exists to prevent.
   */
  const handleUpdateGeneralSettings = (next: GeneralSettings) => {
    const previous = generalSettings;
    setGeneralSettings(next);
    setAccentColor(next.accentColor);

    void settingsApi.save(next)
      .then((saved) => {
        setGeneralSettings(saved);
        setAccentColor(saved.accentColor);
      })
      .catch((failure) => {
        // Put the screen back. Leaving the rejected values on it would be a
        // screen that disagrees with the till.
        setGeneralSettings(previous);
        setAccentColor(previous.accentColor);
        reportUserFailure(failure);
      });
  };

  /**
   * FR-USER-01: create a staff account.
   *
   * <p>Its own path, not a list handed back for something to spot the
   * difference in. The diffing version showed a success toast and saved
   * nothing when it failed to notice the new row — which is exactly what it
   * did — and a create is not a thing that should have to be *inferred*.
   */
  const handleCreateUser = async (account: UserAccount) => {
    const branchIds = outlets.filter((outlet) => outlet.id !== 'all-outlets').map((outlet) => outlet.id);
    const saved = await usersApi.create(account, branchIds);

    const refreshed = await usersApi.list(true);
    setUsers(refreshed);

    // The screen is about to say "created". If the server's own list does not
    // have them, that claim is false and the caller needs to know rather than
    // the user finding out by looking.
    if (!refreshed.some((user) => user.id === saved.id)) {
      throw new Error(`${saved.fullName} was saved but is not in the staff list. Reload and check.`);
    }
    return saved;
  };

  /**
   * FR-USER-01 · FR-USER-04 · FR-USER-07: the staff screen hands back the whole
   * list, so the change is found by comparing it with what is held.
   *
   * <p>Every kind of change is reconciled — a new account, an edited one, a
   * deactivation — because a handler that only understood one of them left the
   * other two looking saved and silently discarded. That is what happened to
   * the first version of this: a created user got a toast, an id made from a
   * timestamp, and no row on the server.
   */
  const handleUpdateUsers = async (next: UserAccount[]) => {
    const branchIds = outlets.filter((outlet) => outlet.id !== 'all-outlets').map((outlet) => outlet.id);
    const held = new Map(users.map((user) => [user.id, user]));

    // A record the server has never seen. Its id was invented by the browser,
    // so it is matched by absence rather than by id.
    const created = next.filter((candidate) => !held.has(candidate.id));

    const edited = next.filter((candidate) => {
      const current = held.get(candidate.id);
      if (!current) return false;
      // A PIN typed into the form is always a change: the server never sends
      // one back, so there is nothing to compare it against and an unsent PIN
      // would be a form that saved everything except the field the manager
      // opened it for.
      if (candidate.pinCode) return true;

      return current.outletId !== candidate.outletId
        || current.fullName !== candidate.fullName
        || current.username !== candidate.username
        || current.email !== candidate.email
        || current.phone !== candidate.phone
        || current.role !== candidate.role;
    });

    // BR-17: deactivation is its own endpoint, not a field on the form.
    const activeFlips = next.filter((candidate) => {
      const current = held.get(candidate.id);
      return current !== undefined && current.active !== candidate.active;
    });

    if (created.length === 0 && edited.length === 0 && activeFlips.length === 0) return;

    try {
      for (const account of created) {
        // FR-AUTH-07: the password typed into the form gets them through the
        // door once. The server marks the account as needing its owner to
        // choose their own before it can be used for anything else.
        await usersApi.create(account, branchIds);
      }
      for (const account of edited) {
        await usersApi.update(account.id, account, branchIds);
      }
      for (const account of activeFlips) {
        await usersApi.setActive(account.id, account.active);
      }
      setUsers(await usersApi.list(true));
    } catch (failure) {
      // The list is reloaded either way, so the screen shows what the server
      // holds rather than the edit that did not land.
      reportUserFailure(failure);
      setUsers(await usersApi.list(true).catch(() => users));
      throw failure;
    }
  };


  const reportUserFailure = (failure: unknown) => {
    if (failure instanceof AuthApiError && failure.status !== 401 && failure.status !== 423) {
      alert(failure.message);
      return;
    }
    if (!(failure instanceof AuthApiError)) setAppErrorReference(`USR-${Date.now().toString().slice(-6)}`);
  };

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
              suppliers={suppliers}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onImportProducts={handleImportProducts}
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
              suppliers={suppliers}
              mode="import"
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onImportProducts={handleImportProducts}
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
              suppliers={suppliers}
              mode="setup"
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onImportProducts={handleImportProducts}
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
              suppliers={suppliers}
              mode="bulk-price"
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onImportProducts={handleImportProducts}
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
              onSetCustomerActive={handleSetCustomerActive}
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
              onUpdateUsers={handleUpdateUsers}
              onCreateUser={handleCreateUser}
              rolesPermissions={rolesPermissions}
              onUpdateRolesPermissions={setRolesPermissions}
              generalSettings={generalSettings}
              onUpdateGeneralSettings={handleUpdateGeneralSettings}
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
              onChangeAccent={(color) => handleUpdateGeneralSettings({ ...generalSettings, accentColor: color })}
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
        discountCeilingPercent={
          generalSettings.thresholds.discountCeilingByRole[currentUser.role] ?? 0
        }
        onLockSession={() => handleLockSession('manual')}
        isOpen={posOpen}
        onClose={() => setPosOpen(false)}
        products={products}
        currentOutlet={currentOutlet}
        customers={customers}
        shiftInfo={shiftInfo}
        onOpenShift={() => (permissions.hasAny('shift.open', 'shift.close')) && setShiftModalOpen(true)}
        onAddCustomer={handleAddCustomer}
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
        onChangeAccent={(color) => handleUpdateGeneralSettings({ ...generalSettings, accentColor: color })}
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
