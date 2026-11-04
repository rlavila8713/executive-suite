import { useMemo, useState } from 'react';
import {
  TrendingUp,
  Receipt,
  DollarSign,
  CheckCircle,
  ShoppingBag,
  ArrowRight,
  Plus,
  Package,
  Undo2,
  ListOrdered,
  FileText,
  HandCoins,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, Button, Input, Modal } from '../components/ui';
import { TableActionGroup, TableIconAction } from '../components/TableIconAction';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { mapMutationError } from '../lib/mutationErrors';
import { reverseMixedSaleHint } from '../lib/mixedSale';
import { ReceiptViewModal } from '../components/ReceiptViewModal';
import { ProductThumb } from '../components/ProductThumb';
import { CashStatusCard } from '../components/CashStatusCard';
import { CashSession, Transaction, Product, Expense, Screen, type PaymentMethod } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';
import { transactionOperatorName, uniqueOperatorNames } from '../lib/operators';
import {
  pendingDebtTotal,
  isPendingDebtSale,
  localDayRange,
  netSalesRevenueInRange,
  expensesTotalInRange,
  isReturnRow,
  operatorCompletedSalesTotals,
  operatorReversalTotals,
} from '../lib/reporting';
import {
  dateRangeForPreset,
  toInputDate,
  type StockMovementDatePreset,
} from '../lib/stockMovements';
import { usePagination } from '../lib/usePagination';
import { salePaymentBadgeClass, salePaymentBadgeKind, salePaymentBadgeLabel } from '../lib/salePaymentDisplay';
import { formatAppDate, formatAppDateTime } from '../lib/dateFormat';
import { TablePagination } from '../components/TablePagination';

type RecentSalesTab = 'completed' | 'reversed';

function isSaleCompletedRow(tx: Transaction): boolean {
  return tx.type === 'sale' && tx.status === 'completed';
}

function isSaleReversalRow(tx: Transaction): boolean {
  return isReturnRow(tx) || (tx.type === 'sale' && (tx.status === 'reversed' || tx.status === 'refunded'));
}

function canReverseSale(tx: Transaction, reversedSourceIds: Set<string>): boolean {
  return tx.type === 'sale' && tx.status === 'completed' && !reversedSourceIds.has(tx.id);
}

function statusBadgeKey(status: Transaction['status']): 'completed' | 'pending' | 'refunded' | 'reversed' {
  if (status === 'completed' || status === 'pending' || status === 'reversed' || status === 'refunded') return status;
  return 'completed';
}

function lastSevenDayBars(transactions: Transaction[]): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const range = localDayRange(d.getTime());
    const sum = netSalesRevenueInRange(transactions, range);
    const name = `${d.getMonth() + 1}/${d.getDate()}`;
    out.push({ name, value: sum });
  }
  return out;
}

interface DashboardProps {
  transactions: Transaction[];
  products: Product[];
  expenses: Expense[];
  cashSessions: CashSession[];
  headerSearch?: string;
  onNavigate: (screen: Screen) => void;
  onAddTransaction: (row: Omit<Transaction, 'id'>) => void | Promise<void>;
  onReverseSale: (id: string) => void | Promise<void>;
}

export function Dashboard({
  transactions,
  products,
  expenses,
  cashSessions,
  headerSearch = '',
  onNavigate,
  onAddTransaction,
  onReverseSale,
}: DashboardProps) {
  const { t, locale } = useI18n();
  const lowStockProducts = useMemo(() => {
    const low = products.filter((p) => p.stock <= 5);
    if (!headerSearch.trim()) return low;
    return low.filter((p) =>
      rowMatchesSearch(headerSearch, [p.name, p.sku, p.category]),
    );
  }, [products, headerSearch]);
  const chartData = useMemo(() => lastSevenDayBars(transactions), [transactions]);
  const reversedSourceIds = useMemo(
    () => new Set(transactions.flatMap((tx) => (tx.sourceSaleId ? [tx.sourceSaleId] : []))),
    [transactions],
  );
  const maxBar = useMemo(() => Math.max(...chartData.map((d) => d.value), 1), [chartData]);

  const todayRevenue = useMemo(
    () => netSalesRevenueInRange(transactions, localDayRange()),
    [transactions],
  );
  const todayExpenses = useMemo(
    () => expensesTotalInRange(expenses, localDayRange()),
    [expenses],
  );
  const expenseMonthly = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const budgetPct =
    expenseMonthly > 0
      ? Math.min(100, Math.round((todayExpenses / Math.max(expenseMonthly, 1)) * 100))
      : 0;

  const profitApprox = todayRevenue - todayExpenses;

  const debtTotal = useMemo(() => pendingDebtTotal(transactions), [transactions]);
  const debtCount = useMemo(() => transactions.filter((tx) => isPendingDebtSale(tx)).length, [transactions]);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [reversingTx, setReversingTx] = useState<Transaction | null>(null);
  const [receiptViewTx, setReceiptViewTx] = useState<Transaction | null>(null);
  const [operatorFilter, setOperatorFilter] = useState('');
  const [recentTab, setRecentTab] = useState<RecentSalesTab>('completed');
  const [logTab, setLogTab] = useState<RecentSalesTab>('completed');
  const [logDatePreset, setLogDatePreset] = useState<StockMovementDatePreset | 'all'>('all');
  const [logCustomStart, setLogCustomStart] = useState(() => toInputDate(new Date()));
  const [logCustomEnd, setLogCustomEnd] = useState(() => toInputDate(new Date()));
  const [logCashSessionId, setLogCashSessionId] = useState('');

  const openFullLog = () => {
    const open = cashSessions.find((s) => s.closedAt == null);
    setLogCashSessionId(open?.id ?? '');
    if (open) {
      setLogDatePreset('custom');
      setLogCustomStart(toInputDate(new Date(open.openedAt)));
      setLogCustomEnd(toInputDate(new Date()));
    } else {
      setLogDatePreset('today');
    }
    setLogOpen(true);
  };

  const handleTxSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = fd.get('type') as Transaction['type'];
    const status = fd.get('status') as Transaction['status'];
    const raw = parseFloat(fd.get('amount') as string);
    const amount = type === 'return' ? -Math.abs(raw) : Math.abs(raw);
    const rawPm = fd.get('paymentMethod') as string;
    const paymentMethod: PaymentMethod =
      rawPm === 'cash' || rawPm === 'card' || rawPm === 'transfer' || rawPm === 'other' ? rawPm : 'other';
    const row: Omit<Transaction, 'id'> = {
      orderNumber: fd.get('orderNumber') as string,
      customer: fd.get('customer') as string,
      amount,
      status,
      timestamp: fd.get('timestamp') as string,
      type,
      createdAt: Date.now(),
      paymentMethod,
    };
    await onAddTransaction(row);
    setTxModalOpen(false);
  };

  const operatorNames = useMemo(() => uniqueOperatorNames(transactions), [transactions]);

  const transactionsFiltered = useMemo(() => {
    let list = transactions;
    if (operatorFilter) {
      list = list.filter((tx) => transactionOperatorName(tx) === operatorFilter);
    }
    if (!headerSearch.trim()) return list;
    return list.filter((tx) =>
      rowMatchesSearch(headerSearch, [
        tx.orderNumber,
        tx.customer,
        tx.status,
        tx.type,
        tx.timestamp,
        String(tx.amount),
        transactionOperatorName(tx),
        ...(tx.receipt?.lines.map((l) => l.name) ?? []),
        ...(tx.receipt?.lines.map((l) => l.sku) ?? []),
      ]),
    );
  }, [transactions, headerSearch, operatorFilter]);

  const recentListForTab = useMemo(() => {
    const base = transactionsFiltered.filter((tx) => tx.type !== 'payable');
    return base.filter(recentTab === 'completed' ? isSaleCompletedRow : isSaleReversalRow);
  }, [transactionsFiltered, recentTab]);

  const logRange = useMemo(() => {
    if (logDatePreset === 'all') return null;
    return dateRangeForPreset(logDatePreset, logCustomStart, logCustomEnd);
  }, [logDatePreset, logCustomStart, logCustomEnd]);

  const logBaseTransactions = useMemo(() => {
    let list = transactions.filter((tx) => tx.type !== 'payable');
    if (logCashSessionId) {
      const session = cashSessions.find((s) => s.id === logCashSessionId);
      if (session) {
        const end = session.closedAt ?? Date.now();
        list = list.filter((tx) => tx.createdAt >= session.openedAt && tx.createdAt <= end);
      }
    }
    if (logRange) {
      list = list.filter((tx) => tx.createdAt >= logRange.start && tx.createdAt <= logRange.end);
    }
    if (operatorFilter) {
      list = list.filter((tx) => transactionOperatorName(tx) === operatorFilter);
    }
    if (headerSearch.trim()) {
      list = list.filter((tx) =>
        rowMatchesSearch(headerSearch, [
          tx.orderNumber,
          tx.customer,
          tx.status,
          tx.type,
          tx.timestamp,
          String(tx.amount),
          transactionOperatorName(tx),
          ...(tx.receipt?.lines.map((l) => l.name) ?? []),
          ...(tx.receipt?.lines.map((l) => l.sku) ?? []),
        ]),
      );
    }
    return list;
  }, [transactions, logCashSessionId, cashSessions, logRange, operatorFilter, headerSearch]);

  const logListForTab = useMemo(() => {
    return logBaseTransactions.filter(logTab === 'completed' ? isSaleCompletedRow : isSaleReversalRow);
  }, [logBaseTransactions, logTab]);

  const logOperatorTotals = useMemo(() => {
    if (logTab === 'completed') return operatorCompletedSalesTotals(logBaseTransactions);
    return operatorReversalTotals(logBaseTransactions);
  }, [logBaseTransactions, logTab]);

  const logGrandTotal = useMemo(
    () => Math.round(logListForTab.reduce((s, tx) => s + Math.abs(tx.amount), 0) * 100) / 100,
    [logListForTab],
  );

  const sortedCashSessions = useMemo(
    () => [...cashSessions].sort((a, b) => b.openedAt - a.openedAt),
    [cashSessions],
  );

  const { pageItems: recentPageItems, page: recentPage, setPage: setRecentPage, totalPages: recentTotalPages, total: recentTotal, pageSize: recentPageSize } =
    usePagination(recentListForTab);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 sm:mb-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary font-headline tracking-tight mb-2">
            {t('dashboard.performanceTitle')}
          </h1>
          <p className="text-on-surface-variant font-medium">
            {t('dashboard.performanceSubtitle')}{' '}
            <span className="text-primary font-bold">
              {formatAppDate(Date.now(), locale, 'long')}
            </span>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            className="flex items-center gap-2"
            onClick={() => setTxModalOpen(true)}
          >
            <Plus size={16} /> {t('dashboard.registerTx')}
          </Button>
          <Button variant="secondary" className="flex items-center gap-2" onClick={openFullLog}>
            <ListOrdered size={16} /> {t('dashboard.fullLog')}
          </Button>
        </div>
      </div>

      {debtCount > 0 ? (
        <button
          type="button"
          onClick={() => onNavigate('receivables')}
          className="w-full text-left rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-6 text-white shadow-lg hover:shadow-xl transition-shadow animate-in fade-in zoom-in-95 duration-300"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/15 rounded-lg">
                <HandCoins size={24} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-90">{t('dashboard.debtAlertTitle')}</p>
                <p className="text-sm opacity-90 mt-0.5">
                  {t('dashboard.debtAlertSubtitle', {
                    count: debtCount,
                    amount: `$${debtTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold">
              {t('dashboard.debtAlertAction')}
              <ArrowRight size={18} />
            </div>
          </div>
        </button>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
        <div className="md:col-span-3 relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-container p-8 text-white shadow-lg">
          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-70 mb-2">{t('dashboard.todayRevenue')}</p>
            <h3 className="text-5xl font-black font-headline tracking-tighter mb-4">
              ${todayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="flex items-center gap-2 text-on-tertiary-container">
              <TrendingUp size={16} />
              <span className="text-sm font-bold">{t('dashboard.completedSalesToday')}</span>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-12 -mt-12 blur-3xl" />
        </div>

        <CashStatusCard
          className="md:col-span-3"
          cashSessions={cashSessions}
          transactions={transactions}
          onNavigate={onNavigate}
        />

        <Card className="md:col-span-3 bg-surface-container-low flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <Receipt className="text-primary" size={20} />
              </div>
              <span className="text-[10px] font-bold px-2 py-1 bg-surface-container-high rounded text-on-surface-variant">
                {t('dashboard.allRecords')}
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">{t('dashboard.todayExpenses')}</p>
            <h4 className="text-2xl font-bold text-primary">
              ${todayExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
          </div>
          <div className="mt-4">
            <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${budgetPct}%` }} />
            </div>
            <p className="text-[10px] text-on-surface-variant mt-2 font-medium">{t('dashboard.relativeLoad')}</p>
          </div>
        </Card>

        <div className="md:col-span-3 rounded-xl bg-tertiary-container p-6 text-white flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-primary rounded-lg shadow-sm">
                <DollarSign className="text-on-tertiary-container" size={20} />
              </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">{t('dashboard.todayMinusExpenses')}</p>
            <h4 className="text-2xl font-bold">
              ${profitApprox.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
          </div>
          <div className="flex items-center gap-1 text-on-tertiary-container text-[10px] font-bold mt-4">
            <CheckCircle size={12} />
            {t('dashboard.indicative')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-8" title={t('dashboard.last7Days')} subtitle={t('dashboard.last7DaysSubtitle')}>
          <div className="h-64 mt-8">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#44474c' }}
                  dy={10}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: '#f2f4f6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.value === maxBar && maxBar > 0 ? '#222a3e' : '#bec6e0'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="bg-surface-container-high" title={t('dashboard.stockAlerts')}>
            <div className="space-y-4 mt-4">
              {lowStockProducts.slice(0, 3).map((product) => (
                <div key={product.id} className="flex items-center gap-4 bg-white/50 dark:bg-slate-800/50 p-3 rounded-lg">
                  <ProductThumb src={product.image} imageUrl={product.imageUrl} alt={product.name} className="w-10 h-10 rounded object-cover" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-primary">{product.name}</p>
                    <p className="text-[10px] text-error font-bold">{t('dashboard.itemsLeft', { count: product.stock })}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onNavigate('inventory')}>
                    <Plus size={14} />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="primary"
              className="w-full mt-6 uppercase tracking-widest text-[10px]"
              onClick={() => onNavigate('inventory')}
            >
              {t('dashboard.viewAllInventory')}
            </Button>
          </Card>

          <Card className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{t('dashboard.totalSkus')}</p>
              <h4 className="text-3xl font-black text-primary font-headline">{products.length}</h4>
            </div>
            <div className="w-12 h-12 bg-surface-container-high rounded-full flex items-center justify-center text-primary">
              <Package size={24} />
            </div>
          </Card>
        </div>
      </div>

      <Card title={t('dashboard.recentTx')}>
        <div className="flex flex-wrap gap-2 p-1 bg-surface-container-low rounded-xl border border-black/5 -mt-2 mb-4">
          {(['completed', 'reversed'] as RecentSalesTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setRecentTab(tab);
                setRecentPage(1);
              }}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-bold transition-all',
                recentTab === tab
                  ? 'bg-primary text-white shadow-md'
                  : 'text-on-surface-variant hover:bg-surface-container-high',
              )}
            >
              {tab === 'completed' ? t('dashboard.recentTabCompleted') : t('dashboard.recentTabReversed')}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {recentPageItems.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">
              {recentTab === 'completed' ? t('dashboard.recentEmptyCompleted') : t('dashboard.recentEmptyReversed')}
            </p>
          ) : null}
          {recentPageItems.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-4 p-4 bg-surface-container-low rounded-xl hover:bg-surface-container-high transition-all group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm shrink-0">
                  <ShoppingBag size={18} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary truncate">
                    {t('dashboard.order')} {tx.orderNumber}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-medium truncate">
                    {tx.customer}
                    {transactionOperatorName(tx) ? ` • ${transactionOperatorName(tx)}` : ''} • {tx.timestamp}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p
                    className={cn(
                      'text-sm font-bold',
                      tx.type === 'return' ? 'text-error' : 'text-primary',
                    )}
                  >
                    {isSaleReversalRow(tx) || tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
                  </p>
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded',
                      tx.status === 'completed'
                        ? 'bg-tertiary-container text-on-tertiary-container'
                        : tx.status === 'reversed' || tx.status === 'refunded'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container-high text-on-surface-variant',
                    )}
                  >
                    {t(`dashboard.statusBadge.${statusBadgeKey(tx.status)}`)}
                  </span>
                </div>
                <TableActionGroup>
                  {tx.receipt ? (
                    <TableIconAction
                      icon={FileText}
                      label={t('dashboard.viewReceipt')}
                      tone="neutral"
                      onClick={() => setReceiptViewTx(tx)}
                    />
                  ) : null}
                  {canReverseSale(tx, reversedSourceIds) ? (
                    <TableIconAction
                      icon={Undo2}
                      label={t('dashboard.reverseTxTitle')}
                      tone="danger"
                      onClick={() => setReversingTx(tx)}
                    />
                  ) : null}
                </TableActionGroup>
              </div>
            </div>
          ))}
        </div>
        <TablePagination
          page={recentPage}
          totalPages={recentTotalPages}
          total={recentTotal}
          pageSize={recentPageSize}
          onPageChange={setRecentPage}
        />
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={openFullLog}
            className="text-xs font-bold text-primary underline underline-offset-4 flex items-center gap-2 mx-auto"
          >
            {t('dashboard.viewTxLog')} <ArrowRight size={14} />
          </button>
        </div>
      </Card>

      <Modal isOpen={txModalOpen} onClose={() => setTxModalOpen(false)} title={t('dashboard.registerTxTitle')}>
        <form onSubmit={handleTxSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.orderNumber')}</label>
              <Input name="orderNumber" defaultValue={`#${Math.floor(Math.random() * 90000) + 10000}`} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.customer')}</label>
              <Input name="customer" required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.amountAbsolute')}</label>
              <Input name="amount" type="number" step="0.01" min="0" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.displayTime')}</label>
              <Input name="timestamp" defaultValue="Just now" required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.type')}</label>
              <select
                name="type"
                defaultValue="sale"
                className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="sale">{t('dashboard.typeSale')}</option>
                <option value="return">{t('dashboard.typeReturn')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.status')}</label>
              <select
                name="status"
                defaultValue="completed"
                className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="completed">{t('dashboard.statusCompleted')}</option>
                <option value="pending">{t('dashboard.statusPending')}</option>
                <option value="refunded">{t('dashboard.statusRefunded')}</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('dashboard.paymentMethod')}
            </label>
            <select
              name="paymentMethod"
              defaultValue="cash"
              className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="cash">{t('dashboard.pmCash')}</option>
              <option value="card">{t('dashboard.pmOnline')}</option>
              <option value="transfer">{t('dashboard.pmTransfer')}</option>
              <option value="other">{t('dashboard.pmOther')}</option>
            </select>
          </div>
          <p className="text-[10px] text-on-surface-variant">{t('dashboard.returnsNote')}</p>
          <div className="pt-4 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setTxModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1">{t('dashboard.create')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={logOpen} onClose={() => setLogOpen(false)} title={t('dashboard.txLogTitle')} size="large">
        <div className="flex flex-wrap gap-2 p-1 bg-surface-container-low rounded-xl border border-black/5 mb-3">
          {(['completed', 'reversed'] as RecentSalesTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setLogTab(tab)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                logTab === tab
                  ? 'bg-primary text-white shadow-md'
                  : 'text-on-surface-variant hover:bg-surface-container-high',
              )}
            >
              {tab === 'completed' ? t('dashboard.recentTabCompleted') : t('dashboard.recentTabReversed')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {t('dashboard.logCashSession')}
            </label>
            <select
              value={logCashSessionId}
              onChange={(e) => setLogCashSessionId(e.target.value)}
              className="mt-1 bg-surface-container-high border-none rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="">{t('dashboard.logCashSessionAll')}</option>
              {sortedCashSessions.map((s) => {
                const open = s.closedAt == null;
                const label = `${formatAppDateTime(s.openedAt, locale, 'short')} — ${open ? t('dashboard.logSessionOpen') : t('dashboard.logSessionClosed')}`;
                return (
                  <option key={s.id} value={s.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {t('dashboard.operatorFilter')}
            </label>
            <select
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              className="mt-1 bg-surface-container-high border-none rounded-lg px-3 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="">{t('dashboard.operatorAll')}</option>
              {operatorNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            {t('dashboard.logDateFilter')}
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all' as const, label: t('dashboard.logDateAll') },
                { id: 'today' as const, label: t('stockMovements.presetToday') },
                { id: 'week' as const, label: t('stockMovements.presetWeek') },
                { id: 'month' as const, label: t('stockMovements.presetMonth') },
                { id: 'custom' as const, label: t('stockMovements.presetCustom') },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLogDatePreset(p.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-bold transition-all',
                  logDatePreset === p.id
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'bg-surface-container-high text-on-surface-variant',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {logDatePreset === 'custom' ? (
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[8rem]">
                <Input type="date" value={logCustomStart} onChange={(e) => setLogCustomStart(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[8rem]">
                <Input type="date" value={logCustomEnd} onChange={(e) => setLogCustomEnd(e.target.value)} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mb-5 rounded-xl border border-primary/15 bg-primary/5 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              {t('dashboard.logOperatorTotalsTitle')}
            </p>
            <p className="text-sm font-black text-primary">
              {t('dashboard.logGrandTotal')}: ${logGrandTotal.toFixed(2)}
            </p>
          </div>
          {logOperatorTotals.length === 0 ? (
            <p className="text-xs text-on-surface-variant">{t('dashboard.logOperatorTotalsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-on-surface-variant border-b border-black/5">
                    <th className="py-1.5 pr-2">{t('dashboard.logColOperator')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('dashboard.logColSalesCount')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('dashboard.logColCash')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('dashboard.logColTransfer')}</th>
                    <th className="py-1.5 text-right">{t('dashboard.logColTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logOperatorTotals.map((row) => (
                    <tr key={row.operator} className="border-b border-black/5 last:border-0">
                      <td className="py-1.5 pr-2 font-bold text-primary">{row.operator}</td>
                      <td className="py-1.5 pr-2 text-right">{row.count}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">${row.cash.toFixed(2)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono">${row.transfer.toFixed(2)}</td>
                      <td className="py-1.5 text-right font-mono font-bold">${row.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="max-h-[58vh] min-h-[12rem] overflow-y-auto space-y-2.5 pr-1">
          {logListForTab.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-6">
              {logTab === 'completed' ? t('dashboard.recentEmptyCompleted') : t('dashboard.recentEmptyReversed')}
            </p>
          ) : null}
          {logListForTab.map((tx) => (
            <div
              key={tx.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-surface-container-low text-sm"
            >
              <div className="font-bold text-primary min-w-0 leading-snug">
                <span className="block sm:inline">{tx.orderNumber} — {tx.customer}</span>
                {transactionOperatorName(tx) ? (
                  <span className="block sm:inline text-on-surface-variant font-medium sm:ml-1">
                    · {transactionOperatorName(tx)}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'mt-1 sm:mt-0 sm:ml-2 inline-flex text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ring-1',
                    salePaymentBadgeClass(salePaymentBadgeKind(tx)),
                  )}
                >
                  {salePaymentBadgeLabel(tx, t)}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                <span className={cn('font-bold tabular-nums text-base', tx.amount < 0 ? 'text-error' : 'text-primary')}>
                  ${tx.amount.toFixed(2)}
                </span>
                <TableActionGroup>
                  {tx.receipt ? (
                    <TableIconAction
                      icon={FileText}
                      label={t('dashboard.viewReceipt')}
                      tone="neutral"
                      onClick={() => setReceiptViewTx(tx)}
                    />
                  ) : null}
                  {canReverseSale(tx, reversedSourceIds) ? (
                    <TableIconAction
                      icon={Undo2}
                      label={t('dashboard.reverseTxTitle')}
                      tone="danger"
                      onClick={() => setReversingTx(tx)}
                    />
                  ) : null}
                </TableActionGroup>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmDeleteModal
        target={reversingTx}
        title={t('dashboard.reverseTxTitle')}
        renderMessage={(tx) => {
          const base = tx.receipt?.lines?.length
            ? t('dashboard.reverseTxBody', { order: tx.orderNumber })
            : `${t('dashboard.reverseTxBody', { order: tx.orderNumber })} ${t('dashboard.reverseTxNoReceipt')}`;
          const mixedHint = reverseMixedSaleHint(tx, t);
          return mixedHint ? `${base}\n\n${mixedHint}` : base;
        }}
        onClose={() => setReversingTx(null)}
        onDelete={onReverseSale}
        mapError={(err) => mapMutationError(err, t)}
        confirmLabel={t('dashboard.reverseConfirm')}
        busyLabel={t('dashboard.reversing')}
        confirmVariant="danger"
      />

      <ReceiptViewModal
        isOpen={!!receiptViewTx}
        onClose={() => setReceiptViewTx(null)}
        transaction={receiptViewTx}
      />
    </div>
  );
}
