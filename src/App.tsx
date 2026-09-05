import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { PosModal } from './components/PosModal';
import { ProductsView } from './components/ProductsView';
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
import {
  OUTLETS,
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_SALES,
  INITIAL_MOVEMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_USERS,
  INITIAL_ROLES_PERMISSIONS,
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
  RolePermissions,
  GeneralSettings,
} from './types';

export default function App() {
  const [outlets] = useState<Outlet[]>(OUTLETS);
  const [currentOutletId, setCurrentOutletId] = useState<OutletId>('inco-hardware');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Core entities state
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [sales, setSales] = useState<CompletedSale[]>(INITIAL_SALES);
  const [movements, setMovements] = useState<StockMovement[]>(INITIAL_MOVEMENTS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  // Settings, Users & RBAC state
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_USERS);
  const [rolesPermissions, setRolesPermissions] = useState<RolePermissions[]>(INITIAL_ROLES_PERMISSIONS);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(INITIAL_SETTINGS);

  // Shift & Cash Drawer state (PRD BR-14)
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo>({
    isOpen: true,
    openedAt: '08:00 AM',
    cashier: 'Kwame A. (Admin)',
    openingFloat: 200,
    expectedCash: 650,
  });

  // Modals state
  const [posOpen, setPosOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [goodsReceiptModalOpen, setGoodsReceiptModalOpen] = useState(false);
  const [adjustmentTargetProduct, setAdjustmentTargetProduct] = useState<Product | null>(null);

  // Appearance accent color state
  const [accentColor, setAccentColor] = useState<string>('#ff9f43');

  const currentOutlet = outlets.find((o) => o.id === currentOutletId) || outlets[0];

  useEffect(() => {
    document.documentElement.style.setProperty('--primary-accent', accentColor);
  }, [accentColor]);

  // Global ⌘K keyboard shortcut listener
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

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

  // PRD BR-4: Goods Receipt with Weighted Average Cost handler
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
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, active: !p.active } : p))
    );
  };

  const handleAddProduct = (newProd: Product) => {
    setProducts((prev) => [newProd, ...prev]);
  };

  const handleStartShift = (openingFloat: number) => {
    setShiftInfo({
      isOpen: true,
      openedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cashier: 'Kwame A. (Admin)',
      openingFloat,
      expectedCash: openingFloat,
    });

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
    const variance = countedCash - shiftInfo.expectedCash;
    setShiftInfo((prev) => ({
      ...prev,
      isOpen: false,
      countedCash,
      variance,
      varianceNote: note,
    }));

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

    alert(
      `Shift closed for ${currentOutlet.name}.\nVariance: ${variance >= 0 ? '+' : ''}GH₵ ${variance.toFixed(2)}`
    );
  };

  const handleOpenAddNew = (action: string) => {
    if (action === 'product') {
      setActiveTab('products');
    } else if (action === 'shift') {
      setShiftModalOpen(true);
    } else if (action === 'customer') {
      setActiveTab('customers');
    } else if (action === 'supplier') {
      setActiveTab('suppliers');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 flex flex-col font-sans">
      {/* 1. TOP NAVBAR */}
      <Header
        outlets={outlets}
        currentOutlet={currentOutlet}
        onSelectOutlet={setCurrentOutletId}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        onOpenPos={() => setPosOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAddNew={handleOpenAddNew}
        onOpenUserProfile={() => setActiveTab('settings')}
      />

      {/* 2. MAIN APP SHELL: SIDEBAR + CONTENT VIEW */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenPos={() => setPosOpen(true)}
          onOpenShift={() => setShiftModalOpen(true)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <main className="flex-1 overflow-y-auto bg-[#f8f9fa] pb-12">
          {/* Main Dashboard */}
          {activeTab === 'dashboard' && (
            <Dashboard
              products={products}
              currentOutlet={currentOutlet}
              sales={sales}
              onOpenPos={() => setPosOpen(true)}
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onViewAllLowStock={() => setActiveTab('products')}
              onSelectTab={setActiveTab}
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

          {/* Product Catalogue & Per-Outlet Stock (BR-1, BR-10) */}
          {activeTab === 'products' && (
            <ProductsView
              products={products}
              currentOutlet={currentOutlet}
              onAddProduct={handleAddProduct}
              onOpenGoodsReceipt={() => setGoodsReceiptModalOpen(true)}
              onOpenAdjustment={(product) => setAdjustmentTargetProduct(product)}
              onToggleActive={handleToggleActive}
            />
          )}

          {/* Goods Receipt (GRN) */}
          {activeTab === 'goods-receipt' && (
            <div className="p-6 max-w-4xl mx-auto space-y-4">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3 text-center">
                <h2 className="text-xl font-black text-slate-800">Goods Receipt Note (GRN)</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Receive inventory batches, log supplier invoices, and recalculate weighted average costs automatically per PRD BR-4.
                </p>
                <button
                  onClick={() => setGoodsReceiptModalOpen(true)}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
                >
                  Open Goods Receipt Modal
                </button>
              </div>
            </div>
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
              onAddCustomer={(c) => setCustomers([c, ...customers])}
            />
          )}

          {/* Suppliers Directory */}
          {activeTab === 'suppliers' && (
            <SuppliersView
              suppliers={suppliers}
              currentOutlet={currentOutlet}
              onAddSupplier={(s) => setSuppliers([s, ...suppliers])}
              onReceiveStock={() => setGoodsReceiptModalOpen(true)}
            />
          )}

          {/* Security & Audit Trail Log (Screen J-06, BR-15) */}
          {activeTab === 'audit-log' && <AuditLogView logs={auditLogs} />}

          {/* Comprehensive System Settings Hub */}
          {activeTab === 'settings' && (
            <SettingsView
              currentOutlet={currentOutlet}
              outlets={outlets}
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
        </main>
      </div>

      {/* 3. MODALS & POPUPS */}
      {/* Full POS Checkout Terminal (Screen C-01) */}
      <PosModal
        isOpen={posOpen}
        onClose={() => setPosOpen(false)}
        products={products}
        currentOutlet={currentOutlet}
        customers={customers}
        onSaleCompleted={handleSaleCompleted}
      />

      {/* Cashier Shift & Drawer Modal (BR-14) */}
      <ShiftsModal
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
          setActiveTab('products');
        }}
        onOpenPos={() => {
          setSearchOpen(false);
          setPosOpen(true);
        }}
        onOpenShift={() => {
          setSearchOpen(false);
          setShiftModalOpen(true);
        }}
      />
    </div>
  );
}
