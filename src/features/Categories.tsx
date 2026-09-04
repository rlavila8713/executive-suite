import { useMemo, useState } from 'react';
import { Search, Plus, Edit2, Trash2, Tags, Layers } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import type { Product, ProductCategory } from '../types';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n, type TranslateFn } from '../i18n/I18nContext';

function mapCategoryError(err: unknown, t: TranslateFn): string {
  return mapMutationError(err, t);
}

interface CategoriesProps {
  categories: ProductCategory[];
  products: Product[];
  globalSearch?: string;
  onAdd: (name: string) => void | Promise<void>;
  onRename: (id: string, newName: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onManageSubcategories?: (categoryId: string) => void;
}

export function Categories({
  categories,
  products,
  globalSearch = '',
  onAdd,
  onRename,
  onDelete,
  onManageSubcategories,
}: CategoriesProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [deleting, setDeleting] = useState<ProductCategory | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const usageByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const key = p.category;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const filtered = useMemo(
    () =>
      sorted.filter(
        (c) =>
          rowMatchesSearch(searchTerm, [c.name]) && rowMatchesSearch(globalSearch, [c.name]),
      ),
    [sorted, searchTerm, globalSearch],
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string).trim();
    if (!name) {
      setFormError(t('categories.enterName'));
      return;
    }
    try {
      if (editing) {
        await onRename(editing.id, name);
      } else {
        await onAdd(name);
      }
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(mapCategoryError(err, t));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">{t('categories.title')}</h2>
          <p className="text-on-surface-variant text-sm font-medium max-w-xl">{t('categories.subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2"
        >
          <Plus size={16} /> {t('categories.addCategory')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="h-28 flex flex-col justify-between">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">{t('categories.total')}</span>
          <div className="flex items-center gap-2">
            <Tags className="text-primary" size={22} />
            <span className="text-3xl font-extrabold text-primary">{categories.length}</span>
          </div>
        </Card>
        <Card className="h-28 flex flex-col justify-between md:col-span-2">
          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">{t('categories.tipLabel')}</span>
          <p className="text-sm text-on-surface-variant font-medium">{t('categories.tipBody')}</p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-black/5 flex justify-between items-center bg-surface-container-low">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              placeholder={t('categories.searchPlaceholder')}
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-black/5">
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">
                  {t('categories.colName')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black">
                  {t('categories.colCode')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  {t('categories.colProducts')}
                </th>
                <th className="py-4 px-6 text-[10px] text-on-surface-variant uppercase tracking-widest font-black text-right">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const n = usageByName.get(c.name) ?? 0;
                return (
                  <tr
                    key={c.id}
                    className="group hover:bg-surface-container-low transition-colors border-b border-black/5 last:border-0"
                  >
                    <td className="py-4 px-6 font-bold text-primary">{c.name}</td>
                    <td className="py-4 px-6 font-mono text-sm text-secondary">{c.code}</td>
                    <td className="py-4 px-6 text-right text-sm font-medium text-secondary">{n}</td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        {onManageSubcategories ? (
                          <Button variant="ghost" size="sm" title={t('categories.manageSubcategories')} onClick={() => onManageSubcategories(c.id)}>
                            <Layers size={14} />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(c);
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
                            setDeleting(c);
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
        <div className="px-8 py-4 bg-surface-container-low border-t border-black/5">
          <span className="text-xs text-on-surface-variant font-medium">{t('categories.showing', { count: filtered.length })}</span>
        </div>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          setFormError(null);
        }}
        title={editing ? t('categories.editCategory') : t('categories.newCategory')}
      >
        <form key={editing?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('categories.name')}</label>
            <Input name="name" defaultValue={editing?.name} required autoFocus />
          </div>
          {formError ? <p className="text-sm text-error font-medium">{formError}</p> : null}
          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setModalOpen(false);
                setEditing(null);
                setFormError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1">
              {editing ? t('common.save') : t('common.add')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        target={deleting}
        title={t('categories.deleteTitle')}
        renderMessage={(c) => t('categories.deleteBody', { name: c.name })}
        onClose={() => setDeleting(null)}
        onDelete={onDelete}
        mapError={(err) => mapCategoryError(err, t)}
      />
    </div>
  );
}
