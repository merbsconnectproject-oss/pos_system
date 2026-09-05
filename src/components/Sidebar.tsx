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
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenPos: () => void;
  onOpenShift: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  activeTab,
  onSelectTab,
  onOpenPos,
  onOpenShift,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const navContent = (
    <div className="py-4 space-y-6 flex-1 flex flex-col justify-between">
      <div className="space-y-6">
        {/* OVERVIEW SECTION */}
        <div>
          {!collapsed && (
            <div className="px-5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
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
              title="Admin Dashboard"
            >
              <LayoutDashboard
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'dashboard' ? 'text-white' : 'text-slate-400'
                }`}
              />
              {!collapsed && <span>Admin Dashboard</span>}
            </button>

            <button
              onClick={() => handleNavClick('outlet-comparison')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'outlet-comparison'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Outlet Comparison (Screen I-19)"
            >
              <div className="flex items-center gap-3">
                <Store
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'outlet-comparison' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Outlet Comparison</span>}
              </div>
              {!collapsed && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                    activeTab === 'outlet-comparison'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  I-19
                </span>
              )}
            </button>
          </div>
        </div>

        {/* POS & SALES SECTION */}
        <div>
          {!collapsed && (
            <div className="px-5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Point of Sale
            </div>
          )}
          <div className="px-2.5 space-y-1">
            {/* Quick POS Launch Button */}
            <button
              onClick={() => {
                onOpenPos();
                if (onCloseMobile) onCloseMobile();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-black text-white shadow-xs transition-all cursor-pointer group"
              title="Launch POS Terminal (F2)"
            >
              <div className="flex items-center gap-3">
                <Monitor className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform shrink-0" />
                {!collapsed && <span>Open Terminal</span>}
              </div>
              {!collapsed && (
                <span className="text-[10px] font-mono bg-white/10 text-orange-300 px-1.5 py-0.5 rounded">
                  F2
                </span>
              )}
            </button>

            <button
              onClick={() => handleNavClick('sales-history')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'sales-history'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Sales & Receipts (BR-3 Void)"
            >
              <div className="flex items-center gap-3">
                <FileText
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'sales-history' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Receipts &amp; Voids</span>}
              </div>
              {!collapsed && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                    activeTab === 'sales-history'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  BR-3
                </span>
              )}
            </button>

            <button
              onClick={() => {
                onOpenShift();
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'shifts'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Cash Drawer & Shift (Blind Count BR-14)"
            >
              <div className="flex items-center gap-3">
                <Wallet
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'shifts' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Cashier Shifts</span>}
              </div>
              {!collapsed && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.2 rounded-md border border-emerald-200">
                  Drawer
                </span>
              )}
            </button>
          </div>
        </div>

        {/* INVENTORY & LOGISTICS */}
        <div>
          {!collapsed && (
            <div className="px-5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Inventory &amp; Stock
            </div>
          )}
          <div className="px-2.5 space-y-1">
            <button
              onClick={() => handleNavClick('products')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'products'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Product Catalogue (BR-1)"
            >
              <div className="flex items-center gap-3">
                <Package
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'products' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Product Catalogue</span>}
              </div>
              {!collapsed && (
                <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.2 rounded-md border border-amber-200">
                  BR-1
                </span>
              )}
            </button>

            <button
              onClick={() => handleNavClick('goods-receipt')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'goods-receipt'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Goods Receipt Note (BR-4 Weighted Avg)"
            >
              <div className="flex items-center gap-3">
                <Truck
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'goods-receipt' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Goods Receipt (GRN)</span>}
              </div>
              {!collapsed && (
                <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.2 rounded-md border border-blue-200">
                  BR-4
                </span>
              )}
            </button>

            <button
              onClick={() => handleNavClick('stock-movements')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'stock-movements'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Stock Movements Trail (Screen E-06, BR-2)"
            >
              <div className="flex items-center gap-3">
                <Layers
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'stock-movements' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Stock Movements</span>}
              </div>
              {!collapsed && (
                <span className="text-[10px] font-mono text-slate-400">E-06</span>
              )}
            </button>
          </div>
        </div>

        {/* DIRECTORY & COMPLIANCE */}
        <div>
          {!collapsed && (
            <div className="px-5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Partners &amp; Audit
            </div>
          )}
          <div className="px-2.5 space-y-1">
            <button
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
            </button>

            <button
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
            </button>

            <button
              onClick={() => handleNavClick('audit-log')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'audit-log'
                  ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title="Audit & Security Log (BR-15)"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'audit-log' ? 'text-white' : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span>Audit Trail (BR-15)</span>}
              </div>
              {!collapsed && (
                <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-1.5 py-0.2 rounded-md">
                  J-06
                </span>
              )}
            </button>

            <button
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
              {!collapsed && (
                <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-1.5 py-0.2 rounded-md">
                  Config
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Pro Badge */}
      {!collapsed && (
        <div className="px-3 pt-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-3 rounded-xl border border-slate-700 shadow-xs space-y-1">
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
        className={`hidden md:flex flex-col bg-white border-r border-slate-200/90 h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto transition-all duration-300 select-none z-20 shrink-0 ${
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
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
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
