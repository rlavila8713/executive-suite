import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input } from '../components/ui';
import type { CashSession, Transaction } from '../types';
import { sessionPaymentBreakdown } from '../lib/reporting';
import { computeSessionAnomalies, sessionHasAnomalies } from '../lib/cashAnomalies';
import { useI18n } from '../i18n/I18nContext';
import { cn } from '../lib/utils';
import { AlertTriangle } from 'lucide-react';

interface CashProps {
  cashSessions: CashSession[];
  transactions: Transaction[];
  onOpenCashSession: (openingCash: number) => Promise<void>;
  onCloseCashSession: (id: string, closingCash: number) => Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

const ZERO_PAYMENTS = { cash: 0, card: 0, transfer: 0, other: 0 };

export function Cash({
  cashSessions,
  transactions,
  onOpenCashSession,
  onCloseCashSession,
  onRefresh,
}: CashProps) {
  const { t, locale } = useI18n();
  const [openingInput, setOpeningInput] = useState('');
  const [closingById, setClosingById] = useState<Record<string, string>>({});
  const [cashMsg, setCashMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const openSession = cashSessions.find((s) => s.closedAt == null) ?? null;

  useEffect(() => {
    void onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    if (!openSession) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, [openSession?.id]);

  const payBreak = useMemo(() => {
    if (openSession) {
      return sessionPaymentBreakdown(transactions, openSession.openedAt);
    }
    const lastClosed = cashSessions.find((s) => s.closedAt != null);
    if (lastClosed) {
      return {
        cash: lastClosed.totalCashSales,
        card: lastClosed.totalCardSales,
        transfer: lastClosed.totalTransferSales,
        other: lastClosed.totalOtherSales,
      };
    }
    return ZERO_PAYMENTS;
  }, [openSession, cashSessions, transactions, tick]);

  const sessionBreakdownForRow = (session: CashSession) => {
    if (session.closedAt != null) {
      return {
        cash: session.totalCashSales,
        card: session.totalCardSales,
        transfer: session.totalTransferSales,
        other: session.totalOtherSales,
      };
    }
    return sessionPaymentBreakdown(transactions, session.openedAt);
  };

  const anomalyLabel = (kind: string) => {
    if (kind === 'cash_shortfall') return t('cash.anomalyShortfall');
    if (kind === 'cash_surplus') return t('cash.anomalySurplus');
    return t('cash.anomalyVariance');
  };

  const paymentLabel = (k: 'cash' | 'card' | 'transfer' | 'other') => {
    if (k === 'cash') return t('reports.paymentCash');
    if (k === 'card') return t('reports.paymentCard');
    if (k === 'transfer') return t('reports.paymentTransfer');
    return t('reports.paymentOther');
  };

  const handleOpenCash = async () => {
    setCashMsg(null);
    const v = parseFloat(openingInput.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) {
      setCashMsg(t('cash.invalidAmount'));
      return;
    }
    try {
      await onOpenCashSession(v);
      setOpeningInput('');
      await onRefresh?.();
    } catch (e) {
      setCashMsg(e instanceof Error && e.message === 'ERR_CASH_SESSION_OPEN' ? t('reports.cashErrOpen') : String(e));
    }
  };

  const handleCloseCash = async (id: string) => {
    setCashMsg(null);
    const raw = closingById[id] ?? '';
    const v = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) {
      setCashMsg(t('cash.invalidAmount'));
      return;
    }
    try {
      await onCloseCashSession(id, v);
      setClosingById((m) => ({ ...m, [id]: '' }));
      await onRefresh?.();
    } catch (e) {
      setCashMsg(String(e));
    }
  };

  const expectedCash =
    openSession != null ? openSession.openingCash + payBreak.cash : null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">{t('cash.title')}</h2>
        <p className="text-on-surface-variant text-sm font-medium">{t('cash.subtitle')}</p>
      </div>

      <Card title={t('reports.paymentSplit')} className="p-4 sm:p-6">
        <p className="text-xs text-on-surface-variant mb-4">
          {openSession ? t('cash.liveSessionNote') : t('cash.closedSessionNote')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['cash', 'card', 'transfer', 'other'] as const).map((k) => (
            <div key={k} className="rounded-xl bg-surface-container-low p-3">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{paymentLabel(k)}</p>
              <p className="text-lg font-black text-primary mt-1">${payBreak[k].toFixed(2)}</p>
            </div>
          ))}
        </div>
        {expectedCash != null ? (
          <p className="text-sm font-bold text-primary mt-4">
            {t('cash.expectedCash')}: ${expectedCash.toFixed(2)}
          </p>
        ) : null}
      </Card>

      <Card title={t('reports.cashOpenSession')} className="p-4 sm:p-6">
        {cashMsg ? <p className="text-sm text-error mb-3">{cashMsg}</p> : null}
        {openSession ? (
          <p className="text-sm font-bold text-primary mb-3">{t('reports.cashActive')}</p>
        ) : (
          <p className="text-sm text-on-surface-variant mb-3">{t('reports.cashNoneOpen')}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.cashOpening')}</label>
            <Input value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} type="text" className="mt-1" />
          </div>
          <Button type="button" disabled={!!openSession} onClick={handleOpenCash}>
            {t('reports.cashOpen')}
          </Button>
        </div>
      </Card>

      <Card title={t('reports.cashSessionsTitle')} className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-left text-[10px] uppercase text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">{t('reports.dateFrom')}</th>
                <th className="px-4 py-3">{t('reports.dateTo')}</th>
                <th className="px-4 py-3 text-right">{t('reports.cashOpening')}</th>
                <th className="px-4 py-3 text-right">{t('reports.cashClosing')}</th>
                <th className="px-4 py-3 text-right">{t('reports.paymentCash')}</th>
                <th className="px-4 py-3 text-right">{t('reports.paymentCard')}</th>
                <th className="px-4 py-3 text-right">{t('reports.paymentTransfer')}</th>
                <th className="px-4 py-3 text-right">{t('reports.paymentOther')}</th>
                <th className="px-4 py-3">{t('dashboard.status')}</th>
                <th className="px-4 py-3">{t('cash.anomaliesCol')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cashSessions.map((s) => {
                const rowPay = sessionBreakdownForRow(s);
                const anomalies = computeSessionAnomalies(s);
                const hasAnomalies = sessionHasAnomalies(s);
                return (
                  <tr
                    key={s.id}
                    className={cn('border-t border-black/5', hasAnomalies && 'bg-amber-50/60 dark:bg-amber-950/20')}
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(s.openedAt).toLocaleString(locale === 'es' ? 'es' : 'en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {s.closedAt
                        ? new Date(s.closedAt).toLocaleString(locale === 'es' ? 'es' : 'en-US', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">${s.openingCash.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{s.closingCash != null ? `$${s.closingCash.toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-2 text-right">${rowPay.cash.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${rowPay.card.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${rowPay.transfer.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${rowPay.other.toFixed(2)}</td>
                    <td className="px-4 py-2">{s.closedAt == null ? t('reports.statusOpen') : t('reports.statusClosed')}</td>
                    <td className="px-4 py-2">
                      {hasAnomalies ? (
                        <div className="space-y-1">
                          {anomalies.map((a, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200 font-medium"
                            >
                              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                              <span>
                                {anomalyLabel(a.kind)}
                                {s.cashVariance != null ? ` (${s.cashVariance >= 0 ? '+' : ''}${s.cashVariance.toFixed(2)})` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : s.closedAt != null ? (
                        <span className="text-xs text-on-tertiary-container font-medium">{t('cash.noAnomalies')}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {s.closedAt == null ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <Input
                            className="w-28"
                            placeholder="0"
                            value={closingById[s.id] ?? ''}
                            onChange={(e) => setClosingById((m) => ({ ...m, [s.id]: e.target.value }))}
                          />
                          <Button type="button" size="sm" onClick={() => handleCloseCash(s.id)}>
                            {t('reports.cashClose')}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
