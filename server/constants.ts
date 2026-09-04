/** Server-side seed data (mirrors src/constants.ts). */

export const PLACEHOLDER_PRODUCT_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
      <rect fill="#e6e8ea" width="400" height="500"/>
      <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#5a6173" font-family="system-ui,sans-serif" font-size="20">No image</text>
    </svg>`,
  );

export const DEFAULT_PRODUCT_CATEGORY_NAMES = ['Apparel', 'Footwear', 'Accessories', 'Electronics'] as const;

export const DEFAULT_APP_SETTINGS = {
  id: 'main' as const,
  storeName: 'The Editorial Executive',
  branch: 'Main Branch - Downtown',
  currency: 'USD ($)',
  taxRate: 8,
  cardQrPayload: '',
  darkMode: false,
  lowStockNotifications: true,
  managerName: 'Julian V.',
  managerTitle: 'Store Manager',
  locale: 'es' as const,
};

const MOCK_TX_ANCHOR = 1_730_000_000_000;

export const MOCK_PRODUCTS = [
  {
    id: '1',
    name: 'Acoustic Pro Headset',
    sku: 'HEAD-PR-202',
    category: 'Electronics',
    price: 299.0,
    cost: 112.5,
    stock: 42,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '2',
    name: 'Chronograph Minimal',
    sku: 'WCH-MN-99',
    category: 'Accessories',
    price: 185.0,
    cost: 62.0,
    stock: 4,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '3',
    name: 'Urban Walker V2',
    sku: 'SHO-UR-312',
    category: 'Footwear',
    price: 120.0,
    cost: 48.0,
    stock: 0,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '4',
    name: 'Essential Cotton Tee',
    sku: 'APP-WHT-01',
    category: 'Apparel',
    price: 45.0,
    cost: 15.0,
    stock: 120,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '5',
    name: 'Executive Wool Blazer',
    sku: 'APP-NVY-92',
    category: 'Apparel',
    price: 295.0,
    cost: 95.0,
    stock: 15,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
  {
    id: '6',
    name: 'Velocity Runner X1',
    sku: 'FTW-RED-05',
    category: 'Footwear',
    price: 120.0,
    cost: 45.0,
    stock: 8,
    image: PLACEHOLDER_PRODUCT_IMAGE,
  },
];

export const MOCK_TRANSACTIONS = [
  {
    id: '1',
    orderNumber: '#88219',
    customer: 'Elena Rossi',
    amount: 189.0,
    status: 'completed' as const,
    timestamp: '2 mins ago',
    type: 'sale' as const,
    createdAt: MOCK_TX_ANCHOR + 3,
    paymentMethod: 'cash' as const,
    receipt: {
      storeName: DEFAULT_APP_SETTINGS.storeName,
      branch: DEFAULT_APP_SETTINGS.branch,
      currency: DEFAULT_APP_SETTINGS.currency,
      lines: [
        {
          name: 'Executive Wool Blazer',
          sku: 'APP-NVY-92',
          quantity: 1,
          unitPrice: 189,
          lineTotal: 189,
          productId: '5',
          unitCostSnapshot: 95,
        },
      ],
      subtotal: 189,
      tax: 0,
      taxRatePercent: 0,
      total: 189,
      paymentMethod: 'cash' as const,
    },
  },
  {
    id: '2',
    orderNumber: '#88218',
    customer: 'Marcus Thorne',
    amount: 45.5,
    status: 'completed' as const,
    timestamp: '15 mins ago',
    type: 'sale' as const,
    createdAt: MOCK_TX_ANCHOR + 2,
    paymentMethod: 'card' as const,
    receipt: {
      storeName: DEFAULT_APP_SETTINGS.storeName,
      branch: '',
      currency: DEFAULT_APP_SETTINGS.currency,
      lines: [
        {
          name: 'Chronograph Minimal',
          sku: 'WCH-MN-99',
          quantity: 1,
          unitPrice: 40.0,
          lineTotal: 40.0,
          productId: '2',
          unitCostSnapshot: 62,
        },
        {
          name: 'Essential Cotton Tee',
          sku: 'APP-WHT-01',
          quantity: 1,
          unitPrice: 5.5,
          lineTotal: 5.5,
          productId: '4',
          unitCostSnapshot: 15,
        },
      ],
      subtotal: 45.5,
      tax: 0,
      taxRatePercent: 0,
      total: 45.5,
      paymentMethod: 'card' as const,
    },
  },
  {
    id: '3',
    orderNumber: '#R-4412',
    customer: 'Sarah Jenkins',
    amount: -12.0,
    status: 'refunded' as const,
    timestamp: '42 mins ago',
    type: 'return' as const,
    createdAt: MOCK_TX_ANCHOR + 1,
    paymentMethod: 'other' as const,
  },
];

export const MOCK_EXPENSES = [
  { id: '1', title: 'Logistics & Shipping', amount: 142000, category: 'Operations', date: '2023-10-01' },
  { id: '2', title: 'Digital Marketing', amount: 84500, category: 'Marketing', date: '2023-10-05' },
  { id: '3', title: 'Personnel & Ops', amount: 210000, category: 'Payroll', date: '2023-10-10' },
];
