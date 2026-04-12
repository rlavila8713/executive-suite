import { AppSettings, Product, Transaction, Expense } from './types';

/** Offline placeholder when no photo is set (SVG data URL). */
export const PLACEHOLDER_PRODUCT_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
      <rect fill="#e6e8ea" width="400" height="500"/>
      <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#5a6173" font-family="system-ui,sans-serif" font-size="20">No image</text>
    </svg>`,
  );

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'main',
  storeName: 'The Editorial Executive',
  branch: 'Main Branch - Downtown',
  currency: 'USD ($)',
  taxRate: 8,
  darkMode: false,
  lowStockNotifications: true,
  managerName: 'Julian V.',
  managerTitle: 'Store Manager',
};

export const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Acoustic Pro Headset',
    sku: 'HEAD-PR-202',
    category: 'Electronics',
    price: 299.00,
    cost: 112.50,
    stock: 42,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '2',
    name: 'Chronograph Minimal',
    sku: 'WCH-MN-99',
    category: 'Accessories',
    price: 185.00,
    cost: 62.00,
    stock: 4,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '3',
    name: 'Urban Walker V2',
    sku: 'SHO-UR-312',
    category: 'Footwear',
    price: 120.00,
    cost: 48.00,
    stock: 0,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '4',
    name: 'Essential Cotton Tee',
    sku: 'APP-WHT-01',
    category: 'Apparel',
    price: 45.00,
    cost: 15.00,
    stock: 120,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '5',
    name: 'Executive Wool Blazer',
    sku: 'APP-NVY-92',
    category: 'Apparel',
    price: 295.00,
    cost: 95.00,
    stock: 15,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '6',
    name: 'Velocity Runner X1',
    sku: 'FTW-RED-05',
    category: 'Footwear',
    price: 120.00,
    cost: 45.00,
    stock: 8,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  }
];

const MOCK_TX_ANCHOR = 1_730_000_000_000;

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    orderNumber: '#88219',
    customer: 'Elena Rossi',
    amount: 189.00,
    status: 'completed',
    timestamp: '2 mins ago',
    type: 'sale',
    createdAt: MOCK_TX_ANCHOR + 3,
  },
  {
    id: '2',
    orderNumber: '#88218',
    customer: 'Marcus Thorne',
    amount: 45.50,
    status: 'completed',
    timestamp: '15 mins ago',
    type: 'sale',
    createdAt: MOCK_TX_ANCHOR + 2,
  },
  {
    id: '3',
    orderNumber: '#R-4412',
    customer: 'Sarah Jenkins',
    amount: -12.00,
    status: 'refunded',
    timestamp: '42 mins ago',
    type: 'return',
    createdAt: MOCK_TX_ANCHOR + 1,
  }
];

export const MOCK_EXPENSES: Expense[] = [
  { id: '1', title: 'Logistics & Shipping', amount: 142000, category: 'Operations', date: '2023-10-01' },
  { id: '2', title: 'Digital Marketing', amount: 84500, category: 'Marketing', date: '2023-10-05' },
  { id: '3', title: 'Personnel & Ops', amount: 210000, category: 'Payroll', date: '2023-10-10' }
];
