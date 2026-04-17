import type { SaleReceipt } from '../types';
import { useI18n } from '../i18n/I18nContext';

function money(n: number): string {
  return n.toFixed(2);
}

export type SaleReceiptPanelProps = {
  receipt: SaleReceipt;
  customerName: string;
  orderNumber: string;
  createdAt: number;
  /** Set for print CSS targeting. */
  id?: string;
  className?: string;
};

export function SaleReceiptPanel({
  receipt,
  customerName,
  orderNumber,
  createdAt,
  id = 'receipt-print-root',
  className = '',
}: SaleReceiptPanelProps) {
  const { t, locale } = useI18n();
  const dateStr = new Date(createdAt).toLocaleString(locale === 'es' ? 'es' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const rateStr =
    receipt.taxRatePercent % 1 === 0 ? receipt.taxRatePercent.toFixed(0) : receipt.taxRatePercent.toFixed(2);
  const taxLabel =
    receipt.tax > 0 ? t('receipt.taxWithRate', { rate: rateStr }) : t('receipt.tax');

  return (
    <div
      id={id}
      className={`receipt-ticket bg-white text-zinc-900 dark:bg-white dark:text-zinc-900 rounded-lg border border-zinc-200 p-5 text-[13px] leading-snug font-mono ${className}`}
    >
      <div className="text-center border-b border-dashed border-zinc-300 pb-3 mb-3">
        <p className="font-headline font-extrabold text-lg tracking-tight text-zinc-900">{receipt.storeName}</p>
        {receipt.branch.trim() ? <p className="text-xs text-zinc-600 mt-1">{receipt.branch}</p> : null}
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2">{receipt.currency}</p>
      </div>

      <div className="space-y-1 text-xs text-zinc-700 mb-3 border-b border-dashed border-zinc-300 pb-3">
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">{t('receipt.order')}</span>
          <span className="font-bold text-zinc-900">{orderNumber}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">{t('receipt.date')}</span>
          <span className="text-right">{dateStr}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500">{t('receipt.customer')}</span>
          <span className="text-right truncate max-w-[60%]">{customerName}</span>
        </div>
      </div>

      <div className="border-b border-dashed border-zinc-300 pb-3 mb-3 space-y-3">
        {receipt.lines.map((line, i) => (
          <div key={`${line.sku}-${i}`}>
            <p className="font-semibold text-zinc-900 text-sm">{line.name}</p>
            <p className="text-[10px] text-zinc-500">
              {t('receipt.sku')}: {line.sku}
            </p>
            <div className="flex justify-between mt-1 text-xs">
              <span className="text-zinc-600">
                {line.quantity} × ${money(line.unitPrice)}
              </span>
              <span className="font-bold">${money(line.lineTotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-600">{t('receipt.subtotal')}</span>
          <span>${money(receipt.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600">{taxLabel}</span>
          <span>${money(receipt.tax)}</span>
        </div>
        <div className="flex justify-between pt-2 mt-2 border-t border-zinc-900 font-extrabold text-base">
          <span>{t('receipt.total')}</span>
          <span>${money(receipt.total)}</span>
        </div>
        <div className="flex justify-between text-xs pt-1 text-zinc-600">
          <span>{t('receipt.payment')}</span>
          <span className="font-bold text-zinc-900">
            {receipt.paymentMethod === 'card'
              ? t('receipt.paymentCard')
              : receipt.paymentMethod === 'transfer'
                ? t('receipt.paymentTransfer')
                : receipt.paymentMethod === 'other'
                  ? t('receipt.paymentOther')
                  : t('receipt.paymentCash')}
          </span>
        </div>
      </div>

      <p className="text-center text-xs text-zinc-600 mt-4 pt-3 border-t border-dashed border-zinc-300">
        {t('receipt.thankYou')}
      </p>
    </div>
  );
}
