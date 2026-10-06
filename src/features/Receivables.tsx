import { useMemo, useState } from 'react';
import { Search, HandCoins, Banknote, CreditCard, ArrowLeftRight, CheckCircle2, UserPlus } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { CardQrModal } from '../components/CardQrModal';
import type { Customer, Transaction } from '../types';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n } from '../i18n/I18nContext';
import { isDebtSaleRecord, isPendingDebtSale } from '../lib/reporting';
import { receivableBalanceDue } from '../lib/paymentSplits';
import { ReceiptViewModal } from '../components/ReceiptViewModal';
import { TablePagination } from '../components/TablePagination';
import { usePagination } from '../lib/usePagination';
import { findCustomerByDisplayName, formatCustomerName, isAdHocSaleCustomerName } from '../lib/customers';
import { buildOnlineQrPayload, buildTransferQrPayload } from '../lib/paymentQr';
import { cn } from '../lib/utils';

type DateFilter = 'all' | 'today' | 'month' | 'range';

function startOfLocalDay(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfLocalMonth(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

interface ReceivablesProps {
  transactions: Transaction[];
  customers: Customer[];
  globalSearch?: string;
  taxRatePercent: number;
  cardQrPayload: string;
  transferAccountNumber: string;
  transferPhoneNumber: string;
  onCollect: (id: string, paymentMethod: 'cash' | 'card' | 'transfer') => Promise<void>;
  onOpenCustomer: (customerId: string) => void;
  onRegisterCustomer: (tx: Transaction) => Promise<void>;
}

export function Receivables({
  transactions,
  customers,
  globalSearch = '',
  taxRatePercent,
  cardQrPayload,
  transferAccountNumber,
  transferPhoneNumber,
  onCollect,
  onOpenCustomer,
  onRegisterCustomer,
}: ReceivablesProps) {
  const { t, locale } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [collectTx, setCollectTx] = useState<Transaction | null>(null);
  const [collectMethod, setCollectMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [collectBusy, setCollectBusy] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [receiptTx, setReceiptTx] = useState<Transaction | null>(null);
  const [collectQrOpen, setCollectQrOpen] = useState(false);
  const [registerBusyId, setRegisterBusyId] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const debtSales = useMemo(
    () =>
      transactions
        .filter((tx) => isDebtSaleRecord(tx))
        .sort((a, b) => b.createdAt - a.createdAt),
    [transactions],
  );

  const pending = useMemo(() => debtSales.filter((tx) => isPendingDebtSale(tx)), [debtSales]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const monthStart = startOfLocalMonth(now);
    const dayStart = startOfLocalDay(now);
    return debtSales.filter((tx) => {
      if (dateFilter === 'today' && tx.createdAt < dayStart) return false;
      if (dateFilter === 'month' && tx.createdAt < monthStart) return false;
      if (dateFilter === 'range' && rangeStart && rangeEnd) {
        const start = startOfLocalDay(new Date(`${rangeStart}T12:00:00`).getTime());
        const end = startOfLocalDay(new Date(`${rangeEnd}T12:00:00`).getTime()) + 86400000 - 1;
        if (tx.createdAt < start || tx.createdAt > end) return false;
      }
      const productText = (tx.receipt?.lines ?? []).flatMap((l) => [l.name, l.sku]).join(' ');
      return (
        rowMatchesSearch(searchTerm, [tx.customer, tx.orderNumber, productText, String(tx.amount)]) &&
        rowMatchesSearch(globalSearch, [tx.customer, tx.orderNumber, productText, String(tx.amount)])
      );
    });
  }, [debtSales, dateFilter, rangeStart, rangeEnd, searchTerm, globalSearch]);

  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  const totalPending = useMemo(
    () => Math.round(pending.reduce((s, tx) => s + receivableBalanceDue(tx), 0) * 100) / 100,
    [pending],
  );

  const collectBalanceDue = collectTx ? receivableBalanceDue(collectTx) : 0;
  const collectMixedTaxIncluded = collectTx?.receipt?.mixedTaxIncluded === true;
  const collectPartialMixedDebt =
    collectTx?.receipt?.paymentMethod === 'mixed' &&
    (collectTx.receipt?.payments?.some((p) => p.method === 'cash') ?? false);
  const collectTaxBase = collectPartialMixedDebt
    ? collectBalanceDue
    : collectTx
      ? Math.abs(collectTx.receipt?.subtotal ?? collectTx.amount)
      : 0;
  const collectTax =
    collectTx && collectMethod === 'transfer' && !collectMixedTaxIncluded
      ? Math.round(collectTaxBase * (taxRatePercent / 100) * 100) / 100
      : 0;
  const collectTotal = collectMixedTaxIncluded ? collectBalanceDue : collectTaxBase + collectTax;

  const payQrPayload = useMemo(() => {
    if (collectMethod === 'transfer') {
      return buildTransferQrPayload({
        accountNumber: transferAccountNumber,
        phoneNumber: transferPhoneNumber,
      });
    }
    if (collectMethod === 'card') {
      return buildOnlineQrPayload(cardQrPayload);
    }
    return '';
  }, [collectMethod, transferAccountNumber, transferPhoneNumber, cardQrPayload]);

  const resolveCustomerId = (tx: Transaction): string | undefined => {
    if (tx.customerId) return tx.customerId;
    return findCustomerByDisplayName(customers, tx.customer)?.id;
  };

  const needsCustomerRegistration = (tx: Transaction): boolean => {
    if (!isPendingDebtSale(tx)) return false;
    if (resolveCustomerId(tx)) return false;
    return !isAdHocSaleCustomerName(tx.customer, t('pos.walkInCustomer'));
  };

  const handleRegisterCustomer = async (tx: Transaction) => {
    setRegisterBusyId(tx.id);
    setFlashMessage(null);
    try {
      await onRegisterCustomer(tx);
      setFlashMessage({
        kind: 'success',
        text: t('receivables.registerCustomerSuccess', { name: tx.customer }),
      });
    } catch (err) {
      setFlashMessage({ kind: 'error', text: mapMutationError(err, t) });
    } finally {
      setRegisterBusyId(null);
    }
  };

  const handleCollect = async () => {
    if (!collectTx) return;
    setCollectBusy(true);
    setCollectError(null);
    try {
      await onCollect(collectTx.id, collectMethod);
      setCollectTx(null);
    } catch (err) {
      setCollectError(mapMutationError(err, t));
    } finally {
      setCollectBusy(false);
    }
  };

  const dateFmt = new Intl.DateTimeFormat(locale === 'es' ? 'es' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">
            {t('receivables.pageTitle')}
          </h2>
          <p className="text-on-surface-variant text-sm font-medium">{t('receivables.subtitle')}</p>
        </div>
      </div>

      {flashMessage ? (
        <div
          role="status"
          className={cn(
            'rounded-lg px-4 py-3 text-sm font-medium border',
            flashMessage.kind === 'success'
              ? 'bg-on-tertiary-container/15 text-on-tertiary-container border-on-tertiary-container/30'
              : 'bg-error-container text-on-error-container border-error/30',
          )}
        >
          {flashMessage.text}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white md:col-span-1">
          <p className="text-[10px] opacity-80 uppercase tracking-widest font-bold mb-1">{t('receivables.totalPending')}</p>
          <h3 className="text-3xl font-black tabular-nums">${totalPending.toLocaleString()}</h3>
          <p className="text-xs mt-2 opacity-90">{t('receivables.pendingCount', { count: pending.length })}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
            <Input
              className="pl-9"
              placeholder={t('receivables.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'today', 'month', 'range'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setDateFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
                  dateFilter === f
                    ? 'bg-primary text-white border-primary'
                    : 'border-black/10 text-on-surface-variant',
                )}
              >
                {t(`receivables.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
        {dateFilter === 'range' ? (
          <div className="flex flex-wrap gap-2 items-center">
            <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="w-auto" />
            <span className="text-on-surface-variant text-sm">—</span>
            <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="w-auto" />
          </div>
        ) : null}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-[10px] uppercase text-on-surface-variant">
                <th className="px-4 py-3">{t('receivables.colDate')}</th>
                <th className="px-4 py-3">{t('receivables.colCustomer')}</th>
                <th className="px-4 py-3">{t('receivables.colOrder')}</th>
                <th className="px-4 py-3">{t('receivables.colProducts')}</th>
                <th className="px-4 py-3 text-right">{t('receivables.colAmount')}</th>
                <th className="px-4 py-3">{t('receivables.colStatus')}</th>
                <th className="px-4 py-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                    {t('receivables.empty')}
                  </td>
                </tr>
              ) : (
                pageItems.map((tx) => {
                  const pendingRow = isPendingDebtSale(tx);
                  const customerId = resolveCustomerId(tx);
                  const showRegister = needsCustomerRegistration(tx);
                  return (
                    <tr key={tx.id} className="border-t border-black/5 hover:bg-surface-container-low/50">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">{dateFmt.format(tx.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold">
                        {customerId ? (
                          <button
                            type="button"
                            className="text-primary hover:underline text-left"
                            onClick={() => onOpenCustomer(customerId)}
                          >
                            {tx.customer}
                          </button>
                        ) : (
                          tx.customer
                        )}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">{tx.orderNumber}</td>
                      <td className="px-4 py-3 text-xs max-w-[14rem] truncate">
                        {(tx.receipt?.lines ?? []).map((l) => l.name).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">
                        ${(pendingRow ? receivableBalanceDue(tx) : Math.abs(tx.amount)).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase px-2 py-0.5 rounded',
                            pendingRow
                              ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                              : 'bg-on-tertiary-container/15 text-on-tertiary-container',
                          )}
                        >
                          {pendingRow ? t('receivables.statusPending') : t('receivables.statusCollected')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button type="button" variant="secondary" size="sm" onClick={() => setReceiptTx(tx)}>
                            {t('receivables.viewReceipt')}
                          </Button>
                          {pendingRow ? (
                            <>
                              {showRegister ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="gap-1"
                                  disabled={registerBusyId === tx.id}
                                  onClick={() => void handleRegisterCustomer(tx)}
                                >
                                  <UserPlus size={14} /> {t('receivables.registerCustomer')}
                                </Button>
                              ) : null}
                              <Button type="button" size="sm" className="gap-1" onClick={() => setCollectTx(tx)}>
                                <HandCoins size={14} /> {t('receivables.collect')}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
      </Card>

      <Modal isOpen={collectTx != null} onClose={() => !collectBusy && setCollectTx(null)} title={t('receivables.collectTitle')}>
        {collectTx ? (
          <div className="space-y-4">
            <p className="text-sm">
              {t('receivables.collectBody', {
                customer: collectTx.customer,
                amount: `$${collectTotal.toFixed(2)}`,
              })}
            </p>
            {collectMethod === 'transfer' && collectTax > 0 ? (
              <p className="text-xs text-on-surface-variant">
                {t('receivables.collectTaxNote', {
                  subtotal: collectSubtotal.toFixed(2),
                  tax: collectTax.toFixed(2),
                  rate: String(taxRatePercent),
                })}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'cash' as const, icon: Banknote, label: t('pos.cash') },
                  { id: 'transfer' as const, icon: ArrowLeftRight, label: t('pos.transfer') },
                  { id: 'card' as const, icon: CreditCard, label: t('pos.online') },
                ] as const
              ).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setCollectMethod(id);
                    if (id === 'transfer' || id === 'card') setCollectQrOpen(true);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg py-3 text-xs font-bold border',
                    collectMethod === id ? 'border-primary bg-primary/10 text-primary' : 'border-black/10',
                  )}
                >
                  <Icon size={18} /> {label}
                </button>
              ))}
            </div>
            {collectMethod === 'transfer' || collectMethod === 'card' ? (
              <p className="text-xs text-on-surface-variant">{t('receivables.collectQrHint')}</p>
            ) : null}
            {collectError ? <p className="text-sm text-error">{collectError}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" disabled={collectBusy} onClick={() => setCollectTx(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" className="flex-1 gap-1" disabled={collectBusy} onClick={() => void handleCollect()}>
                <CheckCircle2 size={16} /> {t('receivables.confirmCollect')}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <CardQrModal
        open={collectQrOpen && collectTx != null && (collectMethod === 'transfer' || collectMethod === 'card')}
        onClose={() => setCollectQrOpen(false)}
        payload={payQrPayload}
        title={collectMethod === 'transfer' ? t('pos.transferQrTitle') : t('pos.onlineQrTitle')}
        hint={collectMethod === 'transfer' ? t('pos.transferQrHint') : t('pos.onlineQrHint')}
        empty={collectMethod === 'transfer' ? t('pos.transferQrEmpty') : t('pos.onlineQrEmpty')}
      />

      <ReceiptViewModal
        isOpen={receiptTx != null}
        onClose={() => setReceiptTx(null)}
        transaction={receiptTx}
      />
    </div>
  );
}
