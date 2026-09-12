import { useMemo } from 'react';
import { ArrowRight, Banknote } from 'lucide-react';
import type { CashSession, Screen, Transaction } from '../types';
import { cn } from '../lib/utils';
import { resolveTransactionPaymentMethod } from '../lib/reporting';
import { useI18n } from '../i18n/I18nContext';

function startOfLocalDay(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function compactMoney(value: number, locale: string): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString(locale === 'es' ? 'es' : 'en-US', { maximumFractionDigits: 1 })}M`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toLocaleString(locale === 'es' ? 'es' : 'en-US', { maximumFractionDigits: 1 })}k`;
  }
  return value.toLocaleString(locale === 'es' ? 'es' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type CashStatusCardProps = {
  cashSessions: CashSession[];
  transactions: Transaction[];
  onNavigate: (screen: Screen) => void;
  className?: string;
};

export function CashStatusCard({ cashSessions, transactions, onNavigate, className }: CashStatusCardProps) {
  const { t, locale } = useI18n();

  const openSession = cashSessions.find((s) => s.closedAt == null) ?? null;
  const isOpen = openSession != null;

  const todayNetRevenue = useMemo(() => {
    const start = startOfLocalDay();
    return transactions
      .filter((tx) => tx.createdAt >= start)
      .reduce((sum, tx) => {
        if (tx.type === 'sale' && tx.status === 'completed') return sum + Math.abs(tx.amount);
        if (tx.type === 'return' || tx.status === 'reversed' || tx.status === 'refunded') {
          return sum - Math.abs(tx.amount);
        }
        return sum;
      }, 0);
  }, [transactions]);

  const todayByPayment = useMemo(() => {
    const start = startOfLocalDay();
    const totals = { cash: 0, card: 0, transfer: 0, other: 0 };
    for (const tx of transactions) {
      if (tx.createdAt < start) continue;
      const pm = resolveTransactionPaymentMethod(tx);
      const delta =
        tx.type === 'sale' && tx.status === 'completed'
          ? Math.abs(tx.amount)
          : tx.type === 'return' || tx.status === 'reversed' || tx.status === 'refunded'
            ? -Math.abs(tx.amount)
            : 0;
      if (delta !== 0) totals[pm] += delta;
    }
    return totals;
  }, [transactions]);

  const openedLabel =
    openSession != null
      ? new Date(openSession.openedAt).toLocaleTimeString(locale === 'es' ? 'es' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  const paymentChips = [
    { key: 'cash' as const, label: t('dashboard.cashChipCash'), value: todayByPayment.cash },
    { key: 'card' as const, label: t('dashboard.cashChipCard'), value: todayByPayment.card },
    { key: 'transfer' as const, label: t('dashboard.cashChipTransfer'), value: todayByPayment.transfer },
  ].filter((c) => c.value !== 0);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOpen}
      aria-label={t('dashboard.cashCardAria')}
      onClick={() => onNavigate('cash')}
      className={cn(
        'group relative overflow-hidden rounded-2xl p-6 text-left transition-all',
        'active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'border shadow-sm hover:shadow-md',
        isOpen
          ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 border-emerald-500/30 text-white'
          : 'bg-gradient-to-br from-rose-600 to-rose-700 border-rose-500/30 text-white',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl opacity-40',
          isOpen ? 'bg-emerald-300' : 'bg-rose-300',
        )}
      />

      <div className="relative z-10 flex h-full min-h-[11rem] flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                isOpen ? 'bg-white/15' : 'bg-white/10',
              )}
            >
              <Banknote size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">
                {t('dashboard.cashCardTitle')}
              </p>
              <p className="text-lg font-black leading-tight mt-0.5">
                {isOpen ? t('dashboard.cashOpen') : t('dashboard.cashClosed')}
              </p>
              {isOpen && openedLabel ? (
                <p className="text-xs font-medium text-white/80 mt-0.5">
                  {t('dashboard.cashOpenSince', { time: openedLabel })}
                </p>
              ) : (
                <p className="text-xs font-medium text-white/70 mt-0.5">{t('dashboard.cashClosedHint')}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              aria-hidden
              className={cn(
                'relative inline-flex h-8 w-14 rounded-full p-1 transition-colors shadow-inner',
                isOpen ? 'bg-emerald-900/40' : 'bg-rose-900/40',
              )}
            >
              <span
                className={cn(
                  'h-6 w-6 rounded-full bg-white shadow-md transition-transform',
                  isOpen ? 'translate-x-6' : 'translate-x-0',
                )}
              />
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                isOpen ? 'bg-white/20 text-white' : 'bg-white/15 text-white/90',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  isOpen ? 'bg-emerald-200 animate-pulse' : 'bg-rose-200',
                )}
              />
              {isOpen ? t('dashboard.cashStatusOn') : t('dashboard.cashStatusOff')}
            </span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            {t('dashboard.cashTodayRevenue')}
          </p>
          <p className="text-3xl sm:text-4xl font-black tracking-tight mt-1 tabular-nums">
            ${todayNetRevenue.toLocaleString(locale === 'es' ? 'es' : 'en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>

          {paymentChips.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {paymentChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 rounded-lg bg-black/15 px-2.5 py-1 text-[10px] font-bold text-white/95"
                >
                  <span className="text-white/70">{chip.label}</span>
                  <span>${compactMoney(chip.value, locale)}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/15">
          <p className="text-xs font-semibold text-white/85">{t('dashboard.cashCardHint')}</p>
          <ArrowRight
            size={16}
            className="shrink-0 text-white/80 transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </div>
    </button>
  );
}
