export type Screen = 'dashboard' | 'products' | 'pos' | 'inventory' | 'expenses' | 'reports' | 'settings';

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
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Transaction {
  id: string;
  orderNumber: string;
  customer: string;
  amount: number;
  status: 'completed' | 'refunded' | 'pending';
  timestamp: string;
  type: 'sale' | 'return';
  /** Used for ordering in the local database (newest first). */
  createdAt: number;
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
  taxRate: number;
  darkMode: boolean;
  lowStockNotifications: boolean;
  managerName: string;
  managerTitle: string;
}

export type CheckoutPayload = {
  customerName: string;
  /** Grand total charged (including tax). */
  amount: number;
};
