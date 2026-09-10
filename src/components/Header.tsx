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
  LockKeyhole,
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
  onLockSession?: () => void;
  canOpenTerminal: boolean;
  canModifySystemSettings: boolean;
  canAddProducts: boolean;
  canCreateCustomer: boolean;
  canReceiveGoods: boolean;
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
  onLockSession,
  canOpenTerminal,
  canModifySystemSettings,
  canAddProducts,
  canCreateCustomer,
  canReceiveGoods,
}) => {
  const [outletDropdownOpen, setOutletDropdownOpen] = useState(false);
  const [addNewDropdownOpen, setAddNewDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const accessibleOutlets = currentUser.outletId === 'all-outlets'
    ? outlets
    : outlets.filter((outlet) => outlet.id === currentUser.outletId);

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
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* LEFT: Mobile Menu, Brand, Desktop Toggle & Search */}
      <div className="flex items-center gap-4">
        {/* Mobile Hamburger Button */}
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Open Menu"
        >
          <Menu className="w-6 h-6 shrink-0" strokeWidth={2} />
        </button>

        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black text-sm shrink-0">
            <svg
              className="w-6 h-6 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>

          <div className="flex flex-col leading-none">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black tracking-tight text-slate-900">Radiance</span>
              <span className="text-xs font-bold uppercase text-orange-600 tracking-wider px-2 py-0.5 rounded bg-orange-50 border border-orange-200">
                POS
              </span>
            </div>
            <span className="text-xs font-medium text-slate-400 mt-1 hidden sm:inline">
              Multi-Outlet Retail OS
            </span>
          </div>
        </div>

        {/* Desktop Sidebar Collapse Toggle Button */}
        <button
          onClick={onToggleSidebar}
          className="hidden md:flex w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 items-center justify-center transition-all cursor-pointer shrink-0"
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-6 h-6 shrink-0 text-slate-600" strokeWidth={2} />
          ) : (
            <ChevronLeft className="w-6 h-6 shrink-0 text-slate-600" strokeWidth={2} />
          )}
        </button>

        {/* Search Bar Trigger */}
        <div
          onClick={onOpenSearch}
          className="hidden lg:flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 w-64 xl:w-72 cursor-pointer text-slate-400 text-xs transition-all"
        >
          <Search className="w-6 h-6 shrink-0 text-slate-400" strokeWidth={2} />
          <span className="flex-1 text-slate-500 font-medium truncate">
            Search electricals, SKU...
          </span>
          <kbd className="text-xs font-mono font-bold bg-white text-slate-500 border border-slate-200 px-2 py-0.5 rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* RIGHT: Active Outlet Switcher, Actions, POS, Live Clock & Profile */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Live POS Clock */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs font-mono">
          <Clock className="w-6 h-6 shrink-0 text-orange-500 animate-pulse" strokeWidth={2} />
          <span className="font-bold">{currentTime || '08:00:00 AM'}</span>
        </div>

        {/* Active Outlet Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setOutletDropdownOpen(!outletDropdownOpen);
              setAddNewDropdownOpen(false);
            }}
            className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0"></span>
            <Store className="w-6 h-6 shrink-0 text-slate-500" strokeWidth={2} />
            <span className="max-w-[85px] sm:max-w-[130px] truncate">{currentOutlet.name}</span>
            <ChevronDown className="w-6 h-6 shrink-0 text-slate-500" strokeWidth={2} />
          </button>

          {outletDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl z-50 py-2 divide-y divide-slate-200">
              <div className="px-4 py-2 text-xs font-bold uppercase text-slate-400 tracking-wider">
                Select Active Branch
              </div>
              <div className="p-2 space-y-1">
                {accessibleOutlets.map((outlet) => (
                  <button
                    key={outlet.id}
                    onClick={() => {
                      onSelectOutlet(outlet.id);
                      setOutletDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      currentOutlet.id === outlet.id
                        ? 'bg-orange-50 text-orange-600 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-bold">{outlet.name}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {outlet.town} • {outlet.receiptPrefix}
                      </div>
                    </div>
                    {currentOutlet.id === outlet.id && (
                      <Check className="w-6 h-6 shrink-0 text-orange-500" strokeWidth={2} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick 'Add New' Dropdown */}
        {canAddProducts || canCreateCustomer || canReceiveGoods || canOpenTerminal ? <div className="relative">
          <button
            onClick={() => {
              setAddNewDropdownOpen(!addNewDropdownOpen);
              setOutletDropdownOpen(false);
            }}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer"
          >
            <Plus className="w-6 h-6 shrink-0" strokeWidth={2} />
            <span className="hidden sm:inline">Add New</span>
          </button>

          {addNewDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl z-50 p-2 text-xs text-slate-700 font-medium">
              {canAddProducts && <button
                onClick={() => {
                  onOpenAddNew('product');
                  setAddNewDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between cursor-pointer"
              >
                <span>+ Add Product</span>
              </button>}
              {canCreateCustomer && <button
                onClick={() => {
                  onOpenAddNew('customer');
                  setAddNewDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between cursor-pointer"
              >
                <span>+ Register Customer</span>
              </button>}
              {canReceiveGoods && <button
                onClick={() => {
                  onOpenAddNew('supplier');
                  setAddNewDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between cursor-pointer"
              >
                <span>+ Add Supplier</span>
              </button>}
              {canOpenTerminal && <button
                onClick={() => {
                  onOpenAddNew('shift');
                  setAddNewDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-600 flex items-center justify-between cursor-pointer"
              >
                <span>+ Cash Drawer / Shift</span>
              </button>}
            </div>
          )}
        </div> : null}

        {/* Big POS Terminal Button */}
        {canOpenTerminal && <button
          onClick={onOpenPos}
          className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white text-xs font-black px-4 py-2 rounded-lg transition-all cursor-pointer"
          title="Launch Fullscreen POS Terminal (F2)"
        >
          <Monitor className="w-6 h-6 shrink-0 text-orange-400" strokeWidth={2} />
          <span>POS</span>
          <span className="hidden md:inline text-xs bg-white/10 text-orange-300 font-mono px-1.5 py-0.5 rounded">
            F2
          </span>
        </button>}

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

        {/* Fullscreen Button */}
        {canModifySystemSettings && <button
          onClick={handleFullscreen}
          className="w-8 h-8 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-100 items-center justify-center text-slate-500 hover:text-slate-800 transition-colors hidden md:flex cursor-pointer"
          title="Toggle Fullscreen Mode"
        >
          <Maximize2 className="w-6 h-6 shrink-0" strokeWidth={2} />
        </button>}

        {/* Settings Drawer Button */}
        {canModifySystemSettings && <button
          onClick={onOpenSettings}
          className="w-8 h-8 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          title="System Settings & Appearance"
        >
          <Settings className="w-6 h-6 shrink-0" strokeWidth={2} />
        </button>}

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
                className="w-8 h-8 rounded-lg object-cover border border-slate-200"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border-2 border-white rounded-full"></span>
            </div>
            <div className="hidden 2xl:flex flex-col text-left">
              <span className="text-xs font-bold text-slate-800 leading-none">
                {currentUser.fullName}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {ROLE_LABELS[currentUser.role] || currentUser.role}
              </span>
            </div>
            <ChevronDown className="w-6 h-6 shrink-0 text-slate-400 hidden 2xl:block" strokeWidth={2} />
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-40 w-64 bg-white rounded-xl border border-slate-200 p-2 text-xs">
                <div className="px-4 py-3 border-b border-slate-200">
                  <div className="font-black text-slate-900">{currentUser.fullName}</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">@{currentUser.username}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <Store className="w-6 h-6 shrink-0 text-slate-400" strokeWidth={2} />
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
                  className="w-full text-left px-4 py-2 mt-1 rounded-lg hover:bg-slate-50 flex items-center gap-2 font-bold text-slate-700 cursor-pointer"
                >
                  <User className="w-6 h-6 shrink-0 text-slate-400" strokeWidth={2} />
                  <span>Account &amp; Settings</span>
                </button>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLockSession?.();
                  }}
                  className="w-full text-left px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 font-bold text-slate-700 cursor-pointer"
                >
                  <LockKeyhole className="w-6 h-6 shrink-0 text-slate-400" strokeWidth={2} />
                  <span>Lock screen</span>
                </button>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full text-left px-4 py-2 rounded-lg hover:bg-rose-50 flex items-center gap-2 font-bold text-rose-600 cursor-pointer"
                >
                  <LogOut className="w-6 h-6 shrink-0" strokeWidth={2} />
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
