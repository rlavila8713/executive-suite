export type Screen = 'dashboard' | 'products' | 'pos' | 'inventory' | 'expenses' | 'reports' | 'settings';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
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
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
}

export interface StoreConfig {
  name: string;
  branch: string;
  currency: string;
  taxRate: number;
}
