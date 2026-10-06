import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeMixedSaleTotals } from '../src/lib/mixedPayment.ts';
import { paymentMethodBreakdown } from '../src/lib/reporting.ts';
import type { Transaction } from '../src/types.ts';

describe('computeMixedSaleTotals', () => {
  it('shows unpaid subtotal for debt and transfer amount with tax', () => {
    const m = computeMixedSaleTotals(1500, 1000, 20);
    assert.equal(m.unpaidSubtotal, 500);
    assert.equal(m.debtAmount, 500);
    assert.equal(m.tax, 100);
    assert.equal(m.transferAmount, 600);
    assert.equal(m.totalIfDebt, 1500);
    assert.equal(m.totalIfTransfer, 1600);
  });

  it('allows zero cash with full remainder', () => {
    const m = computeMixedSaleTotals(100, 0, 10);
    assert.equal(m.debtAmount, 100);
    assert.equal(m.transferAmount, 110);
    assert.equal(m.totalIfTransfer, 110);
    assert.equal(m.totalIfDebt, 100);
  });
});

describe('paymentMethodBreakdown mixed', () => {
  const range = { start: 0, end: 1_000_000 };

  it('counts cash at sale and transfer on mixed checkout', () => {
    const tx: Transaction = {
      id: 'mix-1',
      orderNumber: '#1',
      customer: 'Ana',
      amount: 1600,
      status: 'completed',
      timestamp: '',
      type: 'sale',
      createdAt: 100,
      paymentMethod: 'mixed',
      receipt: {
        storeName: 'T',
        branch: '',
        currency: 'USD',
        paymentMethod: 'mixed',
        payments: [{ method: 'cash', amount: 1000 }, { method: 'transfer', amount: 600 }],
        lines: [],
        subtotal: 1500,
        tax: 100,
        taxRatePercent: 20,
        total: 1600,
      },
    };
    const b = paymentMethodBreakdown([tx], range);
    assert.equal(b.cash, 1000);
    assert.equal(b.transfer, 600);
  });

  it('counts partial debt cash at sale and balance when collected', () => {
    const tx: Transaction = {
      id: 'mix-2',
      orderNumber: '#2',
      customer: 'Bob',
      amount: 1500,
      status: 'completed',
      timestamp: '',
      type: 'sale',
      createdAt: 100,
      paymentMethod: 'mixed',
      soldAsDebt: true,
      debtStatus: 'collected',
      collectedAt: 200,
      receipt: {
        storeName: 'T',
        branch: '',
        currency: 'USD',
        paymentMethod: 'mixed',
        payments: [{ method: 'cash', amount: 1000 }, { method: 'debt', amount: 500 }],
        balanceDue: 0,
        mixedTaxIncluded: false,
        collectedPaymentMethod: 'transfer',
        debtCollectedAmount: 600,
        lines: [],
        subtotal: 1500,
        tax: 100,
        taxRatePercent: 20,
        total: 1600,
      },
    };
    const b = paymentMethodBreakdown([tx], range);
    assert.equal(b.cash, 1000);
    assert.equal(b.transfer, 600);
  });
});
