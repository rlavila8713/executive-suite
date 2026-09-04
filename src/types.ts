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
  /** Data URL (e.g. image/png;base64,...) or built-in SVG placeholder — local only, no remote URLs. */
  image: string;
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
  /** Set for POS sales: printable ticket data. */
  receipt?: SaleReceipt;
  /**
   * Payment channel for reporting. If omitted (legacy), derived from `receipt.paymentMethod` when present.
   */
  paymentMethod?: PaymentMethod;
}

/** Optional cash drawer session for reconciliation (Cash reports tab). */
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
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
}

/** Single-row app configuration stored locally (IndexedDB). */
export interface AppSettings {
  id: 'main';
  storeName: string;
  branch: string;
  currency: string;
  /** Percent applied to the cart total only when the customer pays by card (not cash). */
  taxRate: number;
  /**
   * Plain text encoded in the POS “Card” QR (e.g. store card number, payment link, or terminal ID).
   * Shown when the cashier taps Card; generated locally, no external service.
   */
  cardQrPayload: string;
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
