import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Button, Input, Modal } from './ui';
import { TableIconAction } from './TableIconAction';
import type { Expense, ExpenseCategory, Product, WarehouseStock } from '../types';
import { INVENTORY_CONSUMPTION_CATEGORY_CODE } from '../constants/expenseCategories';
import { useI18n } from '../i18n/I18nContext';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';

type SourceTab = 'store' | 'warehouse';

type ConsumptionLine = { productId: string; quantity: string };

interface ExpenseFormModalProps {
  isOpen: boolean;
  editing: Expense | null;
  categories: ExpenseCategory[];
  products: Product[];
  warehouseStock: WarehouseStock[];
  onClose: () => void;
  onSaveRegular: (row: Omit<Expense, 'id'>) => Promise<void>;
  onSaveConsumption: (payload: {
    items: { productId: string; quantity: number }[];
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
  const [consumptionLines, setConsumptionLines] = useState<ConsumptionLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const isConsumption = selectedCategory?.code === INVENTORY_CONSUMPTION_CATEGORY_CODE && !editing;

  const stockByProduct = useMemo(() => new Map(warehouseStock.map((s) => [s.productId, s])), [warehouseStock]);
  const selectedProductIds = useMemo(() => new Set(consumptionLines.map((l) => l.productId)), [consumptionLines]);

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
      setConsumptionLines([]);
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
    let total = 0;
    for (const line of consumptionLines) {
      const p = products.find((x) => x.id === line.productId);
      const qty = Math.floor(Number(line.quantity));
      if (!p || !Number.isFinite(qty) || qty <= 0) continue;
      if (sourceTab === 'store') {
        total += p.cost * qty;
      } else {
        const wh = stockByProduct.get(p.id);
        if (wh) total += wh.unitCost * qty;
      }
    }
    if (total <= 0) return null;
    return Math.round(total * 100) / 100;
  }, [products, consumptionLines, sourceTab, stockByProduct]);

  const toggleProduct = (productId: string) => {
    setConsumptionLines((prev) => {
      if (prev.some((l) => l.productId === productId)) {
        return prev.filter((l) => l.productId !== productId);
      }
      return [...prev, { productId, quantity: '1' }];
    });
  };

  const setLineQty = (productId: string, quantity: string) => {
    setConsumptionLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isConsumption) {
        const items = consumptionLines
          .map((line) => ({
            productId: line.productId,
            quantity: Math.floor(Number(line.quantity)),
          }))
          .filter((row) => row.productId && Number.isFinite(row.quantity) && row.quantity > 0);
        if (items.length === 0) {
          setError(t('expenses.consumptionSelectProduct'));
          return;
        }
        await onSaveConsumption({
          items,
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? t('expenses.editExpense') : t('expenses.addExpenseTitle')}
      size={isConsumption ? 'xlarge' : 'default'}
    >
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
                    setConsumptionLines([]);
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[14rem]">
              <div className="flex flex-col min-h-0 border border-black/5 rounded-xl overflow-hidden bg-surface-container-lowest">
                <div className="p-3 border-b border-black/5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {t('expenses.consumptionPickTitle')}
                  </p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={14} />
                    <Input
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('expenses.consumptionSearch')}
                    />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-64 lg:max-h-72 flex-1">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-container-low z-10">
                      <tr className="text-left text-[10px] uppercase tracking-widest text-on-surface-variant border-b border-black/5">
                        <th className="py-2 px-3 font-bold">{t('expenses.consumptionColProduct')}</th>
                        <th className="py-2 px-3 text-right font-bold w-20">{t('expenses.consumptionColAvail')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((p) => {
                        const wh = stockByProduct.get(p.id);
                        const qtyAvail = sourceTab === 'store' ? p.stock : (wh?.quantity ?? 0);
                        const selected = selectedProductIds.has(p.id);
                        return (
                          <tr
                            key={p.id}
                            className={
                              selected
                                ? 'bg-primary/10 cursor-pointer'
                                : 'hover:bg-surface-container-low cursor-pointer border-b border-black/5'
                            }
                            onClick={() => toggleProduct(p.id)}
                          >
                            <td className="py-2 px-3">
                              <p className="font-bold text-primary text-sm leading-tight">{p.name}</p>
                              <p className="text-[10px] text-on-surface-variant">{p.sku}</p>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-xs">{qtyAvail}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {visibleProducts.length === 0 ? (
                    <p className="text-xs text-center text-on-surface-variant py-8">{t('expenses.consumptionNoProducts')}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col min-h-0 border border-primary/20 rounded-xl overflow-hidden bg-primary/5">
                <div className="p-3 border-b border-primary/15">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    {t('expenses.consumptionSelectedTitle')}
                  </p>
                </div>
                <div className="overflow-y-auto max-h-64 lg:max-h-72 flex-1">
                  {consumptionLines.length === 0 ? (
                    <p className="text-xs text-center text-on-surface-variant py-10 px-4">
                      {t('expenses.consumptionSelectedEmpty')}
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-primary/10 z-10">
                        <tr className="text-left text-[10px] uppercase tracking-widest text-on-surface-variant border-b border-primary/15">
                          <th className="py-2 px-3 font-bold">{t('expenses.consumptionColProduct')}</th>
                          <th className="py-2 px-3 text-right font-bold w-24">{t('expenses.consumptionQty')}</th>
                          <th className="py-2 px-3 w-12 text-right font-bold sr-only">{t('common.delete')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consumptionLines.map((line) => {
                          const p = products.find((x) => x.id === line.productId);
                          if (!p) return null;
                          return (
                            <tr key={line.productId} className="border-b border-primary/10">
                              <td className="py-2 px-3">
                                <p className="font-bold text-primary text-sm leading-tight">{p.name}</p>
                                <p className="text-[10px] text-on-surface-variant">{p.sku}</p>
                              </td>
                              <td className="py-2 px-3">
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  className="w-full text-right"
                                  value={line.quantity}
                                  onChange={(e) => setLineQty(line.productId, e.target.value)}
                                  required
                                />
                              </td>
                              <td className="py-2 px-3 text-right">
                                <TableIconAction
                                  icon={Trash2}
                                  label={t('common.delete')}
                                  tone="danger"
                                  onClick={() => toggleProduct(line.productId)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
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
