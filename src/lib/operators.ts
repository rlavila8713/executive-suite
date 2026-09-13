import type { Transaction } from '../types';

export function transactionOperatorName(tx: Pick<Transaction, 'operatorName'> & {
  receipt?: { operatorName?: string };
}): string {
  return (tx.operatorName ?? tx.receipt?.operatorName ?? '').trim();
}

export function uniqueOperatorNames(transactions: Transaction[]): string[] {
  const names = new Set<string>();
  for (const tx of transactions) {
    const name = transactionOperatorName(tx);
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
