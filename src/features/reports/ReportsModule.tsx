import { useCallback, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, Button, Input } from '../../components/ui';
import type { CashSession, Expense, Product, Transaction } from '../../types';
import { cn } from '../../lib/utils';
import { useI18n } from '../../i18n/I18nContext';
import {
  dateRangeFromInputs,
  expensesTotalInRange,
  groupSalesByBucket,
  inventoryValuationAtCost,
  inventoryValuationAtRetail,
  paymentMethodBreakdown,
  previousPeriodOfSameLength,
  profitGrossInRange,
  salesRevenueInRange,
  slowMovingProducts,
  topSellingProducts,
  type SalesBucket,
} from '../../lib/reporting';

export type ReportsModuleProps = {
  transactions: Transaction[];
  products: Product[];
  expenses: Expense[];
  cashSessions: CashSession[];
  onOpenCashSession: (openingCash: number) => Promise<void>;
  onCloseCashSession: (id: string, closingCash: number) => Promise<void>;
};

type TabId = 'sales' | 'products' | 'inventory' | 'cash';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultEnd(): Date {
  return new Date();
}

function defaultStart(): Date {
  const d = defaultEnd();
  d.setDate(d.getDate() - 29);
  return d;
}

export function ReportsModule({
  transactions,
  products,
  expenses,
  cashSessions,
  onOpenCashSession,
  onCloseCashSession,
}: ReportsModuleProps) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<TabId>('sales');
  const [startStr, setStartStr] = useState(() => toInputDate(defaultStart()));
  const [endStr, setEndStr] = useState(() => toInputDate(defaultEnd()));
  const [bucket, setBucket] = useState<SalesBucket>('day');
  const [openingInput, setOpeningInput] = useState('0');
  const [closingById, setClosingById] = useState<Record<string, string>>({});
  const [cashMsg, setCashMsg] = useState<string | null>(null);

  const range = useMemo(() => dateRangeFromInputs(startStr, endStr), [startStr, endStr]);
  const prevRange = useMemo(() => previousPeriodOfSameLength(range), [range]);

  const revenue = useMemo(() => salesRevenueInRange(transactions, range), [transactions, range]);
  const prevRevenue = useMemo(() => salesRevenueInRange(transactions, prevRange), [transactions, prevRange]);
  const changePct = useMemo(() => {
    if (prevRevenue <= 0) return revenue > 0 ? 100 : 0;
    return ((revenue - prevRevenue) / prevRevenue) * 100;
  }, [revenue, prevRevenue]);

  const orders = useMemo(
    () =>
      transactions.filter(
        (tx) =>
          tx.type === 'sale' &&
          tx.status === 'completed' &&
          tx.createdAt >= range.start &&
          tx.createdAt <= range.end,
      ).length,
    [transactions, range],
  );

  const expensesR = useMemo(() => expensesTotalInRange(expenses, range), [expenses, range]);
  const payBreak = useMemo(() => paymentMethodBreakdown(transactions, range), [transactions, range]);

  const paymentLabel = useCallback(
    (k: 'cash' | 'card' | 'transfer' | 'other') => {
      if (k === 'cash') return t('reports.paymentCash');
      if (k === 'card') return t('reports.paymentCard');
      if (k === 'transfer') return t('reports.paymentTransfer');
      return t('reports.paymentOther');
    },
    [t],
  );

  const payChart = useMemo(
    () =>
      (['cash', 'card', 'transfer', 'other'] as const).map((k) => ({
        method: paymentLabel(k),
        amount: payBreak[k],
      })),
    [payBreak, paymentLabel],
  );

  const series = useMemo(
    () => groupSalesByBucket(transactions, range, bucket, locale === 'es' ? 'es' : 'en-US'),
    [transactions, range, bucket, locale],
  );

  const profit = useMemo(() => profitGrossInRange(transactions, products, range), [transactions, products, range]);
  const netOp = useMemo(() => profit.grossProfit - expensesR, [profit.grossProfit, expensesR]);

  const top = useMemo(() => topSellingProducts(transactions, range, 15), [transactions, range]);
  const slow = useMemo(() => slowMovingProducts(transactions, products, range, 15), [transactions, products, range]);

  const valCost = useMemo(() => inventoryValuationAtCost(products), [products]);
  const valRetail = useMemo(() => inventoryValuationAtRetail(products), [products]);
  const lowStock = useMemo(() => products.filter((p) => p.stock <= 5).length, [products]);

  const openSession = cashSessions.find((s) => s.closedAt == null) ?? null;

  const applyPreset = useCallback((days: number | 'month') => {
    const end = new Date();
    let start: Date;
    if (days === 'month') {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else {
      start = new Date(end);
      start.setDate(end.getDate() - (days - 1));
    }
    setStartStr(toInputDate(start));
    setEndStr(toInputDate(end));
  }, []);

  const handleOpenCash = async () => {
    setCashMsg(null);
    const v = parseFloat(openingInput.replace(',', '.')) || 0;
    try {
      await onOpenCashSession(v);
      setOpeningInput('0');
    } catch (e) {
      setCashMsg(e instanceof Error && e.message === 'ERR_CASH_SESSION_OPEN' ? t('reports.cashErrOpen') : String(e));
    }
  };

  const handleCloseCash = async (id: string) => {
    setCashMsg(null);
    const raw = closingById[id] ?? '0';
    const v = parseFloat(raw.replace(',', '.')) || 0;
    try {
      await onCloseCashSession(id, v);
      setClosingById((m) => ({ ...m, [id]: '' }));
    } catch (e) {
      setCashMsg(String(e));
    }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'sales', label: t('reports.tabSales') },
    { id: 'products', label: t('reports.tabProducts') },
    { id: 'inventory', label: t('reports.tabInventory') },
    { id: 'cash', label: t('reports.tabCash') },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary font-headline tracking-tight">{t('reports.title')}</h2>
          <p className="text-sm text-on-surface-variant mt-1">{t('reports.subtitle')}</p>
        </div>
        <Button variant="secondary" className="self-start" onClick={() => window.print()}>
          {t('reports.printPdf')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 p-1 bg-surface-container-low rounded-xl border border-black/5">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-bold transition-all',
              tab === x.id ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:flex-wrap gap-4 lg:items-end">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-0">
            <div>
              <label className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.dateFrom')}</label>
              <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.dateTo')}</label>
              <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="mt-1" />
            </div>
            {tab === 'sales' ? (
              <div>
                <label className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.groupBy')}</label>
                <select
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value as SalesBucket)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-surface-container-high px-3 py-2 text-sm"
                >
                  <option value="day">{t('reports.groupDay')}</option>
                  <option value="week">{t('reports.groupWeek')}</option>
                  <option value="month">{t('reports.groupMonth')}</option>
                </select>
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset(7)}>
              {t('reports.preset7d')}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset(30)}>
              {t('reports.preset30d')}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset('month')}>
              {t('reports.presetMonth')}
            </Button>
          </div>
        </div>
      </Card>

      {tab === 'sales' && (
        <div className="space-y-6 print:space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.revenue')}</p>
              <p className="text-2xl font-black text-primary mt-1">${revenue.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.prevPeriod')}</p>
              <p className="text-2xl font-bold text-on-surface-variant mt-1">${prevRevenue.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.changePct')}</p>
              <p className={cn('text-2xl font-bold mt-1', changePct >= 0 ? 'text-on-tertiary-container' : 'text-error')}>
                {changePct >= 0 ? '+' : ''}
                {changePct.toFixed(1)}%
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.orders')}</p>
              <p className="text-2xl font-black text-primary mt-1">{orders}</p>
            </Card>
          </div>
          <Card title={t('reports.expensesInRange')} className="p-4 sm:p-6">
            <p className="text-2xl font-bold text-primary">${expensesR.toLocaleString()}</p>
          </Card>
          <Card title={t('reports.salesTrend')} className="p-4 sm:p-6">
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis hide />
                  <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                  <Bar dataKey="revenue" fill="#222a3e" radius={[4, 4, 0, 0]} name={t('reports.revenue')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title={t('reports.paymentSplit')} className="p-4 sm:p-6">
            <div className="h-52 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="method" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                  <Bar dataKey="amount" fill="#384055" radius={[0, 4, 4, 0]} name={t('reports.amount')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {(['cash', 'card', 'transfer', 'other'] as const).map((k) => (
                <div key={k} className="flex justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2">
                  <span className="text-on-surface-variant">{paymentLabel(k)}</span>
                  <span className="font-bold">${payBreak[k].toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'products' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.revenue')}</p>
              <p className="text-2xl font-black text-primary mt-1">${profit.revenue.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.cogs')}</p>
              <p className="text-2xl font-bold mt-1">${profit.cogs.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.grossProfit')}</p>
              <p className={cn('text-2xl font-black mt-1', profit.grossProfit >= 0 ? 'text-on-tertiary-container' : 'text-error')}>
                ${profit.grossProfit.toLocaleString()}
              </p>
            </Card>
          </div>
          <Card title={t('reports.expensesInRange')} className="p-4">
            <p className="text-lg font-bold">${expensesR.toLocaleString()}</p>
            <p className="text-xs text-on-surface-variant mt-2">{t('reports.netOperatingNote')}</p>
            <p className="text-xl font-black text-primary mt-2">
              {t('reports.netOperating')}: ${netOp.toLocaleString()}
            </p>
          </Card>
          <Card title={t('reports.topProducts')} className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-left text-[10px] uppercase text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3">{t('reports.colProduct')}</th>
                    <th className="px-4 py-3">{t('reports.colSku')}</th>
                    <th className="px-4 py-3 text-right">{t('reports.colQty')}</th>
                    <th className="px-4 py-3 text-right">{t('reports.colRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {top.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-on-surface-variant">
                        —
                      </td>
                    </tr>
                  ) : (
                    top.map((r) => (
                      <tr key={r.key} className="border-t border-black/5">
                        <td className="px-4 py-2 font-medium">{r.name}</td>
                        <td className="px-4 py-2 text-on-surface-variant">{r.sku}</td>
                        <td className="px-4 py-2 text-right">{r.quantitySold}</td>
                        <td className="px-4 py-2 text-right font-bold">${r.revenue.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={t('reports.slowProducts')} className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-left text-[10px] uppercase text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3">{t('reports.colProduct')}</th>
                    <th className="px-4 py-3 text-right">{t('reports.colQty')}</th>
                    <th className="px-4 py-3 text-right">{t('reports.colStock')}</th>
                    <th className="px-4 py-3 text-right">{t('reports.colRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {slow.map((r) => (
                    <tr key={r.product.id} className="border-t border-black/5">
                      <td className="px-4 py-2 font-medium">{r.product.name}</td>
                      <td className="px-4 py-2 text-right">{r.quantitySold}</td>
                      <td className="px-4 py-2 text-right">{r.product.stock}</td>
                      <td className="px-4 py-2 text-right">${r.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.valuationCost')}</p>
              <p className="text-2xl font-black text-primary mt-1">${valCost.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.valuationRetail')}</p>
              <p className="text-2xl font-bold mt-1">${valRetail.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase text-on-surface-variant">{t('reports.lowStock')}</p>
              <p className="text-2xl font-black text-error mt-1">{lowStock}</p>
            </Card>
          </div>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-container-low text-left text-[10px] uppercase text-on-surface-variant z-10">
                  <tr>
                    <th className="px-4 py-3">{t('reports.colProduct')}</th>
                    <th className="px-4 py-3">{t('reports.colSku')}</th>
                    <th className="px-4 py-3 text-right">{t('reports.colStock')}</th>
                    <th className="px-4 py-3 text-right">{t('reports.colCost')}</th>
                    <th className="px-4 py-3 text-right">{t('reports.colLineValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-t border-black/5">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2 text-on-surface-variant">{p.sku}</td>
                      <td className="px-4 py-2 text-right">{p.stock}</td>
                      <td className="px-4 py-2 text-right">${p.cost.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold">${(p.cost * p.stock).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'cash' && (
        <div className="space-y-6">
          <Card title={t('reports.paymentSplit')} className="p-4 sm:p-6">
            <p className="text-xs text-on-surface-variant mb-4">{t('reports.cashTotalsNote')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['cash', 'card', 'transfer', 'other'] as const).map((k) => (
                <div key={k} className="rounded-xl bg-surface-container-low p-3">
                  <p className="text-[10px] font-bold uppercase text-on-surface-variant">{paymentLabel(k)}</p>
                  <p className="text-lg font-black text-primary mt-1">${payBreak[k].toFixed(2)}</p>
                </div>
              ))}
            </div>
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
                    <th className="px-4 py-3">{t('dashboard.status')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {cashSessions.map((s) => (
                    <tr key={s.id} className="border-t border-black/5">
                      <td className="px-4 py-2 whitespace-nowrap">
                        {new Date(s.openedAt).toLocaleString(locale === 'es' ? 'es' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {s.closedAt
                          ? new Date(s.closedAt).toLocaleString(locale === 'es' ? 'es' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">${s.openingCash.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{s.closingCash != null ? `$${s.closingCash.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2">{s.closedAt == null ? t('reports.statusOpen') : t('reports.statusClosed')}</td>
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
                        ) : (
                          <span className="text-xs text-on-surface-variant">
                            ${s.totalCashSales.toFixed(2)} / ${s.totalCardSales.toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
