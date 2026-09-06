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
  Edit2,
  Undo2,
  ListOrdered,
  FileText,
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
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { mapMutationError } from '../lib/mutationErrors';
import { ReceiptViewModal } from '../components/ReceiptViewModal';
import { ProductThumb } from '../components/ProductThumb';
import { Transaction, Product, Expense, Screen, type PaymentMethod } from '../types';
import { cn, rowMatchesSearch } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';

function startOfLocalDay(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function canReverseSale(tx: Transaction): boolean {
  return tx.type === 'sale' && tx.status === 'completed';
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
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    const end = start + 86400000;
    const sum = transactions
      .filter(
        (tx) =>
          tx.createdAt >= start &&
          tx.createdAt < end &&
          tx.type === 'sale' &&
          tx.status === 'completed',
      )
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const name = `${d.getMonth() + 1}/${d.getDate()}`;
    out.push({ name, value: Math.round(sum * 100) / 100 });
  }
  return out;
}

interface DashboardProps {
  transactions: Transaction[];
  products: Product[];
  expenses: Expense[];
  headerSearch?: string;
  onNavigate: (screen: Screen) => void;
  onAddTransaction: (row: Omit<Transaction, 'id'>) => void | Promise<void>;
  onUpdateTransaction: (id: string, patch: Partial<Transaction>) => void | Promise<void>;
  onReverseSale: (id: string) => void | Promise<void>;
}

export function Dashboard({
  transactions,
  products,
  expenses,
  headerSearch = '',
  onNavigate,
  onAddTransaction,
  onUpdateTransaction,
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
  const maxBar = useMemo(() => Math.max(...chartData.map((d) => d.value), 1), [chartData]);

  const todayRevenue = useMemo(() => {
    const start = startOfLocalDay();
    return transactions
      .filter(
        (tx) => tx.type === 'sale' && tx.status === 'completed' && tx.createdAt >= start,
      )
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  }, [transactions]);

  const expenseMonthly = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const budgetPct =
    expenseMonthly > 0 ? Math.min(100, Math.round((expenseMonthly / (expenseMonthly * 1.5)) * 100)) : 0;

  const profitApprox = todayRevenue - expenseMonthly / 30;

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [reversingTx, setReversingTx] = useState<Transaction | null>(null);
  const [receiptViewTx, setReceiptViewTx] = useState<Transaction | null>(null);

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
      createdAt: editingTx?.createdAt ?? Date.now(),
      paymentMethod,
      ...(editingTx?.receipt ? { receipt: editingTx.receipt } : {}),
    };
    if (editingTx) {
      await onUpdateTransaction(editingTx.id, row);
    } else {
      await onAddTransaction(row);
    }
    setTxModalOpen(false);
    setEditingTx(null);
  };

  const transactionsFiltered = useMemo(() => {
    if (!headerSearch.trim()) return transactions;
    return transactions.filter((tx) =>
      rowMatchesSearch(headerSearch, [
        tx.orderNumber,
        tx.customer,
        tx.status,
        tx.type,
        tx.timestamp,
        String(tx.amount),
        ...(tx.receipt?.lines.map((l) => l.name) ?? []),
        ...(tx.receipt?.lines.map((l) => l.sku) ?? []),
      ]),
    );
  }, [transactions, headerSearch]);

  const recent = transactionsFiltered.slice(0, 8);

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
              {new Date().toLocaleDateString(locale === 'es' ? 'es' : 'en-US', { dateStyle: 'long' })}
            </span>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            className="flex items-center gap-2"
            onClick={() => {
              setEditingTx(null);
              setTxModalOpen(true);
            }}
          >
            <Plus size={16} /> {t('dashboard.registerTx')}
          </Button>
          <Button variant="secondary" className="flex items-center gap-2" onClick={() => setLogOpen(true)}>
            <ListOrdered size={16} /> {t('dashboard.fullLog')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-2 relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-container p-8 text-white shadow-lg">
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

        <Card className="bg-surface-container-low flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <Receipt className="text-primary" size={20} />
              </div>
              <span className="text-[10px] font-bold px-2 py-1 bg-surface-container-high rounded text-on-surface-variant">
                {t('dashboard.allRecords')}
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">{t('dashboard.totalExpenses')}</p>
            <h4 className="text-2xl font-bold text-primary">${expenseMonthly.toLocaleString()}</h4>
          </div>
          <div className="mt-4">
            <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${budgetPct}%` }} />
            </div>
            <p className="text-[10px] text-on-surface-variant mt-2 font-medium">{t('dashboard.relativeLoad')}</p>
          </div>
        </Card>

        <div className="rounded-xl bg-tertiary-container p-6 text-white flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-primary rounded-lg shadow-sm">
                <DollarSign className="text-on-tertiary-container" size={20} />
              </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">{t('dashboard.todayMinusExpenses')}</p>
            <h4 className="text-2xl font-bold">
              ${Math.round(profitApprox).toLocaleString()}
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
        <div className="space-y-3 mt-6">
          {recent.map((tx) => (
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
                    {tx.customer} • {tx.timestamp}
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
                    {tx.type === 'return' ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
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
                <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  {tx.receipt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('dashboard.viewReceiptAria')}
                      title={t('dashboard.viewReceipt')}
                      onClick={() => setReceiptViewTx(tx)}
                    >
                      <FileText size={14} />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    title={t('dashboard.editTx')}
                    onClick={() => {
                      setEditingTx(tx);
                      setTxModalOpen(true);
                    }}
                  >
                    <Edit2 size={14} />
                  </Button>
                  {canReverseSale(tx) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-error hover:bg-error/10"
                      title={t('dashboard.reverseTxTitle')}
                      onClick={() => setReversingTx(tx)}
                    >
                      <Undo2 size={14} />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="text-xs font-bold text-primary underline underline-offset-4 flex items-center gap-2 mx-auto"
          >
            {t('dashboard.viewTxLog')} <ArrowRight size={14} />
          </button>
        </div>
      </Card>

      <Modal
        isOpen={txModalOpen}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
        title={editingTx ? t('dashboard.editTx') : t('dashboard.registerTxTitle')}
      >
        <form key={editingTx?.id ?? 'new'} onSubmit={handleTxSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.orderNumber')}</label>
              <Input name="orderNumber" defaultValue={editingTx?.orderNumber ?? `#${Math.floor(Math.random() * 90000) + 10000}`} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.customer')}</label>
              <Input name="customer" defaultValue={editingTx?.customer} required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.amountAbsolute')}</label>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editingTx ? Math.abs(editingTx.amount) : undefined}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.displayTime')}</label>
              <Input name="timestamp" defaultValue={editingTx?.timestamp ?? 'Just now'} required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('dashboard.type')}</label>
              <select
                name="type"
                defaultValue={editingTx?.type ?? 'sale'}
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
                defaultValue={editingTx?.status ?? 'completed'}
                className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 outline-none"
              >
                {editingTx?.status === 'reversed' ? (
                  <option value="reversed">{t('dashboard.statusReversed')}</option>
                ) : (
                  <>
                    <option value="completed">{t('dashboard.statusCompleted')}</option>
                    <option value="pending">{t('dashboard.statusPending')}</option>
                    <option value="refunded">{t('dashboard.statusRefunded')}</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('dashboard.paymentMethod')}
            </label>
            <select
              name="paymentMethod"
              defaultValue={
                editingTx?.paymentMethod ??
                editingTx?.receipt?.paymentMethod ??
                'other'
              }
              className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="cash">{t('dashboard.pmCash')}</option>
              <option value="card">{t('dashboard.pmCard')}</option>
              <option value="transfer">{t('dashboard.pmTransfer')}</option>
              <option value="other">{t('dashboard.pmOther')}</option>
            </select>
          </div>
          <p className="text-[10px] text-on-surface-variant">{t('dashboard.returnsNote')}</p>
          <div className="pt-4 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setTxModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1">
              {editingTx ? t('common.save') : t('dashboard.create')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={logOpen} onClose={() => setLogOpen(false)} title={t('dashboard.txLogTitle')}>
        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {transactionsFiltered.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-container-low text-sm"
            >
              <span className="font-bold text-primary truncate">
                {tx.orderNumber} — {tx.customer}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('font-bold', tx.amount < 0 ? 'text-error' : 'text-primary')}>
                  ${tx.amount.toFixed(2)}
                </span>
                {tx.receipt ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1 h-8 w-8"
                    aria-label={t('dashboard.viewReceiptAria')}
                    title={t('dashboard.viewReceipt')}
                    onClick={() => {
                      setLogOpen(false);
                      setReceiptViewTx(tx);
                    }}
                  >
                    <FileText size={14} />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-8 w-8"
                  title={t('dashboard.editTx')}
                  onClick={() => {
                    setLogOpen(false);
                    setEditingTx(tx);
                    setTxModalOpen(true);
                  }}
                >
                  <Edit2 size={14} />
                </Button>
                {canReverseSale(tx) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1 h-8 w-8 text-error"
                    title={t('dashboard.reverseTxTitle')}
                    onClick={() => setReversingTx(tx)}
                  >
                    <Undo2 size={14} />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmDeleteModal
        target={reversingTx}
        title={t('dashboard.reverseTxTitle')}
        renderMessage={(tx) =>
          tx.receipt?.lines?.length
            ? t('dashboard.reverseTxBody', { order: tx.orderNumber })
            : `${t('dashboard.reverseTxBody', { order: tx.orderNumber })} ${t('dashboard.reverseTxNoReceipt')}`
        }
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
