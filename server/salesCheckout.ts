import { computeMixedSaleTotals, roundMoney } from './mixedPayment.js';

type SalePaymentPart = { method: string; amount: number };

export type SaleReceiptInput = {
  subtotal: number;
  tax?: number;
  taxRatePercent?: number;
  total: number;
  paymentMethod: string;
  payments?: SalePaymentPart[];
  amountPaid?: number;
  changeGiven?: number;
  balanceDue?: number;
  mixedTaxIncluded?: boolean;
  [key: string]: unknown;
};

export class SaleCheckoutValidationError extends Error {
  code: string;
  status: number;
  constructor(status: number, message: string, code: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function normalizeMixedSaleReceipt(
  receipt: SaleReceiptInput,
  taxRatePercent: number,
  opts: { isDebt: boolean; isPartialDebt: boolean; clientKind: 'web' | 'mobile' },
): { receipt: SaleReceiptInput; paymentMethod: string; soldAsDebt: boolean; debtStatus?: 'pending' } {
  const isMixed = receipt.paymentMethod === 'mixed' || (receipt.payments?.length ?? 0) > 0;
  if (!isMixed) {
    if (opts.isDebt || opts.isPartialDebt) {
      return { receipt, paymentMethod: 'debt', soldAsDebt: true, debtStatus: 'pending' };
    }
    return { receipt, paymentMethod: receipt.paymentMethod || 'other', soldAsDebt: false };
  }

  const subtotal = Number(receipt.subtotal);
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new SaleCheckoutValidationError(400, 'Invalid subtotal', 'ERR_INVALID_RECEIPT');
  }

  const cashPart = receipt.payments?.find((p) => p.method === 'cash');
  const debtPart = receipt.payments?.find((p) => p.method === 'debt');
  const transferPart = receipt.payments?.find((p) => p.method === 'transfer');
  const cashAmount = roundMoney(cashPart?.amount ?? 0);
  const computed = computeMixedSaleTotals(subtotal, cashAmount, taxRatePercent);

  const hasDebt = (debtPart?.amount ?? 0) > 0 || opts.isPartialDebt;
  const hasTransfer = (transferPart?.amount ?? 0) > 0;
  if (hasDebt && hasTransfer) {
    throw new SaleCheckoutValidationError(400, 'Invalid mixed payments', 'ERR_INVALID_RECEIPT');
  }
  if (!hasDebt && !hasTransfer && cashAmount < subtotal) {
    throw new SaleCheckoutValidationError(400, 'Invalid mixed payments', 'ERR_INVALID_RECEIPT');
  }

  if (hasDebt) {
    const debtAmt = roundMoney(debtPart?.amount ?? computed.debtAmount);
    if (debtAmt !== computed.debtAmount) {
      throw new SaleCheckoutValidationError(400, 'Debt amount must equal unpaid subtotal', 'ERR_INVALID_RECEIPT');
    }
    if (Math.abs(roundMoney(receipt.total) - computed.totalIfDebt) > 0.01) {
      throw new SaleCheckoutValidationError(400, 'Receipt total mismatch', 'ERR_INVALID_RECEIPT');
    }
  }
  if (hasTransfer) {
    const trAmt = roundMoney(transferPart?.amount ?? computed.transferAmount);
    if (trAmt !== computed.transferAmount) {
      throw new SaleCheckoutValidationError(400, 'Transfer amount must include tax on unpaid portion', 'ERR_INVALID_RECEIPT');
    }
    if (Math.abs(roundMoney(receipt.total) - computed.totalIfTransfer) > 0.01) {
      throw new SaleCheckoutValidationError(400, 'Receipt total mismatch', 'ERR_INVALID_RECEIPT');
    }
  }

  const payments: SalePaymentPart[] = [];
  if (cashAmount > 0) payments.push({ method: 'cash', amount: cashAmount });
  if (hasDebt && computed.debtAmount > 0) payments.push({ method: 'debt', amount: computed.debtAmount });
  if (hasTransfer && computed.transferAmount > 0) payments.push({ method: 'transfer', amount: computed.transferAmount });

  const saleTax = hasTransfer ? computed.tax : 0;
  const saleTaxRate = hasTransfer ? computed.taxRatePercent : 0;
  const saleTotal = hasDebt ? computed.totalIfDebt : computed.totalIfTransfer;

  const normalized: SaleReceiptInput = {
    ...receipt,
    paymentMethod: 'mixed',
    payments,
    subtotal: computed.subtotal,
    tax: saleTax,
    taxRatePercent: saleTaxRate,
    total: saleTotal,
    balanceDue: hasDebt ? computed.debtAmount : 0,
    mixedTaxIncluded: false,
    ...(cashAmount > 0 && receipt.amountPaid != null
      ? {
          amountPaid: roundMoney(receipt.amountPaid),
          changeGiven: roundMoney(Math.max(0, (receipt.amountPaid ?? cashAmount) - saleTotal)),
        }
      : {}),
  };

  const soldAsDebt = hasDebt;
  return {
    receipt: normalized,
    paymentMethod: 'mixed',
    soldAsDebt,
    debtStatus: soldAsDebt ? 'pending' : undefined,
  };
}
