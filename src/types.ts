import type { PermissionCode, PermissionOverrides, UserRole } from './permissions';

export type { PermissionCode, PermissionOverrides, UserRole };

/**
 * Outlet identifiers are plain slugs so that administrators can register new
 * branches at runtime (Settings → Stores & Branches). The seeded stores use
 * 'inco-hardware', 'apex-electricals', 'radiance-lighting'; 'all-outlets' is
 * the reserved enterprise-wide scope.
 */
export type OutletId = string;

export interface Outlet {
  id: OutletId;
  name: string;
  town: string;
  phone: string;
  address: string;
  receiptPrefix: string;
  managerName: string;
  active?: boolean;
  createdAt?: string;
}

export interface SellingUnit {
  name: string;
  conversionFactor: number; // e.g. Metre = 1, Drum 100m = 100
  price: number;
  tradePrice?: number;
}

/**
 * FR-PROD-03/04: a product may carry several barcodes, and each is bound to one
 * selling unit — so scanning the carton code adds a full carton, not one piece.
 * `code` is unique system-wide; `unitName` matches a SellingUnit.name, or the
 * product's baseUnit when the code identifies a single base unit.
 */
export interface ProductBarcode {
  code: string;
  unitName: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  outletId?: OutletId; // Dedicated store assignment
  category:
    | 'Power Tools & Machinery'
    | 'Hand Tools & Hardware'
    | 'Plumbing & Sanitary'
    | 'Paints & Adhesives'
    | 'Fasteners & Fixings'
    | 'Building & Site Safety'
    | 'Cables & Wires'
    | 'Switches & Sockets'
    | 'Protection & Breakers'
    | 'Conduits & Trunking'
    | 'Lighting & Lamps'
    | 'Solar & Inverters'
    | 'Hardware & Tools'
    | 'Plumbing & Pipes';
  brand: string;
  barcodes: ProductBarcode[]; // FR-PROD-03: many per product, each bound to a unit
  baseUnit: 'm' | 'pcs' | 'length' | 'roll' | 'box' | 'kg' | 'bucket' | 'tin' | 'set' | 'pair';
  sellingUnits?: SellingUnit[];
  retailPrice: number;
  tradePrice: number;
  floorPrice: number; // Minimum allowable price without manager PIN (BR-10)
  costPrice: Record<string, number>; // Weighted average cost per outlet (BR-4)
  stock: Record<string, number>; // Stock held per outlet (BR-1, BR-12)
  minStockAlert: Record<string, number>;
  imageUrl: string;
  salesCount?: number;
  active: boolean; // Deactivation, not deletion (BR-17)
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedUnit: string;
  conversionFactor: number;
  unitPrice: number;
  frozenCostPrice: number; // BR-5: frozen cost at moment of sale
  discount: number;
  lineTotal: number;
  floorPriceApproved?: boolean;
  floorPriceApprover?: string;
  /**
   * BR-10: the approver's id, which is what the server verifies. The name
   * above is for the line on screen; sending it as the approver would name a
   * person the server cannot look up.
   */
  floorPriceApproverId?: string;
  /** FR-POS-10: who approved a discount past the seller's ceiling. */
  discountApprover?: string;
  discountApproverId?: string;
}

export type PaymentMethod = 'cash' | 'momo' | 'card' | 'transfer';

export interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
  provider?: 'MTN MoMo' | 'Telecel Cash' | 'AT Money' | 'Visa/Mastercard' | 'Bank Transfer';
  reference?: string;
  verified?: boolean;
}

export type PaymentSplit = PaymentEntry;

export interface CompletedSale {
  id: string; // UUID (BR-7)
  receiptNumber: string; // e.g. INC-01-004312 (BR-6)
  outletId: OutletId;
  outletName: string;
  terminalId: string;
  cashierName: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerType: 'retail' | 'electrician' | 'contractor' | 'company';
  items: CartItem[];
  subtotal: number;
  discountTotal: number;
  total: number;
  payments: PaymentEntry[];
  changeDue: number;
  createdAt: string;
  status: 'COMPLETED' | 'VOIDED'; // BR-3
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
}

export interface StockMovement {
  id: string;
  timestamp: string;
  outletId: OutletId;
  productId: string;
  productName: string;
  type: 'RECEIPT' | 'SALE' | 'SALE_VOID' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'LOSS' | 'OPENING' | 'CUSTOMER_RETURN' | 'EXCHANGE_SWAP';
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost?: number;
  referenceNumber?: string;
  reason?: string;
  user: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string; // Primary lookup (FR-CUST-03)
  customerType: 'retail' | 'electrician' | 'contractor' | 'company';
  /** FR-CUST-06: computed from their sales by the server, never stored. */
  totalPurchased: number;
  salesCount: number;
  discountRate?: number;
  notes?: string;
  /** FR-CUST-02: the form already asks for these; the record now keeps them. */
  email?: string;
  address?: string;
  /** BR-17: deactivated, never deleted — they are on receipts already printed. */
  active?: boolean;
  /** FR-CUST-04: which of the product's prices applies. Decided by the server. */
  priceLevel?: 'RETAIL' | 'TRADE';
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  paymentTerms: 'Cash on Delivery' | 'Net 14' | 'Net 30' | 'Advance';
  address: string;
  totalSupplied: number;
  outletId?: OutletId; // 'all-outlets' for a supplier serving every branch
  categorySupplied?: string;
}

export interface ShiftInfo {
  id: string;
  outletId: OutletId;
  terminalId: string;
  cashier: string;
  isOpen: boolean;
  openedAt: string;
  openingFloat: number; // BR-14
  expectedCash: number; // Opening + cash sales - cash voids
  countedCash?: number;
  variance?: number;
  varianceNote?: string;
  closedAt?: string;
}

/**
 * PRD §7.4 `cash_movement`. Money into or out of the drawer during a shift.
 * Deliberately NOT a StockMovement: BR-2 requires stock level to equal the sum
 * of its stock movements, which a cash payout must never contribute to.
 */
export type CashMovementDirection = 'in' | 'out';

export type CashMovementReason =
  | 'Banking'
  | 'Owner drawing'
  | 'Supplier payment'
  | 'Float transfer'
  | 'Petty cash'
  | 'Correction';

export interface CashMovement {
  id: string;
  shiftId: string;
  outletId: OutletId;
  direction: CashMovementDirection;
  amount: number; // GHS major units at the UI boundary; pesewas on the wire (BR-11)
  reasonCode: CashMovementReason;
  note?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * PRD §7.4 `shift`. A shift is one cashier's session on one terminal, from float
 * declaration to blind count. Closed shifts are never reopened (FR-CASH-09);
 * corrections are made with a separate cash movement.
 */
export interface ShiftRecord {
  id: string;
  outletId: OutletId;
  outletName: string;
  terminalId: string;
  cashier: string;
  openingFloat: number;
  openedAt: string;
  closedAt?: string;
  salesTotal: number;
  /** Takings by method, for reconciliation against statements (FR-CASH-07). */
  takingsByMethod: Partial<Record<PaymentMethod, number>>;
  expectedCash: number;
  countedCash?: number;
  variance?: number;
  varianceNote?: string;
  status: 'open' | 'closed';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity: string;
  outletName: string;
  details: string;
}

export interface UserAccount {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: UserRole;
  outletId: OutletId; // Branch assignment, or 'all-outlets' for enterprise scope
  active: boolean;
  pinCode: string; // 4-digit manager or cashier PIN
  lastLogin?: string;
  avatarUrl?: string;
  mustChangePasswordOnNextLogin?: boolean; // State flag requiring password update on next login
  passwordResetAt?: string; // Timestamp when password was reset
  tempPassword?: string; // Latest temporary assigned password
  password?: string; // Standing sign-in credential
  /** FR-USER-03 / screen J-07: grants and revocations against the role baseline. */
  permissionOverrides?: PermissionOverrides;
  /** Resolved by the API. UI hiding uses this; the server remains authoritative. */
  effectivePermissions?: PermissionCode[];
  /** UUID/code pairs retained for server-backed outlet switching. */
  serverOutlets?: Array<{ id: string; code: string; name: string; localId: OutletId }>;
}

/**
 * The role baseline. `permissions` holds PRD §6 permission codes; a user's
 * effective set is this list with their own overrides applied on top — see
 * resolvePermissions() in ./permissions.
 */
export interface RolePermissions {
  role: UserRole;
  roleTitle: string;
  description: string;
  badgeColor: string;
  permissions: PermissionCode[];
}

/**
 * K-08 / FR-SET-06: operational thresholds. These are the values BR-10, FR-INV-06
 * and FR-CASH-06 read, so they are configuration rather than hard-coded constants.
 */
export interface OperationalThresholds {
  /** FR-AUTH-05: minutes of inactivity before the session locks. */
  idleLockMinutes: number;
  /** FR-INV-06: adjustments above this value need stock.approve_adjustment. */
  adjustmentApprovalValue: number;
  /** FR-CASH-06: variance beyond this needs a written explanation. */
  cashVarianceExplain: number;
  /** FR-POS-10: the discount ceiling each role may apply without approval. */
  discountCeilingByRole: Record<UserRole, number>;
}

export interface GeneralSettings {
  companyName: string;
  taxRegistrationNumber: string;
  taxEnabled: boolean;
  taxRatePercent: number;
  currencySymbol: string;
  currencyCode: string;
  cashRounding: 'exact' | '0.10' | '0.50';
  managerPin: string;
  enforceFloorPricePin: boolean;
  enforceVoidPin: boolean;
  enforceBlindShiftCount: boolean;
  receiptPrinterWidth: '80mm' | '58mm';
  receiptHeaderMessage: string;
  receiptFooterPolicy: string;
  autoPrintReceipt: boolean;
  showCashierOnReceipt: boolean;
  accentColor: string;
  thresholds: OperationalThresholds;
}

// ==========================================
// 1. ACCOUNTING & EXPENSE MODULE TYPES
// ==========================================
export type ExpenseCategory =
  | 'Rent & Lease'
  | 'Utilities & Power'
  | 'Staff & Payroll'
  | 'Delivery & Haulage'
  | 'Advertising & Marketing'
  | 'Maintenance & Repairs'
  | 'Packaging & Bags'
  | 'Taxes, Levies & Licenses'
  | 'Office & Communication'
  | 'Miscellaneous';

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  title: string;
  description?: string;
  amount: number;
  outletId: OutletId;
  outletName: string;
  payee: string;
  paymentMethod: 'Cash (Drawer)' | 'Mobile Money' | 'Bank Transfer' | 'Cheque' | 'Corporate Card';
  referenceNumber?: string;
  taxDeductible: boolean;
  recordedBy: string;
  status: 'PAID' | 'PENDING';
}

// ==========================================
// 2. CUSTOMER INSTALLMENT PLANS (PAY IN INSTALLMENTS)
// ==========================================
export interface InstallmentScheduleItem {
  installmentNumber: number;
  dueDate: string;
  expectedAmount: number;
  paidAmount: number;
  paidDate?: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL';
  receiptNumber?: string;
}

export interface CustomerInstallmentPlan {
  id: string;
  planNumber: string; // e.g. INST-2026-001
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerTier: 'retail' | 'electrician' | 'contractor' | 'company';
  outletId: OutletId;
  outletName: string;
  saleId?: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  totalAmount: number;
  downPayment: number;
  remainingBalance: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  installmentCount: number;
  startDate: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  schedule: InstallmentScheduleItem[];
  notes?: string;
  createdAt: string;
}

// ==========================================
// 3. RETURNS & EXCHANGES / SWAPPING GOODS
// ==========================================
export type ReturnReason =
  | 'Defective / Faulty Item'
  | 'Wrong Specification / Color'
  | 'Customer Changed Mind'
  | 'Excess Project Quantity'
  | 'Warranty Claim / Burnt'
  | 'Warranty Claim';

export type ReturnDisposition = 'RESTOCK' | 'DAMAGED_WRITE_OFF' | 'SUPPLIER_RMA';

export interface ReturnItemDetail {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  reason: ReturnReason;
  disposition: ReturnDisposition;
  conditionNotes?: string;
}

export type ReturnedItemDetail = ReturnItemDetail;

export interface SwapReplacementItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type SwappedItemDetail = SwapReplacementItem;

export interface ReturnExchangeRecord {
  id: string;
  referenceNumber: string; // e.g. RET-2026-001 or SWAP-2026-001
  type: 'RETURN_REFUND' | 'EXCHANGE_SWAP';
  originalReceiptNumber: string;
  originalSaleId?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  outletId: OutletId;
  outletName: string;
  cashierName: string;
  timestamp: string;
  returnedItems: ReturnItemDetail[];
  swappedItems: SwapReplacementItem[];
  returnedSubtotal: number;
  swappedSubtotal: number;
  netDifference: number; // positive: customer pays extra; negative: store refunds customer; 0: even swap
  settlementMethod: 'Cash' | 'Mobile Money' | 'Store Credit Voucher' | 'Even Swap' | 'Bank Transfer';
  settlementStatus: 'SETTLED' | 'PENDING';
  notes?: string;
}
