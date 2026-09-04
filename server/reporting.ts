type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

type Transaction = {
  type: string;
  status: string;
  amount: number;
  createdAt: number;
  paymentMethod?: PaymentMethod;
  receipt?: { paymentMethod?: PaymentMethod };
};

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

export function resolveTransactionPaymentMethod(tx: Transaction): PaymentMethod {
  if (tx.paymentMethod && PAYMENT_METHODS.includes(tx.paymentMethod)) return tx.paymentMethod;
  const r = tx.receipt?.paymentMethod;
  if (r && PAYMENT_METHODS.includes(r)) return r;
  return 'other';
}

type DateRangeMs = { start: number; end: number };

function isCompletedSale(tx: Transaction): boolean {
  return tx.type === 'sale' && tx.status === 'completed';
}

function completedSalesInRange(transactions: Transaction[], range: DateRangeMs): Transaction[] {
  return transactions.filter(
    (tx) =>
      isCompletedSale(tx) &&
      tx.createdAt >= range.start &&
      tx.createdAt <= range.end,
  );
}

function paymentMethodBreakdown(transactions: Transaction[], range: DateRangeMs): Record<PaymentMethod, number> {
  const out: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  for (const tx of completedSalesInRange(transactions, range)) {
    const m = resolveTransactionPaymentMethod(tx);
    out[m] += Math.abs(tx.amount);
  }
  (Object.keys(out) as PaymentMethod[]).forEach((k) => {
    out[k] = Math.round(out[k] * 100) / 100;
  });
  return out;
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
} {
  const range: DateRangeMs = { start: openedAt, end: closedAt };
  const slice = completedSalesInRange(transactions, range);
  const b = paymentMethodBreakdown(slice, range);
  return {
    totalCashSales: b.cash,
    totalCardSales: b.card,
    totalTransferSales: b.transfer,
    totalOtherSales: b.other,
  };
}
