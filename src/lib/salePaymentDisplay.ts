import type { Transaction } from '../types';
import type { TranslateFn } from '../i18n/I18nContext';
import { sessionPaymentParts } from './paymentSplits';

export type SaleChannelTotals = { cash: number; transfer: number };

/** Cash and transfer portions for completed sales (extensible via sessionPaymentParts). */
export function saleCashAndTransferTotals(tx: Transaction): SaleChannelTotals {
  const out = { cash: 0, transfer: 0 };
  for (const part of sessionPaymentParts(tx)) {
    if (part.method === 'cash') out.cash += part.amount;
    if (part.method === 'transfer') out.transfer += part.amount;
  }
  return {
    cash: Math.round(out.cash * 100) / 100,
    transfer: Math.round(out.transfer * 100) / 100,
  };
}

export type SalePaymentBadge = 'cash' | 'transfer' | 'mixed_cash_transfer' | 'card' | 'other' | 'debt' | 'unknown';

export function salePaymentBadgeKind(tx: Transaction): SalePaymentBadge {
  const parts = sessionPaymentParts(tx);
  const hasCash = parts.some((p) => p.method === 'cash' && p.amount > 0);
  const hasTransfer = parts.some((p) => p.method === 'transfer' && p.amount > 0);
  const hasCard = parts.some((p) => p.method === 'card' && p.amount > 0);
  if (hasCash && hasTransfer) return 'mixed_cash_transfer';
  if (hasCash) return 'cash';
  if (hasTransfer) return 'transfer';
  if (hasCard) return 'card';
  if (tx.soldAsDebt || tx.receipt?.paymentMethod === 'debt') return 'debt';
  const m = tx.paymentMethod ?? tx.receipt?.paymentMethod;
  if (m === 'cash' || m === 'transfer' || m === 'card') return m;
  if (m === 'mixed') return 'other';
  return parts.length ? 'other' : 'unknown';
}

export function salePaymentBadgeLabel(tx: Transaction, t: TranslateFn): string {
  const kind = salePaymentBadgeKind(tx);
  switch (kind) {
    case 'cash':
      return t('dashboard.pmCash');
    case 'transfer':
      return t('dashboard.pmTransfer');
    case 'mixed_cash_transfer':
      return t('dashboard.paymentMixedCashTransfer');
    case 'card':
      return t('dashboard.pmOnline');
    case 'debt':
      return t('dashboard.paymentDebt');
    case 'other':
      return t('dashboard.pmOther');
    default:
      return '—';
  }
}

export function salePaymentBadgeClass(kind: SalePaymentBadge): string {
  switch (kind) {
    case 'cash':
      return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 ring-emerald-500/30';
    case 'transfer':
      return 'bg-sky-500/15 text-sky-800 dark:text-sky-300 ring-sky-500/30';
    case 'mixed_cash_transfer':
      return 'bg-violet-500/15 text-violet-800 dark:text-violet-300 ring-violet-500/30';
    case 'card':
      return 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 ring-indigo-500/30';
    case 'debt':
      return 'bg-amber-500/15 text-amber-900 dark:text-amber-200 ring-amber-500/30';
    default:
      return 'bg-surface-container-high text-on-surface-variant ring-black/10';
  }
}
