import React from 'react';
import {
  LayoutDashboard,
  Store,
  Package,
  Truck,
  Layers,
  Users,
  Building,
  ShieldCheck,
  Wallet,
  Monitor,
  FileText,
  X,
  Sparkles,
  ArrowRight,
  Settings,
  DollarSign,
  CalendarClock,
  ArrowRightLeft,
  BarChart3,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenPos: () => void;
  onOpenShift: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  permissions: {
    canOpenTerminal: boolean;
    canBlindCloseShift: boolean;
    canProcessRefund: boolean;
    canViewCostPrices: boolean;
    canAddProducts: boolean;
    canAdjustStock: boolean;
    canReceiveGoods: boolean;
    canCreateCustomer: boolean;
    canAssignCreditLimit: boolean;
    canViewExecutiveReports: boolean;
    canViewAuditLogs: boolean;
    canModifySystemSettings: boolean;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  activeTab,
  onSelectTab,
  onOpenPos,
  onOpenShift,
  mobileOpen = false,
  onCloseMobile,
  permissions,
}) => {
  const productTabs = ['products', 'products-import', 'products-setup', 'products-bulk-price'];
  const inventoryTabs = [
    'inventory',
    'inventory-low-stock',
    'inventory-valuation',
    'inventory-exceptions',
    'inventory-count',
    'inventory-transfer',
  ];
  const productActive = productTabs.includes(activeTab);
  const inventoryActive = inventoryTabs.includes(activeTab);

  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const navContent = (
    <div className="py-3 space-y-6 flex-1 flex flex-col justify-between">
      <div className="space-y-6">
        {/* OVERVIEW SECTION */}
        <div>
          {!collapsed && (
            <div className="px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-2">
              Management
            </div>
          )}
          <div className="px-2.5 space-y-1">
            <button
              onClick={() => handleNavClick('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Dashboard"
            >
              <LayoutDashboard
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'dashboard' ? 'text-white' : 'text-slate-400'
                }`}
              />
              {!collapsed && <span>Dashboard</span>}
            </button>

            {permissions.canViewExecutiveReports && <button
              onClick={() => handleNavClick('analytics')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Analytics & Executive Reports (AI Inferred)"
            >
              <div className="flex items-center gap-3">
                <BarChart3
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'analytics' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Analytics &amp; Reports</span>}
              </div>
              {!collapsed && (
                <span
                  className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md flex items-center gap-0.5 ${
                    activeTab === 'analytics'
                      ? 'bg-white/20 text-white'
                      : 'bg-orange-50 text-orange-600 border border-orange-200'
                  }`}
                >
                  <Sparkles className="w-2.5 h-2.5" /> AI
                </span>
              )}
            </button>}

            {permissions.canViewExecutiveReports && <button
              onClick={() => handleNavClick('outlet-comparison')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'outlet-comparison'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Outlet Comparison"
            >
              <div className="flex items-center gap-3">
                <Store
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'outlet-comparison' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Outlet Comparison</span>}
              </div>
            </button>}

            {permissions.canViewExecutiveReports && <button
              onClick={() => handleNavClick('reports')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'reports' ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Business Reports"
            >
              <FileText className={`w-4 h-4 shrink-0 ${activeTab === 'reports' ? 'text-white' : 'text-slate-400'}`} />
              {!collapsed && <span>Business Reports</span>}
            </button>}
          </div>
        </div>

        {/* SALES & POS SECTION */}
        {(permissions.canOpenTerminal || permissions.canBlindCloseShift || permissions.canProcessRefund) && <div>
          {!collapsed && (
            <div className="px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-2">
              Sales &amp; Point of Sale
            </div>
          )}
          <div className="px-2.5 space-y-1">
            {/* Quick POS Launch Button */}
            {permissions.canOpenTerminal && <button
              onClick={() => {
                onOpenPos();
                if (onCloseMobile) onCloseMobile();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-black text-white shadow-xs transition-all cursor-pointer group"
              title="Launch POS Terminal"
            >
              <div className="flex items-center gap-3">
                <Monitor className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform shrink-0" />
                {!collapsed && <span>Open Terminal</span>}
              </div>
            </button>}

            {(permissions.canBlindCloseShift || permissions.canViewExecutiveReports) && <button
              onClick={() => handleNavClick('sales-history')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'sales-history'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Sales History"
            >
              <div className="flex items-center gap-3">
                <FileText
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'sales-history' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Sales History</span>}
              </div>
            </button>}

            {(permissions.canBlindCloseShift || permissions.canViewExecutiveReports) && <button
              onClick={() => {
                onOpenShift();
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'shifts'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Cash Drawer & Shift"
            >
              <div className="flex items-center gap-3">
                <Wallet
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'shifts' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Cashier Shifts</span>}
              </div>
            </button>}

            {permissions.canProcessRefund && <button
              onClick={() => handleNavClick('returns-exchanges')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'returns-exchanges'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Returns & Product Swaps"
            >
              <div className="flex items-center gap-3">
                <ArrowRightLeft
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'returns-exchanges' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Returns &amp; Swaps</span>}
              </div>
            </button>}
          </div>
        </div>}

        {/* FINANCE & ACCOUNTS */}
        {(permissions.canBlindCloseShift || permissions.canViewExecutiveReports || permissions.canAssignCreditLimit) && <div>
          {!collapsed && (
            <div className="px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-2">
              Finance &amp; Accounting
            </div>
          )}
          <div className="px-2.5 space-y-1">
            {(permissions.canBlindCloseShift || permissions.canViewExecutiveReports) && <button
              onClick={() => handleNavClick('cash-control')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'cash-control' ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Cash Control and End of Day"
            >
              <Wallet className={`w-4 h-4 shrink-0 ${activeTab === 'cash-control' ? 'text-white' : 'text-slate-400'}`} />
              {!collapsed && <span>Cash Control</span>}
            </button>}
            {permissions.canViewExecutiveReports && <button
              onClick={() => handleNavClick('expenses')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Expenses & Operating Accounts"
            >
              <div className="flex items-center gap-3">
                <DollarSign
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'expenses' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Expenses &amp; P&amp;L</span>}
              </div>
            </button>}

            {permissions.canAssignCreditLimit && <button
              onClick={() => handleNavClick('installments')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'installments'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Pay in Installments (Customer Credit Plans)"
            >
              <div className="flex items-center gap-3">
                <CalendarClock
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'installments' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Installment Plans</span>}
              </div>
            </button>}
          </div>
        </div>}

        {/* INVENTORY & LOGISTICS */}
        {(permissions.canAddProducts || permissions.canViewCostPrices || permissions.canAdjustStock || permissions.canReceiveGoods) && <div>
          {!collapsed && (
            <div className="px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-2">
              Inventory &amp; Stock
            </div>
          )}
          <div className="px-2.5 space-y-1">
            {(permissions.canAddProducts || permissions.canViewCostPrices) && <button
              onClick={() => handleNavClick('products')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                productActive
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Product Catalogue"
            >
              <div className="flex items-center gap-3">
                <Package
                  className={`w-4 h-4 shrink-0 ${
                    productActive ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Product Catalogue</span>}
              </div>
            </button>}

            {(permissions.canAdjustStock || permissions.canViewCostPrices) && <button
              onClick={() => handleNavClick('inventory')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                inventoryActive
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Stock On Hand"
            >
              <div className="flex items-center gap-3">
                <Layers
                  className={`w-4 h-4 shrink-0 ${
                    inventoryActive ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Stock On Hand</span>}
              </div>
            </button>}

            {permissions.canReceiveGoods && <button
              onClick={() => handleNavClick('goods-receipt')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'goods-receipt'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Goods Receipt Note (GRN)"
            >
              <div className="flex items-center gap-3">
                <Truck
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'goods-receipt' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Goods Receipt (GRN)</span>}
              </div>
            </button>}

            {(permissions.canAdjustStock || permissions.canViewCostPrices) && <button
              onClick={() => handleNavClick('stock-movements')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'stock-movements'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Stock Movements Trail"
            >
              <div className="flex items-center gap-3">
                <Layers
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'stock-movements' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Stock Movements</span>}
              </div>
            </button>}
          </div>
        </div>}

        {/* DIRECTORY & COMPLIANCE */}
        {(permissions.canCreateCustomer || permissions.canReceiveGoods || permissions.canViewAuditLogs) && <div>
          {!collapsed && (
            <div className="px-4 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 mb-2">
              Partners &amp; Audit
            </div>
          )}
          <div className="px-2.5 space-y-1">
            {permissions.canCreateCustomer && <button
              onClick={() => handleNavClick('customers')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'customers'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Customers Directory (Trade Pricing)"
            >
              <Users
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'customers' ? 'text-white' : 'text-slate-400'
                }`}
              />
              {!collapsed && <span>Customers (Trade)</span>}
            </button>}

            {permissions.canReceiveGoods && <button
              onClick={() => handleNavClick('suppliers')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'suppliers'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Suppliers Directory"
            >
              <Building
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'suppliers' ? 'text-white' : 'text-slate-400'
                }`}
              />
              {!collapsed && <span>Suppliers Directory</span>}
            </button>}

            {permissions.canViewAuditLogs && <button
              onClick={() => handleNavClick('audit-log')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'audit-log'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Audit & Security Log"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'audit-log' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Audit Trail</span>}
              </div>
            </button>}

            {permissions.canModifySystemSettings && <button
              onClick={() => handleNavClick('settings')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Enterprise Settings & Permissions"
            >
              <div className="flex items-center gap-3">
                <Settings
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'settings' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>System Settings</span>}
              </div>
            </button>}
          </div>
        </div>}
      </div>

      {/* Bottom Pro Badge */}
      {!collapsed && (
        <div className="px-3 pt-4">
          <div className="bg-slate-900 text-white p-3 rounded-xl border border-slate-800 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-orange-400 tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> DreamsPOS v2.6
              </span>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.2 rounded">
                Live
              </span>
            </div>
            <div className="text-[11px] text-slate-300 font-medium">
              Offline-Safe &amp; Multi-Outlet
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 1. DESKTOP SIDEBAR */}
      <aside
        className={`hidden md:flex flex-col bg-white border-r border-slate-300 h-full overflow-y-auto transition-all duration-300 select-none z-20 shrink-0 ${
          collapsed ? 'w-18' : 'w-64'
        }`}
      >
        {navContent}
      </aside>

      {/* 2. MOBILE SLIDE-OVER DRAWER (Responsive for phones and tablets) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex select-none">
          {/* Backdrop blur */}
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs animate-modal-backdrop"
          />

          {/* Drawer container */}
          <div className="relative w-72 max-w-[80vw] bg-white h-full shadow-2xl flex flex-col z-10 animate-drawer-left">
            <div className="p-4 border-b border-slate-300 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-500 text-white font-black text-xs flex items-center justify-center">
                  POS
                </div>
                <span className="font-black text-sm text-slate-900">Navigation Menu</span>
              </div>
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {navContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
