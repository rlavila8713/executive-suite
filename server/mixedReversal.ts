type SalePaymentPart = { method: string; amount: number };

type ReceiptLike = {
  paymentMethod?: string;
  payments?: SalePaymentPart[];
};

export type MixedSaleShape = 'cash_transfer' | 'cash_debt' | null;

export function mixedSaleShape(receipt: ReceiptLike | null | undefined): MixedSaleShape {
  if (!receipt || receipt.paymentMethod !== 'mixed') return null;
  const payments = receipt.payments ?? [];
  const hasTransfer = payments.some((p) => p.method === 'transfer' && (p.amount ?? 0) > 0);
  const hasDebt = payments.some((p) => p.method === 'debt' && (p.amount ?? 0) > 0);
  if (hasTransfer && !hasDebt) return 'cash_transfer';
  if (hasDebt && !hasTransfer) return 'cash_debt';
  return null;
}

export function transferAmountFromReceipt(receipt: ReceiptLike | null | undefined): number {
  const part = receipt?.payments?.find((p) => p.method === 'transfer');
  const n = part?.amount ?? 0;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export function debtAmountFromReceipt(receipt: ReceiptLike | null | undefined): number {
  const part = receipt?.payments?.find((p) => p.method === 'debt');
  const n = part?.amount ?? 0;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
