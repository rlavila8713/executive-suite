type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other' | 'debt';

type Transaction = {
  type: string;
  status: string;
  amount: number;
  createdAt: number;
  paymentMethod?: PaymentMethod | string;
  receipt?: { paymentMethod?: PaymentMethod | string };
  soldAsDebt?: boolean;
  debtStatus?: string;
  collectedAt?: number;
};

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

function isPendingDebtSale(tx: Transaction): boolean {
  return isCompletedSale(tx) && tx.debtStatus === 'pending';
}

export function resolveTransactionPaymentMethod(tx: Transaction): PaymentMethod {
  if (isPendingDebtSale(tx)) return 'other';
  if (tx.paymentMethod && PAYMENT_METHODS.includes(tx.paymentMethod as PaymentMethod)) {
    return tx.paymentMethod as PaymentMethod;
  }
  const r = tx.receipt?.paymentMethod;
  if (r && PAYMENT_METHODS.includes(r as PaymentMethod)) return r as PaymentMethod;
  return 'other';
}

function appliesToSessionPaymentBreakdown(tx: Transaction, range: DateRangeMs): boolean {
  if (isPendingDebtSale(tx)) return false;

  const createdIn = tx.createdAt >= range.start && tx.createdAt <= range.end;
  const collectedIn =
    !!tx.soldAsDebt &&
    tx.debtStatus === 'collected' &&
    tx.collectedAt != null &&
    tx.collectedAt >= range.start &&
    tx.collectedAt <= range.end;

  if (createdIn) return true;
  if (collectedIn) return isCompletedSale(tx);
  return false;
}

type DateRangeMs = { start: number; end: number };

function isCompletedSale(tx: Transaction): boolean {
  return tx.type === 'sale' && tx.status === 'completed';
}

function isReversal(tx: Transaction): boolean {
  return tx.type === 'return' || (tx.type === 'sale' && (tx.status === 'reversed' || tx.status === 'refunded' || tx.amount < 0));
}

function paymentMethodBreakdown(transactions: Transaction[], range: DateRangeMs): Record<PaymentMethod, number> {
  const out: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  for (const tx of transactions) {
    if (!appliesToSessionPaymentBreakdown(tx, range)) continue;
    const m = resolveTransactionPaymentMethod(tx);
    out[m] += (isCompletedSale(tx) ? 1 : -1) * Math.abs(tx.amount);
  }
  (Object.keys(out) as PaymentMethod[]).forEach((k) => {
    out[k] = Math.round(out[k] * 100) / 100;
  });
  return out;
}

function sessionDebtSalesTotal(transactions: Transaction[], range: DateRangeMs): number {
  let sum = 0;
  for (const tx of transactions) {
    if (!isPendingDebtSale(tx)) continue;
    if (tx.createdAt < range.start || tx.createdAt > range.end) continue;
    sum += Math.abs(tx.amount);
  }
  return Math.round(sum * 100) / 100;
}

export function computeSessionPaymentTotals(
  transactions: Transaction[],
  openedAt: number,
  closedAt: number,
): {
  totalCashSales: number;
  totalCardSales: number;
  totalTransferSales: number;
  totalOtherSales: number;
  totalDebtSales: number;
} {
  const range: DateRangeMs = { start: openedAt, end: closedAt };
  const b = paymentMethodBreakdown(transactions, range);
  return {
    totalCashSales: b.cash,
    totalCardSales: b.card,
    totalTransferSales: b.transfer,
    totalOtherSales: b.other,
    totalDebtSales: sessionDebtSalesTotal(transactions, range),
  };
}
