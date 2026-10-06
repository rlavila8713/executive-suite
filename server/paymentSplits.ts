type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other' | 'debt' | 'mixed';

type SalePaymentPart = { method: string; amount: number };

type Receipt = {
  paymentMethod?: string;
  payments?: SalePaymentPart[];
  balanceDue?: number;
  collectedPaymentMethod?: string;
  debtCollectedAmount?: number;
  total?: number;
};

type Transaction = {
  type: string;
  status: string;
  amount: number;
  createdAt: number;
  paymentMethod?: string;
  receipt?: Receipt;
  soldAsDebt?: boolean;
  debtStatus?: string;
  collectedAt?: number;
};

const CHANNEL_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

function isCompletedSale(tx: Transaction): boolean {
  return tx.type === 'sale' && tx.status === 'completed';
}

function isPendingDebtSale(tx: Transaction): boolean {
  return isCompletedSale(tx) && tx.debtStatus === 'pending';
}

function isReturnRow(tx: Transaction): boolean {
  return tx.type === 'return' || (tx.amount < 0 && tx.type !== 'sale');
}

function isReversedSale(tx: Transaction): boolean {
  return tx.type === 'sale' && (tx.status === 'reversed' || tx.status === 'refunded' || tx.amount < 0);
}

function receivableBalanceDue(tx: Transaction): number {
  if (!isPendingDebtSale(tx)) return 0;
  const r = tx.receipt;
  if (r?.balanceDue != null && Number.isFinite(r.balanceDue) && r.balanceDue > 0) return Math.abs(r.balanceDue);
  const debtPart = r?.payments?.find((p) => p.method === 'debt')?.amount;
  if (debtPart != null && debtPart > 0) return Math.abs(debtPart);
  return Math.abs(tx.amount);
}

function sessionPaymentParts(tx: Transaction): { method: PaymentMethod; amount: number }[] {
  const payments = tx.receipt?.payments;
  if (payments?.length) {
    const out: { method: PaymentMethod; amount: number }[] = [];
    for (const p of payments) {
      if (p.method === 'debt') continue;
      if (tx.soldAsDebt && p.method !== 'cash') continue;
      if (!CHANNEL_METHODS.includes(p.method as PaymentMethod)) continue;
      out.push({ method: p.method as PaymentMethod, amount: Math.abs(p.amount) });
    }
    if (out.length) return out;
  }
  if (isPendingDebtSale(tx)) return [];
  const m = tx.paymentMethod ?? tx.receipt?.paymentMethod;
  if (m && m !== 'debt' && m !== 'mixed' && CHANNEL_METHODS.includes(m as PaymentMethod)) {
    return [{ method: m as PaymentMethod, amount: Math.abs(tx.amount) }];
  }
  return [];
}

function collectedDebtPaymentPart(tx: Transaction): { method: PaymentMethod; amount: number } | null {
  if (!tx.soldAsDebt || tx.debtStatus !== 'collected' || tx.collectedAt == null) return null;
  const r = tx.receipt;
  const collectedMethod = (r?.collectedPaymentMethod as PaymentMethod | undefined) ?? undefined;
  if (!collectedMethod || !CHANNEL_METHODS.includes(collectedMethod)) return null;
  const paid =
    r?.debtCollectedAmount != null
      ? Math.abs(r.debtCollectedAmount)
      : Math.abs(r?.payments?.find((p) => p.method === 'debt')?.amount ?? tx.amount);
  return { method: collectedMethod, amount: paid };
}

export function applyPaymentPartsToBreakdown(
  out: Record<'cash' | 'card' | 'transfer' | 'other', number>,
  tx: Transaction,
  range: { start: number; end: number },
): void {
  const createdIn = tx.createdAt >= range.start && tx.createdAt <= range.end;
  const collectedIn =
    !!tx.soldAsDebt &&
    tx.debtStatus === 'collected' &&
    tx.collectedAt != null &&
    tx.collectedAt >= range.start &&
    tx.collectedAt <= range.end;

  const sign = isCompletedSale(tx) ? 1 : isReturnRow(tx) || isReversedSale(tx) ? -1 : 0;
  if (sign === 0) return;

  if (createdIn) {
    for (const part of sessionPaymentParts(tx)) {
      out[part.method] += sign * part.amount;
    }
  }
  if (collectedIn && isCompletedSale(tx)) {
    const collected = collectedDebtPaymentPart(tx);
    if (collected) out[collected.method] += sign * collected.amount;
  }
}

function paymentMethodBreakdown(transactions: Transaction[], range: { start: number; end: number }) {
  const out: Record<'cash' | 'card' | 'transfer' | 'other', number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  for (const tx of transactions) {
    if (tx.receipt?.payments?.length) {
      applyPaymentPartsToBreakdown(out, tx, range);
      continue;
    }
    if (isPendingDebtSale(tx)) continue;
    const createdIn = tx.createdAt >= range.start && tx.createdAt <= range.end;
    const collectedIn =
      !!tx.soldAsDebt &&
      tx.debtStatus === 'collected' &&
      tx.collectedAt != null &&
      tx.collectedAt >= range.start &&
      tx.collectedAt <= range.end;
    if (!createdIn && !collectedIn) continue;
    const sign = isCompletedSale(tx) ? 1 : isReturnRow(tx) || isReversedSale(tx) ? -1 : 0;
    if (sign === 0) continue;
    const m =
      tx.paymentMethod && CHANNEL_METHODS.includes(tx.paymentMethod as PaymentMethod)
        ? (tx.paymentMethod as PaymentMethod)
        : 'other';
    out[m] += sign * Math.abs(tx.amount);
  }
  (Object.keys(out) as (keyof typeof out)[]).forEach((k) => {
    out[k] = Math.round(out[k] * 100) / 100;
  });
  return out;
}

function sessionDebtSalesTotal(transactions: Transaction[], range: { start: number; end: number }): number {
  let sum = 0;
  for (const tx of transactions) {
    if (!isPendingDebtSale(tx)) continue;
    if (tx.createdAt < range.start || tx.createdAt > range.end) continue;
    sum += receivableBalanceDue(tx);
  }
  return Math.round(sum * 100) / 100;
}

export function computeSessionPaymentTotals(transactions: Transaction[], openedAt: number, closedAt: number) {
  const range = { start: openedAt, end: closedAt };
  const b = paymentMethodBreakdown(transactions, range);
  return {
    totalCashSales: b.cash,
    totalCardSales: b.card,
    totalTransferSales: b.transfer,
    totalOtherSales: b.other,
    totalDebtSales: sessionDebtSalesTotal(transactions, range),
  };
}
