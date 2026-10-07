export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeMixedSaleTotals(subtotal: number, cashAmount: number, taxRatePercent: number) {
  const cash = roundMoney(Math.max(0, cashAmount));
  const unpaidSubtotal = roundMoney(Math.max(0, subtotal - cash));
  const tax = roundMoney(unpaidSubtotal * (taxRatePercent / 100));
  const transferAmount = roundMoney(unpaidSubtotal + tax);
  const debtAmount = unpaidSubtotal;
  const totalIfTransfer = roundMoney(subtotal + tax);
  const totalIfDebt = roundMoney(subtotal);

  return {
    subtotal: roundMoney(subtotal),
    cashAmount: cash,
    unpaidSubtotal,
    tax,
    taxRatePercent: unpaidSubtotal > 0 && taxRatePercent > 0 ? taxRatePercent : 0,
    transferAmount,
    debtAmount,
    totalIfTransfer,
    totalIfDebt,
    remainder: transferAmount,
    total: totalIfTransfer,
  };
}
