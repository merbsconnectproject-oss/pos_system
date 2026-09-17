/**
 * Permission vocabulary — PRD §6.
 *
 * This module is the single source of truth for authorisation in the frontend and
 * is intended to be mirrored verbatim by the backend `permission.code` table.
 * NFR-9 requires the server to authorise every endpoint against these same codes,
 * so the strings below are a contract: do not rename one without changing both sides.
 */

export const PERMISSION_CODES = [
  // Selling
  'pos.sell',
  'sale.discount',
  'sale.approve_below_floor',
  'sale.void',
  'sale.refund',
  'sale.view_all',
  'sale.reprint',
  // Pricing
  'price.view_cost',
  'price.edit',
  // Catalogue
  'product.create',
  'product.edit',
  'product.import',
  // Stock
  'stock.view',
  'stock.receive',
  'stock.adjust',
  'stock.approve_adjustment',
  'stock.oversell',
  'stock.transfer',
  // Shifts and cash
  'shift.open',
  'shift.close',
  'cash.movement',
  'cash.view_variance',
  // Parties
  'customer.manage',
  'customer.credit',
  'supplier.manage',
  // Expenses & accounting
  'expense.view',
  'expense.manage',
  // Reporting
  'report.view',
  'report.view_profit',
  'report.view_pl',
  // Administration
  'user.manage',
  'audit.view',
  'outlet.view_all',
  'settings.general',
  'settings.appearance',
  'settings.terminal',
  'sync.push',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export type PermissionGroup =
  | 'Selling'
  | 'Pricing'
  | 'Catalogue'
  | 'Stock'
  | 'Cash & shifts'
  | 'Customers & suppliers'
  | 'Expenses & accounting'
  | 'Reporting'
  | 'Administration';

export interface PermissionMeta {
  code: PermissionCode;
  group: PermissionGroup;
  label: string;
  description: string;
}

export const PERMISSION_CATALOGUE: PermissionMeta[] = [
  { code: 'pos.sell', group: 'Selling', label: 'Use the point of sale', description: 'Open the till and complete sales.' },
  { code: 'sale.discount', group: 'Selling', label: 'Apply discounts', description: 'Discount a line or a cart, up to the role ceiling.' },
  { code: 'sale.approve_below_floor', group: 'Selling', label: 'Approve below-floor prices', description: 'Authorise a price beneath the product floor by PIN (BR-10).' },
  { code: 'sale.void', group: 'Selling', label: 'Void a sale', description: 'Reverse a completed sale, writing reversing movements (BR-3).' },
  { code: 'sale.refund', group: 'Selling', label: 'Refund a sale', description: 'Process returns and refunds against a receipt.' },
  { code: 'sale.view_all', group: 'Selling', label: 'View all sales', description: "See every cashier's transactions, not only your own." },
  { code: 'sale.reprint', group: 'Selling', label: 'Reprint receipts', description: 'Reprint a receipt with a REPRINT marker (FR-RCPT-06).' },

  { code: 'price.view_cost', group: 'Pricing', label: 'View cost prices', description: 'See cost, margin and valuation figures (FR-PRICE-07).' },
  { code: 'price.edit', group: 'Pricing', label: 'Edit prices', description: 'Change retail, trade and floor prices.' },

  { code: 'product.create', group: 'Catalogue', label: 'Create products', description: 'Add new items to the shared catalogue.' },
  { code: 'product.edit', group: 'Catalogue', label: 'Edit products', description: 'Amend product details, units, barcodes and categories.' },
  { code: 'product.import', group: 'Catalogue', label: 'Import catalogue', description: 'Bulk import products from a spreadsheet.' },

  { code: 'stock.view', group: 'Stock', label: 'View stock', description: 'See stock on hand and movement history.' },
  { code: 'stock.receive', group: 'Stock', label: 'Receive goods', description: 'Post goods receipts and recalculate average cost.' },
  { code: 'stock.adjust', group: 'Stock', label: 'Adjust stock', description: 'Correct quantities and record write-offs, with a reason.' },
  { code: 'stock.approve_adjustment', group: 'Stock', label: 'Approve adjustments', description: 'Authorise adjustments above the value threshold.' },
  { code: 'stock.oversell', group: 'Stock', label: 'Sell beyond stock', description: 'Proceed past a negative-stock block; flagged on exceptions (BR-9).' },
  { code: 'stock.transfer', group: 'Stock', label: 'Transfer stock', description: 'Move stock between outlets (Stage 3).' },

  { code: 'shift.open', group: 'Cash & shifts', label: 'Open a shift', description: 'Declare an opening float and begin trading.' },
  { code: 'shift.close', group: 'Cash & shifts', label: 'Close a shift', description: 'Submit a blind count and close the drawer.' },
  { code: 'cash.movement', group: 'Cash & shifts', label: 'Record cash movements', description: 'Bank, pay out or transfer float from the drawer.' },
  { code: 'cash.view_variance', group: 'Cash & shifts', label: 'View cash variance', description: 'See expected versus counted cash across shifts.' },

  { code: 'customer.manage', group: 'Customers & suppliers', label: 'Manage customers', description: 'Create and amend customer records.' },
  { code: 'customer.credit', group: 'Customers & suppliers', label: 'Manage customer credit', description: 'Set credit limits and take part payments (Stage 2).' },
  { code: 'supplier.manage', group: 'Customers & suppliers', label: 'Manage suppliers', description: 'Create and amend supplier records.' },

  { code: 'expense.view', group: 'Expenses & accounting', label: 'View expenses', description: 'See recorded operating expenses and their totals.' },
  { code: 'expense.manage', group: 'Expenses & accounting', label: 'Record expenses', description: 'Record, amend and delete operating expenses.' },

  { code: 'report.view', group: 'Reporting', label: 'View reports', description: 'Open the reporting workspace.' },
  { code: 'report.view_profit', group: 'Reporting', label: 'View profit reports', description: 'See revenue, COGS, gross profit and margin (FR-RPT-05).' },
  { code: 'report.view_pl', group: 'Reporting', label: 'View profit & loss', description: 'See the P&L: operating expenses and net profit, not only gross.' },

  { code: 'user.manage', group: 'Administration', label: 'Manage users', description: 'Create users, assign roles and outlets, reset credentials.' },
  { code: 'audit.view', group: 'Administration', label: 'View the audit log', description: 'Read the append-only activity record.' },
  { code: 'outlet.view_all', group: 'Administration', label: 'View all outlets', description: 'Select the combined "All outlets" scope (FR-OUT-05).' },
  { code: 'settings.general', group: 'Administration', label: 'Change general settings', description: 'Business profile, outlets, receipts, thresholds, backups.' },
  { code: 'settings.appearance', group: 'Administration', label: 'Change appearance', description: 'Set the accent colour (FR-SET-03).' },
  { code: 'settings.terminal', group: 'Administration', label: 'Change terminal settings', description: 'Printer, paper width and test print (FR-SET-05).' },
  { code: 'sync.push', group: 'Administration', label: 'Send trading to head office', description: "Send this shop's sales and stock up to the owner. One-way and audited; does not include pulling configuration." },
];

export const PERMISSION_GROUPS: PermissionGroup[] = [
  'Selling',
  'Pricing',
  'Catalogue',
  'Stock',
  'Cash & shifts',
  'Customers & suppliers',
  'Expenses & accounting',
  'Reporting',
  'Administration',
];

/** PRD §2.1 personas. Renamed from super_admin/branch_manager to match the PRD. */
export type UserRole = 'owner' | 'manager' | 'cashier' | 'storekeeper';

export const ROLE_ORDER: UserRole[] = ['owner', 'manager', 'cashier', 'storekeeper'];

/**
 * Default grants, transcribed from the PRD §6 matrix.
 * "own only" entries in the PRD are modelled as absent here and scoped at query time.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionCode[]> = {
  owner: [...PERMISSION_CODES],
  manager: [
    'pos.sell', 'sale.discount', 'sale.approve_below_floor', 'sale.void', 'sale.refund',
    'sale.view_all', 'sale.reprint',
    'price.view_cost', 'price.edit',
    'product.create', 'product.edit',
    'stock.view', 'stock.receive', 'stock.adjust', 'stock.approve_adjustment', 'stock.oversell',
    'shift.open', 'shift.close', 'cash.movement', 'cash.view_variance',
    'customer.manage', 'customer.credit', 'supplier.manage',
    'expense.view', 'expense.manage',
    'report.view', 'report.view_profit',
    'audit.view',
    'settings.appearance', 'settings.terminal',
    'sync.push',
  ],
  cashier: [
    'pos.sell', 'sale.discount', 'sale.reprint',
    'stock.view',
    'shift.open', 'shift.close',
    'customer.manage',
    // Closing up includes sending the day to the owner. One-way and audited,
    // so the counter can do it without an owner present.
    'sync.push',
  ],
  storekeeper: [
    'price.view_cost',
    'product.create', 'product.edit',
    'stock.view', 'stock.receive', 'stock.adjust',
    'supplier.manage',
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  storekeeper: 'Storekeeper',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Whole business, both outlets, combined or separately. Sets prices, permissions and settings.',
  manager: 'One outlet, operational. Approves below-floor prices and voids, closes the day, reviews control reports.',
  cashier: 'Counter selling and own shift. No cost prices, no profit, no reports.',
  storekeeper: 'Receives deliveries, records damage and adjustments, keeps stock figures trustworthy.',
};

export const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  manager: 'bg-sky-100 text-sky-700 border-sky-200',
  cashier: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  storekeeper: 'bg-amber-100 text-amber-700 border-amber-200',
};

/**
 * Per-user grants and revocations against the role baseline (FR-USER-03, screen J-07).
 * `true` grants a permission the role lacks; `false` revokes one the role has.
 */
export type PermissionOverrides = Partial<Record<PermissionCode, boolean>>;

/** A resolved, immutable answer to "what may this user do". */
export interface PermissionSet {
  has: (code: PermissionCode) => boolean;
  hasAny: (...codes: PermissionCode[]) => boolean;
  hasAll: (...codes: PermissionCode[]) => boolean;
  codes: PermissionCode[];
}

export function createPermissionSet(codes: Iterable<PermissionCode>): PermissionSet {
  const granted = new Set<PermissionCode>(codes);
  return {
    has: (code) => granted.has(code),
    hasAny: (...list) => list.some((code) => granted.has(code)),
    hasAll: (...list) => list.every((code) => granted.has(code)),
    codes: PERMISSION_CODES.filter((code) => granted.has(code)),
  };
}

/** Role baseline, then per-user overrides applied on top (BR-16 is enforced at the edit site). */
export function resolvePermissions(
  roleCodes: PermissionCode[],
  overrides?: PermissionOverrides,
): PermissionSet {
  const granted = new Set<PermissionCode>(roleCodes);
  if (overrides) {
    (Object.entries(overrides) as [PermissionCode, boolean][]).forEach(([code, isGranted]) => {
      if (isGranted) granted.add(code);
      else granted.delete(code);
    });
  }
  return createPermissionSet(granted);
}

export const NO_PERMISSIONS: PermissionSet = createPermissionSet([]);


/**
 * Navigation authorisation — one source of truth shared by the app shell and the
 * sidebar, so a tab can never be reachable while its nav entry is hidden (or the
 * reverse). Keys are the shell's tab ids; values are the permissions the screen
 * inventory lists in its Perm column. A tab absent from this map is unrestricted.
 */
export const TAB_PERMISSIONS: Partial<Record<string, PermissionCode[]>> = {
  analytics: ['report.view'],
  'outlet-comparison': ['report.view'],
  reports: ['report.view'],
  'sales-history': ['sale.view_all'],
  'returns-exchanges': ['sale.refund'],
  'cash-control': ['cash.view_variance', 'shift.close'],
  shifts: ['shift.open', 'shift.close'],
  // The expenses screen is its own right, not a side effect of being allowed to
  // move cash in a drawer. `cash.movement` was standing in for a code that did
  // not exist, which meant anyone who could bank the day's takings could also
  // read the rent and the payroll.
  expenses: ['expense.view'],
  installments: ['customer.credit'],
  products: ['stock.view'],
  'products-import': ['product.import'],
  'products-setup': ['product.edit'],
  'products-bulk-price': ['price.edit'],
  inventory: ['stock.view'],
  'inventory-low-stock': ['stock.view'],
  'inventory-valuation': ['report.view_profit'],
  'inventory-exceptions': ['report.view'],
  'inventory-count': ['stock.adjust'],
  'inventory-transfer': ['stock.transfer'],
  'goods-receipt': ['stock.receive'],
  'stock-movements': ['stock.view'],
  customers: ['customer.manage'],
  suppliers: ['supplier.manage'],
  'purchase-orders': ['supplier.manage'],
  'audit-log': ['audit.view'],
  settings: ['settings.general', 'settings.appearance', 'settings.terminal', 'user.manage',
    'sync.push'],
};

/** L-09: controls the user lacks permission for are absent, not disabled. */
export function canAccessTab(permissions: PermissionSet, tab: string): boolean {
  const required = TAB_PERMISSIONS[tab];
  if (!required) return true;
  return permissions.hasAny(...required);
}

/** True when at least one tab in a sidebar section is reachable. */
export function canAccessAnyTab(permissions: PermissionSet, tabs: string[]): boolean {
  return tabs.some((tab) => canAccessTab(permissions, tab));
}
