import { useMemo, useState } from 'react';
import { Search, Download, TrendingDown, Plus, Edit2, Trash2 } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { Expense } from '../types';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n } from '../i18n/I18nContext';

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadExpensesCsv(rows: Expense[]) {
  const header = 'title,category,date,amount';
  const lines = rows.map(
    (e) =>
      `${escapeCsvCell(e.title)},${escapeCsvCell(e.category)},${escapeCsvCell(e.date)},${e.amount}`,
  );
  const blob = new Blob([`${header}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface ExpensesProps {
  expenses: Expense[];
  globalSearch?: string;
  onAdd: (row: Omit<Expense, 'id'>) => void | Promise<void>;
  onUpdate: (id: string, updates: Partial<Expense>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export function Expenses({ expenses, globalSearch = '', onAdd, onUpdate, onDelete }: ExpensesProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const filtered = useMemo(
    () =>
      expenses.filter(
        (e) =>
          rowMatchesSearch(searchTerm, [e.title, e.category, e.date, String(e.amount)]) &&
          rowMatchesSearch(globalSearch, [e.title, e.category, e.date, String(e.amount)]),
      ),
    [expenses, searchTerm, globalSearch],
  );

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

  const largest = useMemo(() => {
    if (expenses.length === 0) return null;
    return expenses.reduce((a, b) => (b.amount > a.amount ? b : a));
  }, [expenses]);

  const largestPct =
    largest && totalExpenses > 0 ? Math.round((largest.amount / totalExpenses) * 100) : 0;

  const budgetUtilization = useMemo(() => {
    if (totalExpenses === 0) return 0;
    return Math.min(100, Math.round((totalExpenses / (totalExpenses * 1.2)) * 100));
  }, [totalExpenses]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const row = {
      title: fd.get('title') as string,
      category: fd.get('category') as string,
      date: fd.get('date') as string,
      amount: parseFloat(fd.get('amount') as string),
    };
    if (editing) {
      await onUpdate(editing.id, row);
    } else {
      await onAdd(row);
    }
    setModalOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">{t('expenses.pageTitle')}</h2>
          <p className="text-on-surface-variant text-sm font-medium">{t('expenses.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus size={16} /> {t('expenses.addExpense')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-primary text-white">
          <p className="text-[10px] opacity-70 uppercase tracking-widest font-bold mb-1">{t('expenses.totalExpenses')}</p>
          <h3 className="text-3xl font-extrabold tracking-tight">${totalExpenses.toLocaleString()}</h3>
          <div className="mt-4 flex items-center gap-2 text-on-tertiary-container">
            <TrendingDown size={16} />
            <span className="text-xs font-bold">{t('expenses.recordedLocal')}</span>
          </div>
        </Card>
        <Card>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">
            {t('expenses.largestEntry')}
          </p>
          <h3 className="text-2xl font-bold text-primary">{largest?.title ?? '—'}</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            {largest
              ? `$${largest.amount.toLocaleString()} (${t('expenses.pctOfTotal', { pct: largestPct })})`
              : t('expenses.addToSeeInsights')}
          </p>
        </Card>
        <Card>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">
            {t('expenses.budgetUtil')}
          </p>
          <h3 className="text-2xl font-bold text-primary">{budgetUtilization}%</h3>
          <div className="mt-4 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div className="bg-primary h-full transition-all" style={{ width: `${budgetUtilization}%` }} />
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-black/5 flex flex-wrap gap-4 justify-between items-center bg-surface-container-low">
          <div className="relative w-full max-w-sm min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              placeholder={t('expenses.searchPlaceholder')}
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="secondary" className="flex items-center gap-2" onClick={() => downloadExpensesCsv(filtered)}>
            <Download size={16} /> {t('expenses.exportCsv')}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-black/5">
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">
                  {t('expenses.colTitle')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  {t('expenses.colCategory')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  {t('expenses.colDate')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  {t('expenses.colAmount')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense) => (
                <tr
                  key={expense.id}
                  className="group hover:bg-surface-container-low transition-colors border-b border-black/5 last:border-0"
                >
                  <td className="py-4 px-6 font-bold text-primary">{expense.title}</td>
                  <td className="py-4 px-6 text-right text-sm font-medium text-secondary">{expense.category}</td>
                  <td className="py-4 px-6 text-right text-sm text-on-surface-variant">{expense.date}</td>
                  <td className="py-4 px-6 text-right text-sm font-bold text-primary">
                    ${expense.amount.toLocaleString()}
                  </td>
                  <td className="py-4 px-6 text-right">
                    {expense.locked ? (
                      <span className="text-[10px] font-bold uppercase text-on-surface-variant">{t('expenses.locked')}</span>
                    ) : (
                      <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(expense);
                            setModalOpen(true);
                          }}
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-error hover:bg-error/10"
                          onClick={() => setDeleting(expense)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? t('expenses.editExpense') : t('expenses.addExpenseTitle')}
      >
        <form key={editing?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.fieldTitle')}</label>
            <Input name="title" defaultValue={editing?.title} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.colCategory')}</label>
              <Input name="category" defaultValue={editing?.category} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.date')}</label>
              <Input name="date" type="date" defaultValue={editing?.date} required />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.amount')}</label>
            <Input name="amount" type="number" step="0.01" min="0" defaultValue={editing?.amount} required />
          </div>
          <div className="pt-4 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1">
              {editing ? t('expenses.saveChanges') : t('expenses.createExpense')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        target={deleting}
        title={t('expenses.deleteTitle')}
        renderMessage={(e) => t('expenses.deleteBody', { title: e.title })}
        onClose={() => setDeleting(null)}
        onDelete={onDelete}
        mapError={(err) => mapMutationError(err, t)}
      />
    </div>
  );
}
