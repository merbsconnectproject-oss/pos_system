import React, { useState, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  Plus,
  Monitor,
  Maximize2,
  Bell,
  Settings,
  Store,
  ChevronLeft,
  ChevronRight,
  Check,
  Menu,
  Clock,
  Wallet,
  ShieldCheck,
  User,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { Outlet, OutletId, UserAccount } from '../types';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Administrator',
  branch_manager: 'Branch Manager',
  cashier: 'POS Cashier',
  storekeeper: 'Storekeeper',
};

interface HeaderProps {
  currentUser: UserAccount;
  onSignOut: () => void;
  outlets: Outlet[];
  currentOutlet: Outlet;
  onSelectOutlet: (id: OutletId) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileMenu?: () => void;
  onOpenPos: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenAddNew: (action: string) => void;
  onOpenUserProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onSignOut,
  outlets,
  currentOutlet,
  onSelectOutlet,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileMenu,
  onOpenPos,
  onOpenSearch,
  onOpenSettings,
  onOpenAddNew,
  onOpenUserProfile,
}) => {
  const [outletDropdownOpen, setOutletDropdownOpen] = useState(false);
  const [addNewDropdownOpen, setAddNewDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-300 px-3 sm:px-5 flex items-center justify-between sticky top-0 z-30 shadow-2xs select-none">
      {/* LEFT: Mobile Menu, Brand, Desktop Toggle & Search */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile Hamburger Button */}
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Open Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-xs shadow-orange-500/20 font-black text-sm tracking-tighter">
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>

          <div className="flex flex-col leading-none">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black tracking-tight text-slate-900">Radiance</span>
              <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200">
                POS
              </span>
            </div>
            <span className="text-[9px] font-semibold text-slate-400 tracking-wider mt-0.5 hidden sm:inline">
              Multi-Outlet Retail OS
            </span>
          </div>
        </div>

        {/* Desktop Sidebar Collapse Toggle Button */}
        <button
          onClick={onToggleSidebar}
          className="hidden md:flex w-7 h-7 rounded-lg border border-slate-300 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 items-center justify-center shadow-2xs transition-all cursor-pointer"
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4 text-slate-600" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Search Bar Trigger */}
        <div
          onClick={onOpenSearch}
          className="hidden lg:flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl px-3.5 py-1.5 w-64 xl:w-72 cursor-pointer text-slate-400 text-xs transition-all shadow-2xs hover:border-slate-300"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span className="flex-1 text-slate-500 font-medium truncate">
            Search electricals, SKU...
          </span>
          <kbd className="text-[10px] font-mono font-bold bg-white text-slate-500 border border-slate-300 px-1.5 py-0.5 rounded shadow-2xs">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* RIGHT: Active Outlet Switcher, Actions, POS, Live Clock & Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Live POS Clock */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-slate-600 text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
          <span className="font-bold">{currentTime || '08:00:00 AM'}</span>
        </div>

        {/* Active Outlet Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setOutletDropdownOpen(!outletDropdownOpen);
              setAddNewDropdownOpen(false);
            }}
            className="flex items-center gap-2 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80 text-xs font-black px-2.5 sm:px-3 py-1.5 rounded-xl transition-all shadow-2xs cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
            <Store className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="max-w-[85px] sm:max-w-[130px] truncate">{currentOutlet.name}</span>
            <ChevronDown className="w-3 h-3 text-emerald-600 shrink-0" />
          </button>

          {outletDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-300 rounded-2xl shadow-xl z-50 py-2 divide-y divide-slate-200 animate-in fade-in zoom-in-95">
              <div className="px-3.5 py-1.5 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Select Active Branch
              </div>
              <div className="p-1 space-y-0.5">
                {outlets.map((outlet) => (
                  <button
                    key={outlet.id}
                    onClick={() => {
                      onSelectOutlet(outlet.id);
                      setOutletDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      currentOutlet.id === outlet.id
                        ? 'bg-orange-50 text-orange-600 font-black'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-bold">{outlet.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {outlet.town} • {outlet.receiptPrefix}
                      </div>
                    </div>
                    {currentOutlet.id === outlet.id && <Check className="w-4 h-4 text-orange-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick 'Add New' Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setAddNewDropdownOpen(!addNewDropdownOpen);
              setOutletDropdownOpen(false);
            }}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span className="hidden sm:inline">Add New</span>
          </button>

          {addNewDropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-300 rounded-2xl shadow-xl z-50 p-1.5 text-xs text-slate-700 font-medium animate-in fade-in zoom-in-95">
              <button
                onClick={() => {
                  onOpenAddNew('product');
                  setAddNewDropdownOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between cursor-pointer"
              >
                <span>+ Add Product</span>
              </button>
              <button
                onClick={() => {
                  onOpenAddNew('customer');
                  setAddNewDropdownOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between cursor-pointer"
              >
                <span>+ Register Customer</span>
              </button>
              <button
                onClick={() => {
                  onOpenAddNew('supplier');
                  setAddNewDropdownOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between cursor-pointer"
              >
                <span>+ Add Supplier</span>
              </button>
              <button
                onClick={() => {
                  onOpenAddNew('shift');
                  setAddNewDropdownOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between cursor-pointer"
              >
                <span>+ Cash Drawer / Shift</span>
              </button>
            </div>
          )}
        </div>

        {/* Big POS Terminal Button */}
        <button
          onClick={onOpenPos}
          className="flex items-center gap-1.5 bg-[#1e293b] hover:bg-black text-white text-xs font-black px-3 sm:px-3.5 py-1.5 rounded-xl shadow-xs transition-all hover:shadow-md cursor-pointer group"
          title="Launch Fullscreen POS Terminal (F2)"
        >
          <Monitor className="w-3.5 h-3.5 text-orange-400 group-hover:scale-110 transition-transform" />
          <span>POS</span>
          <span className="hidden md:inline text-[9px] bg-white/10 text-orange-300 font-mono px-1 py-0.2 rounded">
            F2
          </span>
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

        {/* Fullscreen Button */}
        <button
          onClick={handleFullscreen}
          className="w-8 h-8 rounded-xl border border-transparent hover:border-slate-300 hover:bg-slate-100 items-center justify-center text-slate-500 hover:text-slate-800 transition-colors hidden md:flex cursor-pointer"
          title="Toggle Fullscreen Mode"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* Settings Drawer Button */}
        <button
          onClick={onOpenSettings}
          className="w-8 h-8 rounded-xl border border-transparent hover:border-slate-300 hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          title="System Settings & Appearance"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Signed-in User Menu */}
        <div className="relative pl-1">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity"
            title="Account, profile & sign out"
          >
            <div className="relative">
              <img
                src={
                  currentUser.avatarUrl ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
                }
                alt={currentUser.fullName}
                className="w-8 h-8 rounded-xl object-cover border border-slate-300 shadow-2xs"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></span>
            </div>
            <div className="hidden 2xl:flex flex-col text-left">
              <span className="text-xs font-black text-slate-800 leading-none">
                {currentUser.fullName}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {ROLE_LABELS[currentUser.role] || currentUser.role}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden 2xl:block" />
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-40 w-60 bg-white rounded-xl border border-slate-300 shadow-lg p-2 text-xs">
                <div className="px-3 py-2.5 border-b border-slate-200">
                  <div className="font-black text-slate-900">{currentUser.fullName}</div>
                  <div className="text-[11px] text-slate-500 font-mono">@{currentUser.username}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <Store className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {currentUser.outletId === 'all-outlets'
                        ? 'All Outlets (HQ)'
                        : outlets.find((o) => o.id === currentUser.outletId)?.name ||
                          'Unassigned Branch'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenUserProfile?.();
                  }}
                  className="w-full text-left px-3 py-2 mt-1 rounded-lg hover:bg-slate-50 flex items-center gap-2 font-bold text-slate-700 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Account &amp; Settings</span>
                </button>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 flex items-center gap-2 font-bold text-rose-600 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
