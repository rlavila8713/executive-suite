export type CashAnomalyKind = 'cash_shortfall' | 'cash_surplus' | 'drawer_variance';

export type CashAnomaly = {
  kind: CashAnomalyKind;
  message: string;
  expectedCash: number;
  closingCash: number;
  cashSales: number;
  variance: number;
};

const MONEY_EPS = 0.01;

export function detectCashAnomalies(
  openingCash: number,
  closingCash: number,
  cashSales: number,
): CashAnomaly[] {
  const expectedCash = openingCash + cashSales;
  const cashIncrease = closingCash - openingCash;
  const variance = closingCash - expectedCash;
  const anomalies: CashAnomaly[] = [];

  if (cashIncrease + MONEY_EPS < cashSales) {
    anomalies.push({
      kind: 'cash_shortfall',
      message: 'cash_shortfall',
      expectedCash,
      closingCash,
      cashSales,
      variance,
    });
  }

  if (variance > MONEY_EPS) {
    anomalies.push({
      kind: 'cash_surplus',
      message: 'cash_surplus',
      expectedCash,
      closingCash,
      cashSales,
      variance,
    });
  } else if (variance < -MONEY_EPS) {
    anomalies.push({
      kind: 'drawer_variance',
      message: 'drawer_variance',
      expectedCash,
      closingCash,
      cashSales,
      variance,
    });
  }

  return anomalies;
}
