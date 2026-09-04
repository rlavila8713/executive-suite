import { useMemo, useState } from 'react';
import { Card } from '../components/ui';
import type { Expense, Product, Transaction } from '../types';
import { dateRangeFromInputs } from '../lib/reporting';
import { reconcilePeriod, type IntegrityIssueKind } from '../lib/periodReconciliation';
import { useI18n } from '../i18n/I18nContext';
import { cn } from '../lib/utils';

interface ReconciliationProps {
  transactions: Transaction[];
  products: Product[];
  expenses: Expense[];
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Reconciliation({ transactions, products, expenses }: ReconciliationProps) {
  const { t } = useI18n();
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());

  const range = useMemo(() => dateRangeFromInputs(startDate, endDate), [startDate, endDate]);
  const result = useMemo(
    () => reconcilePeriod(transactions, products, range, expenses),
    [transactions, products, range, expenses],
  );

  const issueLabel = (kind: IntegrityIssueKind) => {
    const map: Record<IntegrityIssueKind, string> = {
      missingReceipt: t('reconciliation.issueMissingReceipt'),
      lineInternal: t('reconciliation.issueLineInternal'),
      linesVsSubtotal: t('reconciliation.issueLinesVsSubtotal'),
      subtotalPlusTax: t('reconciliation.issueSubtotalPlusTax'),
      amountMismatch: t('reconciliation.issueAmountMismatch'),
    };
    return map[kind];
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">
          {t('reconciliation.title')}
        </h2>
        <p className="text-on-surface-variant text-sm font-medium">{t('reconciliation.subtitle')}</p>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.dateFrom')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block rounded-lg border border-black/10 px-3 py-2 text-sm dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.dateTo')}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block rounded-lg border border-black/10 px-3 py-2 text-sm dark:bg-slate-900"
            />
          </div>
        </div>
      </Card>

      <div
        className={cn(
          'rounded-xl p-4 border',
          result.isBalanced ? 'bg-tertiary-container/10 border-tertiary-container/30' : 'bg-error-container/20 border-error/30',
        )}
      >
        <p className="font-bold text-primary">
          {result.isBalanced ? t('reconciliation.balanced') : t('reconciliation.unbalanced')}
        </p>
        {!result.paymentsMatchSales ? (
          <p className="text-sm text-on-surface-variant mt-1">{t('reconciliation.paymentsMismatch')}</p>
        ) : null}
        {!result.receiptsBalanced ? (
          <p className="text-sm text-on-surface-variant mt-1">
            {t('reconciliation.issuesCount', { count: result.issues.length })}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label={t('reconciliation.grossSales')} value={`$${result.grossSales.toFixed(2)}`} />
        <MetricCard label={t('reconciliation.reversedSales')} value={`$${result.reversedAmount.toFixed(2)}`} />
        <MetricCard label={t('reconciliation.netSales')} value={`$${result.netSales.toFixed(2)}`} />
        <MetricCard label={t('reconciliation.cogs')} value={`$${result.cogs.toFixed(2)}`} />
        <MetricCard label={t('reconciliation.grossProfit')} value={`$${result.grossProfit.toFixed(2)}`} />
        <MetricCard label={t('reconciliation.grossMargin')} value={`${result.grossMarginPercent.toFixed(1)}%`} />
        <MetricCard label={t('reconciliation.expenses')} value={`$${result.expensesTotal.toFixed(2)}`} />
        <MetricCard label={t('reconciliation.operatingResult')} value={`$${result.operatingResult.toFixed(2)}`} />
        <MetricCard label={t('reconciliation.unitsSold')} value={String(result.unitsSold)} />
        <MetricCard label={t('reconciliation.inventoryCost')} value={`$${result.inventoryValueAtCost.toFixed(2)}`} />
      </div>

      <Card title={t('reconciliation.paymentsTitle')} className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['cash', 'card', 'transfer', 'other'] as const).map((k) => {
            const label =
              k === 'cash'
                ? t('reports.paymentCash')
                : k === 'card'
                  ? t('reports.paymentCard')
                  : k === 'transfer'
                    ? t('reports.paymentTransfer')
                    : t('reports.paymentOther');
            return (
              <div key={k} className="rounded-lg bg-surface-container-low p-3">
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">{label}</p>
                <p className="text-lg font-black text-primary">${result.payments[k].toFixed(2)}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {result.issues.length > 0 ? (
        <Card title={t('reconciliation.issuesTitle')} className="p-0 overflow-hidden">
          <ul className="divide-y divide-black/5 text-sm">
            {result.issues.map((issue, i) => (
              <li key={`${issue.saleId}-${issue.kind}-${i}`} className="px-4 py-3">
                <span className="font-bold">{issue.orderNumber}</span>
                <span className="text-on-surface-variant"> — {issueLabel(issue.kind)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">{label}</p>
      <p className="text-xl font-black text-primary mt-2">{value}</p>
    </Card>
  );
}
