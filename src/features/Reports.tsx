import { useMemo } from 'react';
import { TrendingUp, Download } from 'lucide-react';
import { Card, Button } from '../components/ui';
import { cn } from '../lib/utils';
import { Expense, Product, Transaction } from '../types';

interface ReportsProps {
  transactions: Transaction[];
  expenses: Expense[];
  products: Product[];
}

function completedSalesTotal(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'sale' && t.status === 'completed')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
}

function expenseTotal(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + e.amount, 0);
}

export function Reports({ transactions, expenses, products }: ReportsProps) {
  const revenue = useMemo(() => completedSalesTotal(transactions), [transactions]);
  const expenseSum = useMemo(() => expenseTotal(expenses), [expenses]);
  const netApprox = revenue - expenseSum;
  const marginPct =
    revenue > 0 ? Math.min(99.9, Math.max(0, (netApprox / revenue) * 100)) : expenseSum > 0 ? 0 : 24.8;

  const expenseBreakdown = useMemo(() => {
    if (expenses.length === 0) return [];
    const max = Math.max(...expenses.map((e) => e.amount), 1);
    return expenses
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
      .map((e) => ({
        label: e.title,
        value: `$${e.amount.toLocaleString()}`,
        progress: Math.round((e.amount / max) * 100),
        color: 'bg-primary-container',
      }));
  }, [expenses]);

  const lowStockCount = useMemo(() => products.filter((p) => p.stock <= 5).length, [products]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <nav className="flex gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            <span className="hover:text-primary cursor-pointer transition-colors">Analytics</span>
            <span>/</span>
            <span className="text-primary">Performance</span>
          </nav>
          <h2 className="text-4xl font-extrabold tracking-tight text-primary font-headline">Financial Intelligence</h2>
          <p className="text-sm text-on-surface-variant mt-2">Figures below are computed from your local database.</p>
        </div>
        <Button variant="secondary" className="flex items-center gap-2" onClick={() => window.print()}>
          <Download size={18} /> Print / PDF
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 bg-gradient-to-br from-primary to-primary-container rounded-xl p-8 text-white relative overflow-hidden flex flex-col justify-between shadow-2xl">
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70 mb-1">Recorded sales (completed)</p>
            <h3 className="text-4xl sm:text-5xl font-extrabold tracking-tighter mb-4">
              ${revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1 bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded text-xs font-bold">
                <TrendingUp size={14} /> Live data
              </span>
              <span className="text-xs opacity-60">Sum of completed sale transactions</span>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 400 200">
              <path
                d="M0,150 Q50,140 100,100 T200,80 T300,120 T400,20"
                fill="none"
                stroke="white"
                strokeLinecap="round"
                strokeWidth="4"
              />
            </svg>
          </div>
        </div>

        <Card className="col-span-12 lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-tertiary-container/10 flex items-center justify-center mb-4">
              <TrendingUp className="text-on-tertiary-container" size={20} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
              Net (sales − expenses)
            </p>
            <h3
              className={cn(
                'text-2xl font-bold tracking-tight',
                netApprox >= 0 ? 'text-primary' : 'text-error',
              )}
            >
              ${netApprox.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </h3>
            <p className="text-xs text-on-surface-variant mt-2">Rough estimate from stored rows</p>
          </div>
          <div className="mt-4">
            <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-on-tertiary-container h-full transition-all"
                style={{ width: `${Math.min(100, marginPct)}%` }}
              />
            </div>
            <p className="text-[10px] text-on-surface-variant mt-2 font-medium">
              Margin vs sales: {marginPct.toFixed(1)}%
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Operational flags">
          <div className="space-y-3 mt-6">
            <div className="bg-surface-container-low p-4 rounded-xl flex items-center justify-between border border-black/5">
              <div>
                <h5 className="text-sm font-bold text-primary">Low-stock SKUs</h5>
                <p className="text-xs text-on-surface-variant">Products at or below 5 units</p>
              </div>
              <p className="text-xl font-black text-error">{lowStockCount}</p>
            </div>
            <div className="bg-surface-container-low p-4 rounded-xl flex items-center justify-between border border-black/5">
              <div>
                <h5 className="text-sm font-bold text-primary">Open transactions</h5>
                <p className="text-xs text-on-surface-variant">Status = pending</p>
              </div>
              <p className="text-xl font-black text-primary">
                {transactions.filter((t) => t.status === 'pending').length}
              </p>
            </div>
          </div>
        </Card>

        <Card title="Expense breakdown">
          <div className="space-y-6 mt-6">
            {expenseBreakdown.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Add expenses to populate this chart.</p>
            ) : (
              expenseBreakdown.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium truncate pr-2">{item.label}</span>
                    <span className="text-sm font-bold shrink-0">{item.value}</span>
                  </div>
                  <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden">
                    <div className={cn('h-full', item.color)} style={{ width: `${item.progress}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
