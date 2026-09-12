import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reconcilePeriod } from '../../src/lib/periodReconciliation.ts';
import type { Product, Transaction } from '../../src/types.ts';

const day1 = new Date('2026-09-01T12:00:00').getTime();
const day2 = new Date('2026-09-02T12:00:00').getTime();

const product: Product = {
  id: 'p1', name: 'Producto', sku: 'P-1', category: 'General', price: 100, cost: 50, stock: 10, image: '',
  categoryId: '', subcategoryId: '', subcategory: '', status: 'active', unitOfMeasure: 'unidad', locationId: null, barcode: null,
};

const receipt = {
  storeName: 'Tienda', branch: '', currency: 'USD', paymentMethod: 'cash' as const,
  lines: [{ name: 'Producto', sku: 'P-1', productId: 'p1', quantity: 1, unitPrice: 100, lineTotal: 100, unitCostSnapshot: 50 }],
  subtotal: 100, tax: 10, taxRatePercent: 10, total: 110,
};

const sale: Transaction = {
  id: 'sale-1', orderNumber: '#100', customer: 'Ana', amount: 110, status: 'completed', timestamp: '', type: 'sale', createdAt: day1, paymentMethod: 'cash', receipt,
};

const reversal: Transaction = {
  id: 'return-1', orderNumber: '#R-100', customer: 'Ana', amount: -110, status: 'refunded', timestamp: '', type: 'return', createdAt: day2, paymentMethod: 'cash', receipt, sourceSaleId: sale.id,
};

describe('period reconciliation', () => {
  it('keeps the original sale in its period and posts the reversal in the later period', () => {
    const first = reconcilePeriod([sale, reversal], [product], { start: day1 - 1, end: day1 + 1 }, [{ id: 'e1', title: 'Luz', amount: 5, category: 'Ops', date: '2026-09-01' }]);
    assert.equal(first.netSales, 110);
    assert.equal(first.subtotal, 100);
    assert.equal(first.cogs, 50);
    assert.equal(first.grossProfit, 50);
    assert.equal(first.operatingResult, 45);

    const second = reconcilePeriod([sale, reversal], [product], { start: day2 - 1, end: day2 + 1 });
    assert.equal(second.netSales, -110);
    assert.equal(second.subtotal, -100);
    assert.equal(second.cogs, -50);
    assert.equal(second.grossProfit, -50);
    assert.equal(second.payments.cash, -110);
    assert.equal(second.netUnits, -1);
  });
});
