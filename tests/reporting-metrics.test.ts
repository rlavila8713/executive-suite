import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { netSalesRevenueInRange, paymentMethodBreakdown, profitGrossInRange, salesIncentiveBaseAmount, salesIncentiveDistribution, salesIncentivePoolAmount } from '../src/lib/reporting.ts';
import type { Product, Transaction } from '../src/types.ts';

const range = { start: 0, end: 1_000_000_000_000 };
const product: Product = {
  id: 'p1',
  name: 'Item',
  sku: 'S-1',
  category: 'G',
  price: 10,
  cost: 4,
  warehouseCost: 4,
  stock: 5,
  image: '',
  categoryId: '',
  subcategoryId: '',
  subcategory: '',
  status: 'active',
  unitOfMeasure: 'unidad',
  locationId: null,
  barcode: null,
};

const sale: Transaction = {
  id: 's1',
  orderNumber: '#1',
  customer: 'C',
  amount: 20,
  status: 'completed',
  timestamp: '',
  type: 'sale',
  createdAt: 100,
  paymentMethod: 'cash',
  receipt: {
    storeName: 'T',
    branch: '',
    currency: 'USD',
    paymentMethod: 'cash',
    lines: [
      {
        name: 'Item',
        sku: 'S-1',
        productId: 'p1',
        quantity: 2,
        unitPrice: 10,
        lineTotal: 20,
        unitCostSnapshot: 4,
      },
    ],
    subtotal: 20,
    tax: 0,
    taxRatePercent: 0,
    total: 20,
  },
};

const returnTx: Transaction = {
  id: 'r1',
  orderNumber: '#R1',
  customer: 'C',
  amount: -10,
  status: 'refunded',
  timestamp: '',
  type: 'return',
  createdAt: 200,
  paymentMethod: 'cash',
  sourceSaleId: 's1',
  receipt: {
    storeName: 'T',
    branch: '',
    currency: 'USD',
    paymentMethod: 'cash',
    lines: [
      {
        name: 'Item',
        sku: 'S-1',
        productId: 'p1',
        quantity: 1,
        unitPrice: 10,
        lineTotal: 10,
        unitCostSnapshot: 4,
      },
    ],
    subtotal: 10,
    tax: 0,
    taxRatePercent: 0,
    total: 10,
  },
};

describe('netSalesRevenueInRange', () => {
  it('subtracts same-day return rows from completed sales', () => {
    const net = netSalesRevenueInRange([sale, returnTx], range);
    assert.equal(net, 10);
  });
});

describe('paymentMethodBreakdown reversals', () => {
  it('nets cash after a reversal return', () => {
    const b = paymentMethodBreakdown([sale, returnTx], range);
    assert.equal(b.cash, 10);
  });
});

describe('profitGrossInRange', () => {
  it('computes net sales and COGS after returns', () => {
    const m = profitGrossInRange([sale, returnTx], [product], range);
    assert.equal(m.grossSales, 20);
    assert.equal(m.returnsAmount, 10);
    assert.equal(m.netSales, 10);
    assert.equal(m.cogs, 4);
    assert.equal(m.grossProfit, 6);
  });
});

describe('salesIncentivePool', () => {
  it('applies percent to net base', () => {
    const base = salesIncentiveBaseAmount('net', 100, 40);
    assert.equal(base, 60);
    assert.equal(salesIncentivePoolAmount(base, 10), 6);
  });

  it('applies percent to gross base', () => {
    const base = salesIncentiveBaseAmount('gross', 100, 40);
    assert.equal(base, 100);
    assert.equal(salesIncentivePoolAmount(base, 2.5), 2.5);
  });
});

describe('salesIncentiveDistribution', () => {
  it('splits pool by net sales share per operator', () => {
    const baseReceipt = sale.receipt!;
    const opA: Transaction = {
      ...sale,
      id: 'a',
      amount: 60,
      operatorName: 'Ana',
      receipt: { ...baseReceipt, lines: [] },
    };
    const opB: Transaction = {
      ...sale,
      id: 'b',
      amount: 40,
      operatorName: 'Luis',
      receipt: { ...baseReceipt, lines: [] },
    };
    const dist = salesIncentiveDistribution([opA, opB], [product], [], range, 10, 'gross');
    assert.equal(dist.pool, 10);
    assert.equal(dist.rows.length, 2);
    const ana = dist.rows.find((r) => r.operator === 'Ana');
    const luis = dist.rows.find((r) => r.operator === 'Luis');
    assert.equal(ana?.amount, 6);
    assert.equal(luis?.amount, 4);
    assert.equal(ana!.amount + luis!.amount, dist.pool);
  });
});
