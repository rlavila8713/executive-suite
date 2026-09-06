import type { CashAnomaly, CashSession } from '../types';

const MONEY_EPS = 0.01;

export function computeSessionAnomalies(session: CashSession): CashAnomaly[] {
  if (session.closedAt == null || session.closingCash == null) return [];
  if (session.anomalies?.length) return session.anomalies;

  const expectedCash = session.openingCash + session.totalCashSales;
  const cashIncrease = session.closingCash - session.openingCash;
  const variance = session.closingCash - expectedCash;
  const anomalies: CashAnomaly[] = [];

  if (cashIncrease + MONEY_EPS < session.totalCashSales) {
    anomalies.push({
      kind: 'cash_shortfall',
      expectedCash,
      closingCash: session.closingCash,
      cashSales: session.totalCashSales,
      variance,
    });
  }

  if (variance > MONEY_EPS) {
    anomalies.push({
      kind: 'cash_surplus',
      expectedCash,
      closingCash: session.closingCash,
      cashSales: session.totalCashSales,
      variance,
    });
  } else if (variance < -MONEY_EPS) {
    anomalies.push({
      kind: 'drawer_variance',
      expectedCash,
      closingCash: session.closingCash,
      cashSales: session.totalCashSales,
      variance,
    });
  }

  return anomalies;
}

export function sessionHasAnomalies(session: CashSession): boolean {
  return computeSessionAnomalies(session).length > 0;
}
