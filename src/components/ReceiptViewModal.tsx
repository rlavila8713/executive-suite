import { useMemo } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import type { Transaction } from '../types';
import { Modal, Button } from './ui';
import { SaleReceiptPanel } from './SaleReceiptPanel';
import { useI18n } from '../i18n/I18nContext';
import { printReceiptInNewWindow, type ReceiptPrintLabels } from '../lib/receiptPrintHtml';

export type ReceiptViewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  /** When true, show a short success banner (e.g. right after checkout). */
  showSuccessBanner?: boolean;
};

export function ReceiptViewModal({ isOpen, onClose, transaction, showSuccessBanner }: ReceiptViewModalProps) {
  const { t, locale } = useI18n();
  const receipt = transaction?.receipt;

  const printLabels = useMemo<ReceiptPrintLabels>(
    () => ({
      order: t('receipt.order'),
      date: t('receipt.date'),
      customer: t('receipt.customer'),
      sku: t('receipt.sku'),
      subtotal: t('receipt.subtotal'),
      tax: t('receipt.tax'),
      taxWithRate: (rate) => t('receipt.taxWithRate', { rate }),
      total: t('receipt.total'),
      payment: t('receipt.payment'),
      paymentCash: t('receipt.paymentCash'),
      paymentCard: t('receipt.paymentCard'),
      paymentTransfer: t('receipt.paymentTransfer'),
      paymentOther: t('receipt.paymentOther'),
      thankYou: t('receipt.thankYou'),
    }),
    [t],
  );

  const handlePrint = () => {
    if (!transaction?.receipt) return;
    printReceiptInNewWindow(
      transaction.receipt,
      transaction.customer,
      transaction.orderNumber,
      transaction.createdAt,
      locale,
      printLabels,
    );
  };

  if (!isOpen || !transaction || !receipt) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('receipt.title')}>
      <div className="space-y-4">
        {showSuccessBanner ? (
          <div className="flex items-center gap-3 rounded-lg bg-tertiary-container/15 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="shrink-0 text-on-tertiary-container" size={22} />
            <div>
              <p className="font-bold">{t('pos.transactionComplete')}</p>
              <p className="text-xs text-on-surface-variant">{t('pos.orderProcessed')}</p>
            </div>
          </div>
        ) : null}

        <SaleReceiptPanel
          receipt={receipt}
          customerName={transaction.customer}
          orderNumber={transaction.orderNumber}
          createdAt={transaction.createdAt}
        />

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1 flex items-center justify-center gap-2" onClick={handlePrint}>
            <Printer size={18} /> {t('receipt.print')}
          </Button>
          <Button type="button" className="flex-1" onClick={onClose}>
            {t('pos.done')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
