import type { SaleReceipt, Transaction } from '../types';

export type MixedSaleShape = 'cash_transfer' | 'cash_debt' | null;

export function mixedSaleShape(receipt: SaleReceipt | undefined): MixedSaleShape {
  if (!receipt || receipt.paymentMethod !== 'mixed') return null;
  const payments = receipt.payments ?? [];
  const hasTransfer = payments.some((p) => p.method === 'transfer' && p.amount > 0);
  const hasDebt = payments.some((p) => p.method === 'debt' && p.amount > 0);
  if (hasTransfer && !hasDebt) return 'cash_transfer';
  if (hasDebt && !hasTransfer) return 'cash_debt';
  return null;
}

export function reverseMixedSaleHint(
  tx: Transaction,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  const shape = mixedSaleShape(tx.receipt);
  if (shape === 'cash_transfer') {
    const transfer = tx.receipt?.payments?.find((p) => p.method === 'transfer')?.amount ?? 0;
    return t('dashboard.reverseMixedTransferHint', { amount: transfer.toFixed(2) });
  }
  if (shape === 'cash_debt') {
    return t('dashboard.reverseMixedDebtHint');
  }
  if (tx.soldAsDebt && tx.debtStatus === 'pending' && !shape) {
    return t('dashboard.reverseDebtHint');
  }
  return null;
}
