import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Input, Modal } from './ui';
import type { Expense, ExpenseCategory, Product, WarehouseStock } from '../types';
import { INVENTORY_CONSUMPTION_CATEGORY_CODE } from '../constants/expenseCategories';
import { useI18n } from '../i18n/I18nContext';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';

type SourceTab = 'store' | 'warehouse';

interface ExpenseFormModalProps {
  isOpen: boolean;
  editing: Expense | null;
  categories: ExpenseCategory[];
  products: Product[];
  warehouseStock: WarehouseStock[];
  onClose: () => void;
  onSaveRegular: (row: Omit<Expense, 'id'>) => Promise<void>;
  onSaveConsumption: (payload: {
    productId: string;
    quantity: number;
    source: 'store' | 'warehouse';
    title?: string;
    date: string;
  }) => Promise<void>;
}

export function ExpenseFormModal({
  isOpen,
  editing,
  categories,
  products,
  warehouseStock,
  onClose,
  onSaveRegular,
  onSaveConsumption,
}: ExpenseFormModalProps) {
  const { t } = useI18n();
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [sourceTab, setSourceTab] = useState<SourceTab>('store');
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const isConsumption = selectedCategory?.code === INVENTORY_CONSUMPTION_CATEGORY_CODE && !editing;

  const stockByProduct = useMemo(() => new Map(warehouseStock.map((s) => [s.productId, s])), [warehouseStock]);

  /** Avoid resetting the form when parent polling refreshes `categories` / props. */
  const formSessionKey = isOpen ? (editing?.id ?? 'new') : null;
  const lastInitializedSession = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || formSessionKey === null) {
      if (!isOpen) lastInitializedSession.current = null;
      return;
    }
    if (lastInitializedSession.current === formSessionKey) return;
    lastInitializedSession.current = formSessionKey;

    if (editing) {
      const match = categories.find((c) => c.name === editing.category);
      setCategoryId(match?.id ?? '');
      setTitle(editing.title);
      setDate(editing.date);
      setAmount(String(editing.amount));
    } else {
      setCategoryId(categories[0]?.id ?? '');
      setTitle('');
      setDate(new Date().toISOString().slice(0, 10));
      setAmount('');
      setSearch('');
      setSelectedProductId('');
      setQuantity('1');
      setSourceTab('store');
    }
    setError(null);
  }, [isOpen, formSessionKey, editing, categories]);

  useEffect(() => {
    if (!isOpen || categoryId) return;
    if (editing) {
      const match = categories.find((c) => c.name === editing.category);
      if (match) setCategoryId(match.id);
      return;
    }
    const first = categories[0]?.id;
    if (first) setCategoryId(first);
  }, [isOpen, editing, categoryId, categories]);

  const visibleProducts = useMemo(() => {
    return products.filter((p) => {
      const label = [p.name, p.sku].join(' ');
      if (!rowMatchesSearch(search, [label])) return false;
      if (sourceTab === 'store') return p.stock > 0;
      const wh = stockByProduct.get(p.id);
      return (wh?.quantity ?? 0) > 0;
    });
  }, [products, search, sourceTab, stockByProduct]);

  const previewAmount = useMemo(() => {
    const p = products.find((x) => x.id === selectedProductId);
    const qty = Math.floor(Number(quantity));
    if (!p || !Number.isFinite(qty) || qty <= 0) return null;
    if (sourceTab === 'store') {
      return Math.round(p.cost * qty * 100) / 100;
    }
    const wh = stockByProduct.get(p.id);
    if (!wh) return null;
    return Math.round(wh.unitCost * qty * 100) / 100;
  }, [products, selectedProductId, quantity, sourceTab, stockByProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isConsumption) {
        const qty = Math.floor(Number(quantity));
        if (!selectedProductId || qty <= 0) {
          setError(t('expenses.consumptionSelectProduct'));
          return;
        }
        await onSaveConsumption({
          productId: selectedProductId,
          quantity: qty,
          source: sourceTab,
          title: title.trim() || undefined,
          date,
        });
      } else {
        const cat = categories.find((c) => c.id === categoryId);
        if (!cat) {
          setError(t('expenses.categoryRequired'));
          return;
        }
        const amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0) {
          setError(t('expenses.invalidAmount'));
          return;
        }
        await onSaveRegular({
          title: title.trim(),
          category: cat.name,
          date,
          amount: amt,
        });
      }
      onClose();
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? t('expenses.editExpense') : t('expenses.addExpenseTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.colCategory')}</label>
          <select
            className="w-full bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={!!editing}
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.fieldTitle')}</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required={!isConsumption} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.date')}</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        {isConsumption ? (
          <>
            <p className="text-xs text-on-surface-variant">{t('expenses.consumptionHelp')}</p>
            <div className="flex gap-2">
              {(['store', 'warehouse'] as SourceTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setSourceTab(tab);
                    setSelectedProductId('');
                  }}
                  className={
                    sourceTab === tab
                      ? 'px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-white'
                      : 'px-3 py-1.5 rounded-full text-xs font-bold bg-surface-container-high text-on-surface-variant'
                  }
                >
                  {tab === 'store' ? t('expenses.consumptionTabStore') : t('expenses.consumptionTabWarehouse')}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={14} />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('expenses.consumptionSearch')} />
            </div>
            <div className="max-h-48 overflow-y-auto border border-black/5 rounded-lg divide-y divide-black/5">
              {visibleProducts.map((p) => {
                const wh = stockByProduct.get(p.id);
                const qtyAvail = sourceTab === 'store' ? p.stock : (wh?.quantity ?? 0);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProductId(p.id)}
                    className={
                      selectedProductId === p.id
                        ? 'w-full text-left px-3 py-2 bg-primary/10'
                        : 'w-full text-left px-3 py-2 hover:bg-surface-container-low'
                    }
                  >
                    <p className="text-sm font-bold text-primary">{p.name}</p>
                    <p className="text-[10px] text-on-surface-variant">
                      {p.sku} · {t('expenses.consumptionAvailable', { count: qtyAvail })}
                    </p>
                  </button>
                );
              })}
              {visibleProducts.length === 0 ? (
                <p className="text-xs text-center text-on-surface-variant py-4">{t('expenses.consumptionNoProducts')}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.consumptionQty')}</label>
              <Input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            {previewAmount != null ? (
              <p className="text-sm font-bold text-primary">{t('expenses.consumptionPreview', { amount: previewAmount.toFixed(2) })}</p>
            ) : null}
          </>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('expenses.amount')}</label>
            <Input name="amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        )}

        {error ? <p className="text-sm text-error">{error}</p> : null}
        <div className="pt-2 flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" className="flex-1" disabled={busy}>{editing ? t('expenses.saveChanges') : t('expenses.createExpense')}</Button>
        </div>
      </form>
    </Modal>
  );
}
