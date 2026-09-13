export type AppLocale = 'es' | 'en';

export type Screen =
  | 'dashboard'
  | 'products'
  | 'import'
  | 'categories'
  | 'subcategories'
  | 'locations'
  | 'cash'
  | 'reconciliation'
  | 'pos'
  | 'inventory'
  | 'expenses'
  | 'reports'
  | 'settings';

export type ProductStatus = 'active' | 'inactive' | 'pending';

export type UnitOfMeasure = 'unidad' | 'par' | 'caja' | 'paquete' | 'metro' | 'kg' | 'litro';

/** Product shelf categories (distinct from expense categories). */
export interface ProductCategory {
  id: string;
  name: string;
  code: string;
}

export interface ProductSubcategory {
  id: string;
  categoryId: string;
  name: string;
  code: string;
}

export interface ProductLocation {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  /** Data URL (e.g. image/png;base64,...) or built-in SVG placeholder — omitted from list when includeImages=false. */
  image: string;
  /** Relative API path to load the image over HTTP (mobile-friendly). Includes `?v=` content hash so clients refetch after a change. */
  imageUrl?: string | null;
  categoryId: string;
  subcategoryId: string;
  subcategory: string;
  status: ProductStatus;
  unitOfMeasure: UnitOfMeasure;
  locationId: string | null;
  barcode: string | null;
}

export interface CartItem extends Product {
  quantity: number;
}

/** How the customer paid (stored on each transaction for reporting). */
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

/** One line on a sale receipt (snapshot at checkout). */
export interface SaleReceiptLine {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Product row id when known (POS). Legacy receipts may omit — reports match by SKU. */
  productId?: string;
  /** Unit cost at sale time for COGS; legacy rows omit — reports use current product cost. */
  unitCostSnapshot?: number;
}

/** Store-style receipt stored on completed POS sales. */
export interface SaleReceipt {
  storeName: string;
  branch: string;
  /** Versioned API path for store logo at sale time (`/api/settings/logo?v=…`). */
  storeLogoUrl?: string;
  /** Display label (e.g. USD or $). */
  currency: string;
  lines: SaleReceiptLine[];
  subtotal: number;
  tax: number;
  /** Tax % used for this sale (0 when paid cash). */
  taxRatePercent: number;
  total: number;
  paymentMethod: PaymentMethod;
  /** Efectivo: importe entregado por el cliente. */
  amountPaid?: number;
  /** Efectivo: vuelto entregado (amountPaid - total). */
  changeGiven?: number;
  /** Operator assigned to the selling device at checkout (server-stamped). */
  operatorName?: string;
}

export interface Transaction {
  id: string;
  orderNumber: string;
  customer: string;
  amount: number;
  status: 'completed' | 'refunded' | 'pending' | 'reversed';
  timestamp: string;
  type: 'sale' | 'return';
  /** Used for ordering in the local database (newest first). */
  createdAt: number;
  /** Original sale id when this is an immutable return/reversal movement. */
  sourceSaleId?: string;
  /** Set for POS sales: printable ticket data. */
  receipt?: SaleReceipt;
  /**
   * Payment channel for reporting. If omitted (legacy), derived from `receipt.paymentMethod` when present.
   */
  paymentMethod?: PaymentMethod;
  /** Seller assigned to the terminal that created this sale (immutable snapshot). */
  operatorName?: string;
  /** Device id that created this sale (audit). */
  sourceDeviceId?: string;
}

/** Optional cash drawer session for reconciliation (Cash reports tab). */
export type CashAnomalyKind = 'cash_shortfall' | 'cash_surplus' | 'drawer_variance';

export interface CashAnomaly {
  kind: CashAnomalyKind;
  expectedCash: number;
  closingCash: number;
  cashSales: number;
  variance: number;
}

export interface CashSession {
  id: string;
  openedAt: number;
  closedAt: number | null;
  openingCash: number;
  closingCash: number | null;
  /** Filled when session is closed: sum of completed sale amounts in range with this payment method. */
  totalCashSales: number;
  totalCardSales: number;
  totalTransferSales: number;
  totalOtherSales: number;
  expectedCash?: number | null;
  cashVariance?: number | null;
  anomalies?: CashAnomaly[];
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  /** System-generated expenses (e.g. license payments) cannot be edited or deleted. */
  locked?: boolean;
}

export type LicensePlanId = 'monthly' | 'quarterly' | 'annual';

export type LicenseStatus = 'trial' | 'active' | 'expired' | 'device_mismatch';

export interface LicensePlan {
  id: LicensePlanId;
  name: string;
  price: number;
  days: number;
}

export interface LicenseInfo {
  status: LicenseStatus;
  planId: LicensePlanId | null;
  trialStartedAt: number;
  trialEndsAt: number;
  trialDaysRemaining: number;
  paidUntil: number | null;
  deviceRegistered: boolean;
  deviceId: string | null;
  plans: LicensePlan[];
}

export type LicenseRequestPayload = {
  v: 1;
  deviceId: string;
  planId: LicensePlanId;
  storeName: string;
  branch: string;
  requestedAt: number;
};

export type ConnectedClientKind = 'mobile' | 'web' | 'unknown';

export interface ConnectedDevice {
  deviceId: string;
  clientKind: ConnectedClientKind;
  userAgent: string;
  firstSeenAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
  /** Display name assigned by the store (not editable from the mobile app). */
  operatorName: string;
  online: boolean;
  isCurrent: boolean;
}

/** Single-row app configuration stored locally (IndexedDB). */
export interface AppSettings {
  id: 'main';
  storeName: string;
  branch: string;
  currency: string;
  /** Percent applied to the cart total only for bank transfers (not cash or online). */
  taxRate: number;
  /**
   * Payload encoded in the POS “Pago en línea” QR (payment URL, wallet id, etc.).
   * Generated locally; no tax is added for this method.
   */
  cardQrPayload: string;
  transferBank: string;
  transferAccountHolder: string;
  transferAccountNumber: string;
  /** National 8-digit phone for Transfermóvil (no +53). */
  transferPhoneNumber: string;
  /** Optional extra lines (not encoded in the Transfermóvil QR). */
  transferQrExtra: string;
  /** Versioned API path when a store logo is set; null otherwise. */
  storeLogoUrl: string | null;
  /** Raw data URL — sent on PATCH to upload or clear the logo. */
  storeLogo?: string;
  darkMode: boolean;
  lowStockNotifications: boolean;
  managerName: string;
  managerTitle: string;
  /** UI language; persisted locally. */
  locale: AppLocale;
}

export type CheckoutPayload = {
  customerName: string;
  /** Grand total charged (including tax). */
  amount: number;
  receipt: SaleReceipt;
};
