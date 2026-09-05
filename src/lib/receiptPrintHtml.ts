import type { SaleReceipt } from '../types';

export type ReceiptPrintLabels = {
  order: string;
  date: string;
  customer: string;
  sku: string;
  subtotal: string;
  tax: string;
  taxWithRate: (rate: string) => string;
  total: string;
  payment: string;
  paymentCash: string;
  paymentCard: string;
  paymentTransfer: string;
  paymentOther: string;
  amountPaid: string;
  changeGiven: string;
  thankYou: string;
};

function money(n: number): string {
  return n.toFixed(2);
}

/** Minimal inline-styled HTML for thermal-style receipts (new window / print). */
export function buildReceiptPrintHtml(
  receipt: SaleReceipt,
  customerName: string,
  orderNumber: string,
  createdAt: number,
  locale: string,
  labels: ReceiptPrintLabels,
): string {
  const dateStr = new Date(createdAt).toLocaleString(locale === 'es' ? 'es' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const rateStr =
    receipt.taxRatePercent % 1 === 0 ? receipt.taxRatePercent.toFixed(0) : receipt.taxRatePercent.toFixed(2);
  const taxLabel = receipt.tax > 0 ? labels.taxWithRate(rateStr) : labels.tax;
  const pay =
    receipt.paymentMethod === 'card'
      ? labels.paymentCard
      : receipt.paymentMethod === 'transfer'
        ? labels.paymentTransfer
        : receipt.paymentMethod === 'other'
          ? labels.paymentOther
          : labels.paymentCash;

  const linesHtml = receipt.lines
    .map(
      (line) => `
    <div style="margin-bottom:12px;border-bottom:1px dashed #d4d4d8;padding-bottom:8px">
      <div style="font-weight:700;font-size:14px">${escapeHtml(line.name)}</div>
      <div style="font-size:10px;color:#71717a">${escapeHtml(labels.sku)}: ${escapeHtml(line.sku)}</div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:12px">
        <span style="color:#52525b">${line.quantity} × $${money(line.unitPrice)}</span>
        <strong>$${money(line.lineTotal)}</strong>
      </div>
    </div>`,
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(orderNumber)}</title>
<style>@page{margin:8mm}body{margin:0;padding:0;font:13px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#18181b;background:#fff}</style>
</head><body>
<div style="max-width:280px;margin:0 auto">
  <div style="text-align:center;border-bottom:1px dashed #d4d4d8;padding-bottom:12px;margin-bottom:12px">
    <div style="font-size:18px;font-weight:800">${escapeHtml(receipt.storeName)}</div>
    ${receipt.branch.trim() ? `<div style="font-size:12px;color:#52525b;margin-top:4px">${escapeHtml(receipt.branch)}</div>` : ''}
    <div style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#71717a;margin-top:8px">${escapeHtml(receipt.currency)}</div>
  </div>
  <div style="font-size:12px;color:#3f3f46;margin-bottom:12px;border-bottom:1px dashed #d4d4d8;padding-bottom:12px">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#71717a">${escapeHtml(labels.order)}</span><strong>${escapeHtml(orderNumber)}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#71717a">${escapeHtml(labels.date)}</span><span>${escapeHtml(dateStr)}</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:#71717a">${escapeHtml(labels.customer)}</span><span style="text-align:right;max-width:60%">${escapeHtml(customerName)}</span></div>
  </div>
  ${linesHtml}
  <div style="font-size:14px;margin-top:8px">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#52525b">${escapeHtml(labels.subtotal)}</span><span>$${money(receipt.subtotal)}</span></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#52525b">${escapeHtml(taxLabel)}</span><span>$${money(receipt.tax)}</span></div>
    <div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:8px;border-top:1px solid #18181b;font-weight:800;font-size:16px">
      <span>${escapeHtml(labels.total)}</span><span>$${money(receipt.total)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#52525b">
      <span>${escapeHtml(labels.payment)}</span><strong style="color:#18181b">${escapeHtml(pay)}</strong>
    </div>
    ${
      receipt.paymentMethod === 'cash' && receipt.amountPaid != null
        ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #d4d4d8;font-size:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#52525b">${escapeHtml(labels.amountPaid)}</span><span>$${money(receipt.amountPaid)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px"><span>${escapeHtml(labels.changeGiven)}</span><span>$${money(receipt.changeGiven ?? 0)}</span></div>
    </div>`
        : ''
    }
  </div>
  <p style="text-align:center;font-size:12px;color:#52525b;margin-top:16px;padding-top:12px;border-top:1px dashed #d4d4d8">${escapeHtml(labels.thankYou)}</p>
</div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printReceiptInNewWindow(
  receipt: SaleReceipt,
  customerName: string,
  orderNumber: string,
  createdAt: number,
  locale: string,
  labels: ReceiptPrintLabels,
): boolean {
  const html = buildReceiptPrintHtml(receipt, customerName, orderNumber, createdAt, locale, labels);
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 200);
  return true;
}
