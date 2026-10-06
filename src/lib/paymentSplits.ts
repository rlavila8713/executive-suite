import type { PaymentMethod, SalePaymentPart, Transaction } from '../types';
import { isCompletedSale, isPendingDebtSale, isReturnRow, isReversedSale } from './reporting';

const CHANNEL_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

/** Pending balance on a receivable (partial or full debt). */
export function receivableBalanceDue(tx: Transaction): number {
  if (!isPendingDebtSale(tx)) return 0;
  const r = tx.receipt;
  if (r?.balanceDue != null && Number.isFinite(r.balanceDue) && r.balanceDue > 0) return Math.abs(r.balanceDue);
  const debtPart = r?.payments?.find((p) => p.method === 'debt')?.amount;
  if (debtPart != null && debtPart > 0) return Math.abs(debtPart);
  return Math.abs(tx.amount);
}

/**
 * Payment channels and amounts that affect drawer/card/transfer totals for a transaction.
 * Debt parts are omitted until collected (then attributed via collectedAt).
 */
export function sessionPaymentParts(tx: Transaction): { method: PaymentMethod; amount: number }[] {
  const r = tx.receipt;
  const payments = r?.payments;
  if (payments?.length) {
    const out: { method: PaymentMethod; amount: number }[] = [];
    for (const p of payments) {
      if (p.method === 'debt') continue;
      if (tx.soldAsDebt && p.method !== 'cash') continue;
      if (!CHANNEL_METHODS.includes(p.method)) continue;
      out.push({ method: p.method, amount: Math.abs(p.amount) });
    }
    if (out.length) return out;
  }

  if (isPendingDebtSale(tx)) return [];

  const m = tx.paymentMethod ?? r?.paymentMethod;
  if (m && m !== 'debt' && m !== 'mixed' && CHANNEL_METHODS.includes(m)) {
    return [{ method: m, amount: Math.abs(tx.amount) }];
  }
  if (m === 'mixed' && r?.total != null) {
    return [{ method: 'other', amount: Math.abs(r.total) }];
  }
  return [];
}

/** Amount collected when a pending debt was paid (after sale). */
export function collectedDebtPaymentPart(tx: Transaction): { method: PaymentMethod; amount: number } | null {
  if (!tx.soldAsDebt || tx.debtStatus !== 'collected' || tx.collectedAt == null) return null;
  const r = tx.receipt;
  const collectedMethod =
    (r?.collectedPaymentMethod as PaymentMethod | undefined) ??
    (tx.paymentMethod && tx.paymentMethod !== 'debt' && tx.paymentMethod !== 'mixed'
      ? tx.paymentMethod
      : undefined);
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
    if (collected) {
      out[collected.method] += sign * collected.amount;
    } else if (!isPendingDebtSale(tx) && tx.paymentMethod && CHANNEL_METHODS.includes(tx.paymentMethod)) {
      out[tx.paymentMethod] += sign * Math.abs(tx.amount);
    }
  }
}

export function buildMixedPayments(
  cashAmount: number,
  remainder: number,
  remainderMethod: 'transfer' | 'debt',
): SalePaymentPart[] {
  const parts: SalePaymentPart[] = [];
  if (cashAmount > 0) parts.push({ method: 'cash', amount: roundMoney(cashAmount) });
  if (remainder > 0) parts.push({ method: remainderMethod, amount: roundMoney(remainder) });
  return parts;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
