import type { Expense, PaymentMethod, Product, SaleReceipt, SaleReceiptLine, Transaction } from '../types';
import type { DateRangeMs } from './reporting';
import {
  expensesTotalInRange,
  isCompletedSale,
  isReversedSale,
  isReturnRow,
  resolveTransactionPaymentMethod,
} from './reporting';

const MONEY_EPSILON = 0.005;

export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < MONEY_EPSILON;
}

export type IntegrityIssueKind =
  | 'missingReceipt'
  | 'lineInternal'
  | 'linesVsSubtotal'
  | 'subtotalPlusTax'
  | 'amountMismatch';

export type ReceiptIntegrityIssue = {
  saleId: string;
  orderNumber: string;
  kind: IntegrityIssueKind;
};

export type PeriodReconciliation = {
  completedCount: number;
  reversedCount: number;
  grossSales: number;
  reversedAmount: number;
  netSales: number;
  subtotal: number;
  tax: number;
  payments: Record<PaymentMethod, number>;
  unitsSold: number;
  unitsReturned: number;
  cogs: number;
  grossProfit: number;
  expensesTotal: number;
  inventoryValueAtCost: number;
  inventoryValueAtPrice: number;
  skuCount: number;
  issues: ReceiptIntegrityIssue[];
  paymentsTotal: number;
  netUnits: number;
  operatingResult: number;
  grossMarginPercent: number;
  paymentsMatchSales: boolean;
  receiptsBalanced: boolean;
  isBalanced: boolean;
};

function timestampInRange(ts: number, range: DateRangeMs): boolean {
  return ts >= range.start && ts <= range.end;
}

function lineCogs(line: SaleReceiptLine, productById: Map<string, Product>): number {
  const unitCost = line.unitCostSnapshot ?? productById.get(line.productId ?? '')?.cost ?? 0;
  return unitCost * line.quantity;
}

function receiptIssues(tx: Transaction, receipt: SaleReceipt): ReceiptIntegrityIssue[] {
  const issues: ReceiptIntegrityIssue[] = [];

  for (const line of receipt.lines) {
    if (!moneyEquals(line.lineTotal, line.unitPrice * line.quantity)) {
      issues.push({ saleId: tx.id, orderNumber: tx.orderNumber, kind: 'lineInternal' });
      break;
    }
  }

  const linesTotal = receipt.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (!moneyEquals(linesTotal, receipt.subtotal)) {
    issues.push({ saleId: tx.id, orderNumber: tx.orderNumber, kind: 'linesVsSubtotal' });
  }

  if (!moneyEquals(receipt.subtotal + receipt.tax, receipt.total)) {
    issues.push({ saleId: tx.id, orderNumber: tx.orderNumber, kind: 'subtotalPlusTax' });
  }

  if (!moneyEquals(receipt.total, Math.abs(tx.amount))) {
    issues.push({ saleId: tx.id, orderNumber: tx.orderNumber, kind: 'amountMismatch' });
  }

  return issues;
}

export function reconcilePeriod(
  transactions: Transaction[],
  products: Product[],
  range: DateRangeMs,
  expenses: Expense[] = [],
): PeriodReconciliation {
  const inRange = transactions.filter((tx) => timestampInRange(tx.createdAt, range));
  const productById = new Map(products.map((p) => [p.id, p]));

  let completedCount = 0;
  let reversedCount = 0;
  let grossSales = 0;
  let reversedAmount = 0;
  let subtotal = 0;
  let tax = 0;
  let unitsSold = 0;
  let unitsReturned = 0;
  let cogs = 0;
  const payments: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  const issues: ReceiptIntegrityIssue[] = [];

  for (const tx of inRange) {
    if (isReturnRow(tx)) {
      reversedCount++;
      reversedAmount += Math.abs(tx.amount);
      const method = resolveTransactionPaymentMethod(tx);
      payments[method] -= Math.abs(tx.amount);
      continue;
    }

    if (!isCompletedSale(tx) && !isReversedSale(tx)) continue;

    const reversed = isReversedSale(tx);
    if (reversed) {
      reversedCount++;
      reversedAmount += Math.abs(tx.amount);
      const method = resolveTransactionPaymentMethod(tx);
      payments[method] -= Math.abs(tx.amount);
    } else {
      completedCount++;
      grossSales += Math.abs(tx.amount);
      const method = resolveTransactionPaymentMethod(tx);
      payments[method] += Math.abs(tx.amount);
    }

    const receipt = tx.receipt;
    if (!receipt) {
      if (isCompletedSale(tx)) {
        issues.push({ saleId: tx.id, orderNumber: tx.orderNumber, kind: 'missingReceipt' });
      }
      continue;
    }

    if (!reversed) {
      issues.push(...receiptIssues(tx, receipt));
    }

    if (!reversed) {
      subtotal += receipt.subtotal;
      tax += receipt.tax;
      for (const line of receipt.lines) {
        unitsSold += line.quantity;
        cogs += lineCogs(line, productById);
      }
    } else {
      for (const line of receipt.lines) {
        unitsReturned += line.quantity;
        cogs -= lineCogs(line, productById);
      }
    }
  }

  let inventoryValueAtCost = 0;
  let inventoryValueAtPrice = 0;
  for (const p of products) {
    inventoryValueAtCost += p.cost * p.stock;
    inventoryValueAtPrice += p.price * p.stock;
  }

  const paymentsTotal = Object.values(payments).reduce((s, v) => s + v, 0);
  const netSales = Math.round((grossSales - reversedAmount) * 100) / 100;
  (Object.keys(payments) as PaymentMethod[]).forEach((k) => {
    payments[k] = Math.round(payments[k] * 100) / 100;
  });
  cogs = Math.round(cogs * 100) / 100;
  const grossProfit = Math.round((subtotal - cogs) * 100) / 100;
  const expensesTotal = expensesTotalInRange(expenses, range);

  return {
    completedCount,
    reversedCount,
    grossSales: Math.round(grossSales * 100) / 100,
    reversedAmount: Math.round(reversedAmount * 100) / 100,
    netSales,
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    payments,
    unitsSold,
    unitsReturned,
    cogs,
    grossProfit,
    expensesTotal,
    inventoryValueAtCost,
    inventoryValueAtPrice,
    skuCount: products.length,
    issues,
    paymentsTotal: Math.round(paymentsTotal * 100) / 100,
    netUnits: unitsSold - unitsReturned,
    operatingResult: Math.round((netSales - expensesTotal) * 100) / 100,
    grossMarginPercent: subtotal === 0 ? 0 : (grossProfit / subtotal) * 100,
    paymentsMatchSales: moneyEquals(paymentsTotal, netSales),
    receiptsBalanced: issues.length === 0,
    isBalanced: issues.length === 0 && moneyEquals(paymentsTotal, netSales),
  };
}
