import { useMemo, useState } from 'react';
import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { CardQrModal } from '../components/CardQrModal';
import type { Transaction } from '../types';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n } from '../i18n/I18nContext';
import { isPayableRecord, isPendingPayable } from '../lib/reporting';
import { TablePagination } from '../components/TablePagination';
import { usePagination } from '../lib/usePagination';
import { buildTransferQrPayload, transferAccountConfigured } from '../lib/paymentQr';
import { cn } from '../lib/utils';

interface PayablesProps {
  transactions: Transaction[];
  globalSearch?: string;
  transferAccountNumber: string;
  transferPhoneNumber: string;
  onPay: (id: string) => Promise<void>;
  onVoid: (id: string) => Promise<void>;
}

export function Payables({
  transactions = [],
  globalSearch = '',
  transferAccountNumber = '',
  transferPhoneNumber = '',
  onPay,
  onVoid,
}: PayablesProps) {
  const { t, locale } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [payTx, setPayTx] = useState<Transaction | null>(null);
  const [voidTx, setVoidTx] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const payables = useMemo(
    () => transactions.filter((tx) => isPayableRecord(tx)).sort((a, b) => b.createdAt - a.createdAt),
    [transactions],
  );

  const pending = useMemo(() => payables.filter((tx) => isPendingPayable(tx)), [payables]);

  const filtered = useMemo(() => {
    return payables.filter((tx) => {
      const ref = tx.receipt as { originalOrderNumber?: string } | undefined;
      return rowMatchesSearch(searchTerm, [
        tx.customer,
        tx.orderNumber,
        ref?.originalOrderNumber ?? '',
        String(tx.amount),
      ]) && rowMatchesSearch(globalSearch, [tx.customer, tx.orderNumber, String(tx.amount)]);
    });
  }, [payables, searchTerm, globalSearch]);

  const totalPending = useMemo(
    () => Math.round(pending.reduce((s, tx) => s + Math.abs(tx.amount), 0) * 100) / 100,
    [pending],
  );

  const { page, setPage, pageSize, totalPages, total, pageItems } = usePagination(filtered, 12);
  const transferConfigured = transferAccountConfigured({
    accountNumber: transferAccountNumber,
    phoneNumber: transferPhoneNumber,
  });
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === 'es' ? 'es' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }),
    [locale],
  );

  const qrPayload = buildTransferQrPayload({ accountNumber: transferAccountNumber, phoneNumber: transferPhoneNumber });

  const confirmPay = async () => {
    if (!payTx) return;
    if (!transferConfigured) {
      setError(t('pos.transferQrEmpty'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onPay(payTx.id);
      setPayTx(null);
      setQrOpen(false);
    } catch (e) {
      setError(mapMutationError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const confirmVoid = async () => {
    if (!voidTx) return;
    setBusy(true);
    setError(null);
    try {
      await onVoid(voidTx.id);
      setVoidTx(null);
    } catch (e) {
      setError(mapMutationError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-primary font-headline tracking-tight">{t('payables.pageTitle')}</h2>
        <p className="text-on-surface-variant text-sm font-medium">{t('payables.subtitle')}</p>
      </div>

      <Card className="p-5 bg-gradient-to-br from-rose-600 to-rose-800 text-white border-0">
        <p className="text-[10px] opacity-80 uppercase tracking-widest font-bold mb-1">{t('payables.totalPending')}</p>
        <p className="text-3xl font-black">${totalPending.toFixed(2)}</p>
        <p className="text-xs mt-2 opacity-90">{t('payables.pendingCount', { count: pending.length })}</p>
      </Card>

      {!transferConfigured ? (
        <Card className="p-4 border-amber-500/40 bg-amber-500/10">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{t('pos.transferQrEmpty')}</p>
        </Card>
      ) : null}

      <Card className="p-4">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('payables.searchPlaceholder')}
          className="max-w-md"
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-container-low text-[10px] uppercase font-bold text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">{t('payables.colDate')}</th>
                <th className="px-4 py-3">{t('payables.colCustomer')}</th>
                <th className="px-4 py-3">{t('payables.colOrder')}</th>
                <th className="px-4 py-3">{t('payables.colReference')}</th>
                <th className="px-4 py-3 text-right">{t('payables.colAmount')}</th>
                <th className="px-4 py-3">{t('payables.colStatus')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">{t('payables.empty')}</td>
                </tr>
              ) : (
                pageItems.map((tx) => {
                  const pendingRow = isPendingPayable(tx);
                  const ref = tx.receipt as { originalOrderNumber?: string } | undefined;
                  const statusLabel =
                    tx.payableStatus === 'paid'
                      ? t('payables.statusPaid')
                      : tx.payableStatus === 'void'
                        ? t('payables.statusVoid')
                        : t('payables.statusPending');
                  return (
                    <tr key={tx.id} className="border-t border-black/5 hover:bg-surface-container-low/50">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">{dateFmt.format(tx.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold">{tx.customer}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{tx.orderNumber}</td>
                      <td className="px-4 py-3 text-xs">{ref?.originalOrderNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">${Math.abs(tx.amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase px-2 py-0.5 rounded',
                            pendingRow
                              ? 'bg-rose-500/15 text-rose-800 dark:text-rose-200'
                              : 'bg-on-surface-variant/10 text-on-surface-variant',
                          )}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 flex-wrap">
                          {pendingRow ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                className="gap-1"
                                disabled={!transferConfigured}
                                onClick={() => {
                                  setError(null);
                                  setPayTx(tx);
                                }}
                              >
                                <ArrowLeftRight size={14} /> {t('payables.payTransfer')}
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="gap-1 text-error"
                                onClick={() => setVoidTx(tx)}
                              >
                                <Trash2 size={14} /> {t('payables.void')}
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

      <Modal isOpen={payTx != null} onClose={() => !busy && setPayTx(null)} title={t('payables.payTitle')}>
        {payTx ? (
          <div className="space-y-4">
            <p className="text-sm">
              {t('payables.payBody', {
                customer: payTx.customer,
                amount: `$${Math.abs(payTx.amount).toFixed(2)}`,
              })}
            </p>
            <p className="text-xs text-on-surface-variant">{t('payables.payQrHint')}</p>
            {error ? <p className="text-sm text-error font-medium">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" disabled={busy} onClick={() => setPayTx(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={busy || !transferConfigured}
                onClick={() => setQrOpen(true)}
              >
                {t('payables.showQr')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={busy || !transferConfigured}
                onClick={() => void confirmPay()}
              >
                {t('payables.confirmPay')}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <CardQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title={t('payables.payTitle')}
        payload={qrPayload}
        empty={t('pos.transferQrEmpty')}
        hint={t('payables.payQrHint')}
      />

      <Modal isOpen={voidTx != null} onClose={() => !busy && setVoidTx(null)} title={t('payables.voidTitle')}>
        {voidTx ? (
          <div className="space-y-4">
            <p className="text-sm">{t('payables.voidBody', { order: voidTx.orderNumber })}</p>
            {error ? <p className="text-sm text-error font-medium">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" disabled={busy} onClick={() => setVoidTx(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="danger" className="flex-1" disabled={busy} onClick={() => void confirmVoid()}>
                {t('payables.confirmVoid')}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
