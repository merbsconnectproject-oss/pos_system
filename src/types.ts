export type OutletId = 'inco-hardware' | 'apex-electricals' | 'all-outlets';

export interface Outlet {
  id: OutletId;
  name: string;
  town: string;
  phone: string;
  address: string;
  receiptPrefix: string;
  managerName: string;
}

export interface SellingUnit {
  name: string;
  conversionFactor: number; // e.g. Metre = 1, Drum 100m = 100
  price: number;
  tradePrice?: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  outletId?: 'inco-hardware' | 'apex-electricals' | 'all-outlets'; // Dedicated store assignment
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
  barcode: string;
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
  outletId: 'inco-hardware' | 'apex-electricals';
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
  outletId: 'inco-hardware' | 'apex-electricals';
  productId: string;
  productName: string;
  type: 'RECEIPT' | 'SALE' | 'SALE_VOID' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'LOSS' | 'OPENING';
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
  totalPurchased: number;
  salesCount: number;
  discountRate?: number;
  notes?: string;
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
  outletId?: 'inco-hardware' | 'apex-electricals' | 'all-outlets';
  categorySupplied?: string;
}

export interface ShiftInfo {
  id: string;
  outletId: 'inco-hardware' | 'apex-electricals';
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

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity: string;
  outletName: string;
  details: string;
}

export type UserRole = 'super_admin' | 'branch_manager' | 'cashier' | 'storekeeper';

export interface UserAccount {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: UserRole;
  outletId: 'inco-hardware' | 'apex-electricals' | 'all-outlets';
  active: boolean;
  pinCode: string; // 4-digit manager or cashier PIN
  lastLogin?: string;
  avatarUrl?: string;
  mustChangePasswordOnNextLogin?: boolean; // State flag requiring password update on next login
  passwordResetAt?: string; // Timestamp when password was reset
  tempPassword?: string; // Latest temporary assigned password
}

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  category: 'pos' | 'inventory' | 'customers' | 'system';
}

export interface RolePermissions {
  role: UserRole;
  roleTitle: string;
  description: string;
  badgeColor: string;
  permissions: {
    // POS & Checkout
    canOpenTerminal: boolean;
    canApplyDiscount: boolean;
    canOverrideFloorPrice: boolean;
    canVoidSale: boolean;
    canProcessRefund: boolean;
    canBlindCloseShift: boolean;

    // Inventory & Catalog
    canViewCostPrices: boolean;
    canAddProducts: boolean;
    canEditPrices: boolean;
    canAdjustStock: boolean;
    canReceiveGoods: boolean;

    // Customers & Credit
    canCreateCustomer: boolean;
    canAssignCreditLimit: boolean;

    // Reports & System
    canViewExecutiveReports: boolean;
    canExportCsv: boolean;
    canViewAuditLogs: boolean;
    canModifySystemSettings: boolean;
  };
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
}
