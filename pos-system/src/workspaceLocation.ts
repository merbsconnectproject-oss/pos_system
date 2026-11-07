export interface WorkspaceLocation {
  activeTab: string;
  posOpen: boolean;
}

const DEFAULT_LOCATION: WorkspaceLocation = { activeTab: 'dashboard', posOpen: false };

/** Only real workspaces are restorable; errors and permission-denied screens are transient. */
export const RESTORABLE_WORKSPACE_TABS = new Set([
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
  'purchase-orders',
  'stock-movements',
  'sales-history',
  'customers',
  'suppliers',
  'audit-log',
  'expenses',
  'installments',
  'returns-exchanges',
  'settings',
]);

export const workspaceLocationKey = (userId: string) => `radiance-pos:workspace:${userId}`;

export function encodeWorkspaceLocation(activeTab: string, posOpen: boolean): string {
  return JSON.stringify({
    activeTab: RESTORABLE_WORKSPACE_TABS.has(activeTab) ? activeTab : 'dashboard',
    posOpen,
  });
}

export function decodeWorkspaceLocation(
  stored: string | null,
  canAccess: (tab: string) => boolean,
  canOpenPos: boolean,
): WorkspaceLocation {
  if (!stored) return DEFAULT_LOCATION;
  try {
    const value = JSON.parse(stored) as Partial<WorkspaceLocation>;
    const requestedTab = typeof value.activeTab === 'string' ? value.activeTab : 'dashboard';
    const activeTab = RESTORABLE_WORKSPACE_TABS.has(requestedTab) && canAccess(requestedTab)
      ? requestedTab
      : 'dashboard';
    return { activeTab, posOpen: value.posOpen === true && canOpenPos };
  } catch {
    return DEFAULT_LOCATION;
  }
}
