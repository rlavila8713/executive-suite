import type { Expense, PaymentMethod, Product, SaleReceiptLine, Transaction } from '../types';

export type DateRangeMs = { start: number; end: number };

export type SalesBucket = 'day' | 'week' | 'month';

export type SalesSeriesPoint = { key: string; label: string; revenue: number; orderCount: number };

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

/** Sale row that still counts toward revenue (not voided). */
export function isCompletedSale(tx: Transaction): boolean {
  return tx.type === 'sale' && tx.status === 'completed';
}

/** Sale row voided by reversal or refund (still type sale, positive amount). */
export function isReversedSale(tx: Transaction): boolean {
  return (
    tx.type === 'sale' &&
    (tx.status === 'reversed' || tx.status === 'refunded' || tx.amount < 0)
  );
}

/** Legacy return rows (negative amount, type return). */
export function isReturnRow(tx: Transaction): boolean {
  return tx.type === 'return' || (tx.amount < 0 && tx.type !== 'sale');
}

export function resolveTransactionPaymentMethod(tx: Transaction): PaymentMethod {
  if (tx.paymentMethod && PAYMENT_METHODS.includes(tx.paymentMethod)) return tx.paymentMethod;
  const r = tx.receipt?.paymentMethod;
  if (r && PAYMENT_METHODS.includes(r)) return r;
  return 'other';
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Inclusive range from yyyy-mm-dd strings (local). */
export function dateRangeFromInputs(startDate: string, endDate: string): DateRangeMs {
  const start = startOfLocalDay(new Date(`${startDate}T12:00:00`).getTime());
  const end = endOfLocalDay(new Date(`${endDate}T12:00:00`).getTime());
  if (end < start) return { start: end, end: start };
  return { start, end };
}

export function previousPeriodOfSameLength(range: DateRangeMs): DateRangeMs {
  const len = range.end - range.start + 1;
  return { start: range.start - len, end: range.start - 1 };
}

export function completedSalesInRange(transactions: Transaction[], range: DateRangeMs): Transaction[] {
  return transactions.filter(
    (tx) =>
      isCompletedSale(tx) &&
      tx.createdAt >= range.start &&
      tx.createdAt <= range.end,
  );
}

/** Completed sales in a cash session window (open → close or now). */
export function sessionPaymentBreakdown(
  transactions: Transaction[],
  openedAt: number,
  closedAt: number = Date.now(),
): Record<PaymentMethod, number> {
  return paymentMethodBreakdown(transactions, { start: openedAt, end: closedAt });
}

export function salesRevenue(transactions: Transaction[]): number {
  return transactions
    .filter((tx) => isCompletedSale(tx))
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
}

export function salesRevenueInRange(transactions: Transaction[], range: DateRangeMs): number {
  return completedSalesInRange(transactions, range).reduce((s, tx) => s + Math.abs(tx.amount), 0);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function bucketKeyForDay(ts: number): { key: string; label: string } {
  const d = new Date(ts);
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return { key, label: `${d.getMonth() + 1}/${d.getDate()}` };
}

/** ISO week-ish grouping (UTC-based for stable keys). */
function bucketKeyForWeek(ts: number, locale: string): { key: string; label: string } {
  const d = new Date(ts);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const key = `${t.getUTCFullYear()}-W${pad2(weekNo)}`;
  const label = d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return { key, label };
}

function bucketKeyForMonth(ts: number): { key: string; label: string } {
  const d = new Date(ts);
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  return { key, label: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}` };
}

export function groupSalesByBucket(
  transactions: Transaction[],
  range: DateRangeMs,
  bucket: SalesBucket,
  locale: string,
): SalesSeriesPoint[] {
  const sales = completedSalesInRange(transactions, range);
  const map = new Map<string, { label: string; revenue: number; orderCount: number }>();

  for (const tx of sales) {
    let k: { key: string; label: string };
    if (bucket === 'day') k = bucketKeyForDay(tx.createdAt);
    else if (bucket === 'week') {
      k = bucketKeyForWeek(tx.createdAt, locale);
    }
    else k = bucketKeyForMonth(tx.createdAt);

    const cur = map.get(k.key) ?? { label: k.label, revenue: 0, orderCount: 0 };
    cur.revenue += Math.abs(tx.amount);
    cur.orderCount += 1;
    cur.label = k.label;
    map.set(k.key, cur);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, label: v.label, revenue: Math.round(v.revenue * 100) / 100, orderCount: v.orderCount }));
}

export function paymentMethodBreakdown(transactions: Transaction[], range: DateRangeMs): Record<PaymentMethod, number> {
  const init = (): Record<PaymentMethod, number> => ({
    cash: 0,
    card: 0,
    transfer: 0,
    other: 0,
  });
  const out = init();
  for (const tx of completedSalesInRange(transactions, range)) {
    const m = resolveTransactionPaymentMethod(tx);
    out[m] += Math.abs(tx.amount);
  }
  (Object.keys(out) as PaymentMethod[]).forEach((k) => {
    out[k] = Math.round(out[k] * 100) / 100;
  });
  return out;
}

export function effectiveUnitCost(line: SaleReceiptLine, products: Product[]): number {
  if (line.unitCostSnapshot != null && Number.isFinite(line.unitCostSnapshot)) {
    return line.unitCostSnapshot;
  }
  if (line.productId) {
    const p = products.find((x) => x.id === line.productId);
    if (p) return p.cost;
  }
  const bySku = products.find((x) => x.sku === line.sku);
  if (bySku) return bySku.cost;
  return 0;
}

export function lineCOGS(line: SaleReceiptLine, products: Product[]): number {
  return line.quantity * effectiveUnitCost(line, products);
}

export function cogsForTransactions(transactions: Transaction[], products: Product[]): number {
  let sum = 0;
  for (const tx of transactions) {
    if (!isCompletedSale(tx) || !tx.receipt?.lines) continue;
    for (const line of tx.receipt.lines) {
      sum += lineCOGS(line, products);
    }
  }
  return Math.round(sum * 100) / 100;
}

export function cogsInRange(transactions: Transaction[], products: Product[], range: DateRangeMs): number {
  return cogsForTransactions(completedSalesInRange(transactions, range), products);
}

export function profitGrossInRange(transactions: Transaction[], products: Product[], range: DateRangeMs): {
  revenue: number;
  cogs: number;
  grossProfit: number;
} {
  const revenue = salesRevenueInRange(transactions, range);
  const cogs = cogsInRange(transactions, products, range);
  return {
    revenue: Math.round(revenue * 100) / 100,
    cogs,
    grossProfit: Math.round((revenue - cogs) * 100) / 100,
  };
}

export type TopSellerRow = {
  key: string;
  productId: string | null;
  name: string;
  sku: string;
  quantitySold: number;
  revenue: number;
};

export function topSellingProducts(
  transactions: Transaction[],
  range: DateRangeMs,
  limit: number,
): TopSellerRow[] {
  const sales = completedSalesInRange(transactions, range);
  const agg = new Map<string, { productId: string | null; name: string; sku: string; quantitySold: number; revenue: number }>();

  for (const tx of sales) {
    if (!tx.receipt?.lines) continue;
    for (const line of tx.receipt.lines) {
      const key = line.productId?.trim() ? `id:${line.productId}` : `sku:${line.sku}`;
      const cur = agg.get(key) ?? {
        productId: line.productId?.trim() || null,
        name: line.name,
        sku: line.sku,
        quantitySold: 0,
        revenue: 0,
      };
      cur.quantitySold += line.quantity;
      cur.revenue += line.lineTotal;
      agg.set(key, cur);
    }
  }

  return [...agg.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((v, i) => ({
      key: v.productId ?? `sku:${v.sku}:${i}`,
      productId: v.productId,
      name: v.name,
      sku: v.sku,
      quantitySold: v.quantitySold,
      revenue: Math.round(v.revenue * 100) / 100,
    }));
}

export type SlowMoverRow = {
  product: Product;
  quantitySold: number;
  revenue: number;
};

export function slowMovingProducts(
  transactions: Transaction[],
  products: Product[],
  range: DateRangeMs,
  limit: number,
): SlowMoverRow[] {
  const qtyByProductId = new Map<string, { qty: number; revenue: number }>();
  for (const tx of completedSalesInRange(transactions, range)) {
    if (!tx.receipt?.lines) continue;
    for (const line of tx.receipt.lines) {
      const id = line.productId?.trim();
      const key = id ? `id:${id}` : `sku:${line.sku}`;
      const cur = qtyByProductId.get(key) ?? { qty: 0, revenue: 0 };
      cur.qty += line.quantity;
      cur.revenue += line.lineTotal;
      qtyByProductId.set(key, cur);
    }
  }

  const rows: SlowMoverRow[] = products
    .filter((p) => p.stock > 0)
    .map((p) => {
      const idKey = `id:${p.id}`;
      const skuKey = `sku:${p.sku}`;
      const hit = qtyByProductId.get(idKey) ?? qtyByProductId.get(skuKey) ?? { qty: 0, revenue: 0 };
      return { product: p, quantitySold: hit.qty, revenue: Math.round(hit.revenue * 100) / 100 };
    })
    .sort((a, b) => a.quantitySold - b.quantitySold || a.product.name.localeCompare(b.product.name))
    .slice(0, limit);

  return rows;
}

export function inventoryValuationAtCost(products: Product[]): number {
  return Math.round(products.reduce((s, p) => s + p.cost * p.stock, 0) * 100) / 100;
}

export function inventoryValuationAtRetail(products: Product[]): number {
  return Math.round(products.reduce((s, p) => s + p.price * p.stock, 0) * 100) / 100;
}

export function inventoryTurnoverRatio(
  transactions: Transaction[],
  products: Product[],
  range: DateRangeMs,
): { unitsSold: number; stockOnHand: number; ratio: number } {
  let unitsSold = 0;
  for (const tx of completedSalesInRange(transactions, range)) {
    for (const line of tx.receipt?.lines ?? []) {
      unitsSold += line.quantity;
    }
  }
  const stockOnHand = products.reduce((s, p) => s + Math.max(0, p.stock), 0);
  const ratio = stockOnHand > 0 ? unitsSold / stockOnHand : unitsSold > 0 ? unitsSold : 0;
  return {
    unitsSold,
    stockOnHand,
    ratio: Math.round(ratio * 100) / 100,
  };
}

/** Expense rows whose `date` falls inside the inclusive local range (date is YYYY-MM-DD or parseable). */
export function expensesTotalInRange(expenses: Expense[], range: DateRangeMs): number {
  let sum = 0;
  for (const e of expenses) {
    const t = new Date(`${e.date}T12:00:00`).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= range.start && t <= range.end) sum += e.amount;
  }
  return Math.round(sum * 100) / 100;
}

/** Recompute session totals from stored transactions (completed sales in [openedAt, closedAt]). */
export function computeSessionPaymentTotals(
  transactions: Transaction[],
  openedAt: number,
  closedAt: number,
): {
  totalCashSales: number;
  totalCardSales: number;
  totalTransferSales: number;
  totalOtherSales: number;
} {
  const range: DateRangeMs = { start: openedAt, end: closedAt };
  const slice = completedSalesInRange(transactions, range);
  const b = paymentMethodBreakdown(slice, range);
  return {
    totalCashSales: b.cash,
    totalCardSales: b.card,
    totalTransferSales: b.transfer,
    totalOtherSales: b.other,
  };
}

export { PAYMENT_METHODS };
