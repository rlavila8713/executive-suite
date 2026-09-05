import { useMemo, useState } from 'react';
import { Search, Plus, Edit2, Trash2, Layers } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import type { Product, ProductCategory, ProductSubcategory } from '../types';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n, type TranslateFn } from '../i18n/I18nContext';

function mapSubcategoryError(err: unknown, t: TranslateFn): string {
  return mapMutationError(err, t);
}

interface SubcategoriesProps {
  categories: ProductCategory[];
  subcategories: ProductSubcategory[];
  products: Product[];
  filterCategoryId?: string;
  globalSearch?: string;
  onAdd: (row: { categoryId: string; name: string; code: string }) => void | Promise<void>;
  onUpdate: (id: string, updates: { name?: string; code?: string }) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export function Subcategories({
  categories,
  subcategories,
  products,
  filterCategoryId,
  globalSearch = '',
  onAdd,
  onUpdate,
  onDelete,
}: SubcategoriesProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(filterCategoryId ?? '');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductSubcategory | null>(null);
  const [deleting, setDeleting] = useState<ProductSubcategory | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const usageBySubId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (p.subcategoryId) map.set(p.subcategoryId, (map.get(p.subcategoryId) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    return subcategories
      .filter((s) => !categoryFilter || s.categoryId === categoryFilter)
      .filter(
        (s) => {
          const cat = categoryById.get(s.categoryId);
          return (
            rowMatchesSearch(searchTerm, [s.name, s.code, cat?.name ?? '']) &&
            rowMatchesSearch(globalSearch, [s.name, s.code, cat?.name ?? ''])
          );
        },
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subcategories, categoryFilter, searchTerm, globalSearch, categoryById]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const categoryId = (fd.get('categoryId') as string).trim();
    const name = (fd.get('name') as string).trim();
    const code = (fd.get('code') as string).trim().toUpperCase();
    if (!categoryId || !name || !code) {
      setFormError(t('subcategories.fillAll'));
      return;
    }
    try {
      if (editing) {
        await onUpdate(editing.id, { name, code });
      } else {
        await onAdd({ categoryId, name, code });
      }
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(mapSubcategoryError(err, t));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">
            {t('subcategories.title')}
          </h2>
          <p className="text-on-surface-variant text-sm font-medium max-w-xl">{t('subcategories.subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2"
        >
          <Plus size={16} /> {t('subcategories.add')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="h-28 flex flex-col justify-between">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">
            {t('subcategories.total')}
          </span>
          <div className="flex items-center gap-2">
            <Layers className="text-primary" size={22} />
            <span className="text-3xl font-extrabold text-primary">{subcategories.length}</span>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-black/5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-surface-container-low">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              placeholder={t('subcategories.searchPlaceholder')}
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-black/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">{t('subcategories.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-black/5">
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">
                  {t('subcategories.colCategory')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">
                  {t('subcategories.colName')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">
                  {t('subcategories.colCode')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  {t('subcategories.colProducts')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const cat = categoryById.get(s.categoryId);
                const n = usageBySubId.get(s.id) ?? 0;
                return (
                  <tr key={s.id} className="group hover:bg-surface-container-low transition-colors border-b border-black/5 last:border-0">
                    <td className="py-4 px-6 text-sm text-secondary">{cat ? `${cat.name} (${cat.code})` : '—'}</td>
                    <td className="py-4 px-6 font-bold text-primary">{s.name}</td>
                    <td className="py-4 px-6 font-mono text-sm">{s.code}</td>
                    <td className="py-4 px-6 text-right text-sm font-medium text-secondary">{n}</td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(s);
                            setFormError(null);
                            setModalOpen(true);
                          }}
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-error hover:bg-error/10"
                          onClick={() => {
                            setFormError(null);
                            setDeleting(s);
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          setFormError(null);
        }}
        title={editing ? t('subcategories.edit') : t('subcategories.new')}
      >
        <form key={editing?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('products.category')}
            </label>
            <select
              name="categoryId"
              required
              defaultValue={editing?.categoryId ?? categoryFilter}
              disabled={!!editing}
              className="w-full rounded-lg border border-black/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                {t('products.selectCategory')}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('categories.name')}</label>
            <Input name="name" defaultValue={editing?.name} required autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('subcategories.code')}
            </label>
            <Input name="code" defaultValue={editing?.code} required placeholder="GEN" className="uppercase" />
            <p className="text-[10px] text-on-surface-variant">{t('subcategories.codeHint')}</p>
          </div>
          {formError ? <p className="text-sm text-error font-medium">{formError}</p> : null}
          <div className="pt-2 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1">
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        target={deleting}
        title={t('subcategories.deleteTitle')}
        renderMessage={(s) => t('subcategories.deleteBody', { name: s.name })}
        onClose={() => setDeleting(null)}
        onDelete={onDelete}
        mapError={(err) => mapSubcategoryError(err, t)}
      />
    </div>
  );
}
