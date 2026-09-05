import { useMemo, useState } from 'react';
import { Search, Plus, Edit2, Trash2, MapPin } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import type { Product, ProductLocation } from '../types';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n, type TranslateFn } from '../i18n/I18nContext';

function mapLocationError(err: unknown, t: TranslateFn): string {
  return mapMutationError(err, t);
}

interface LocationsProps {
  locations: ProductLocation[];
  products: Product[];
  globalSearch?: string;
  onAdd: (name: string) => void | Promise<void>;
  onUpdate: (id: string, name: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export function Locations({ locations, products, globalSearch = '', onAdd, onUpdate, onDelete }: LocationsProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductLocation | null>(null);
  const [deleting, setDeleting] = useState<ProductLocation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const usageById = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (p.locationId) map.set(p.locationId, (map.get(p.locationId) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const filtered = useMemo(
    () =>
      [...locations]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((l) => rowMatchesSearch(searchTerm, [l.name]) && rowMatchesSearch(globalSearch, [l.name])),
    [locations, searchTerm, globalSearch],
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const name = (new FormData(e.currentTarget).get('name') as string).trim();
    if (!name) {
      setFormError(t('locations.enterName'));
      return;
    }
    try {
      if (editing) await onUpdate(editing.id, name);
      else await onAdd(name);
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(mapLocationError(err, t));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">
            {t('locations.title')}
          </h2>
          <p className="text-on-surface-variant text-sm font-medium max-w-xl">{t('locations.subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2"
        >
          <Plus size={16} /> {t('locations.add')}
        </Button>
      </div>

      <Card className="h-28 flex flex-col justify-between max-w-xs">
        <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">{t('locations.total')}</span>
        <div className="flex items-center gap-2">
          <MapPin className="text-primary" size={22} />
          <span className="text-3xl font-extrabold text-primary">{locations.length}</span>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-black/5 bg-surface-container-low">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              placeholder={t('locations.searchPlaceholder')}
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
                <th className="py-4 px-6 text-[10px] uppercase tracking-widest font-black text-on-surface-variant">
                  {t('locations.colName')}
                </th>
                <th className="py-4 px-6 text-[10px] uppercase tracking-widest font-black text-on-surface-variant text-right">
                  {t('locations.colProducts')}
                </th>
                <th className="py-4 px-6 text-[10px] uppercase tracking-widest font-black text-on-surface-variant text-right">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-black/5 last:border-0 hover:bg-surface-container-low">
                  <td className="py-4 px-6 font-bold text-primary">{l.name}</td>
                  <td className="py-4 px-6 text-right text-sm text-secondary">{usageById.get(l.id) ?? 0}</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(l);
                          setFormError(null);
                          setModalOpen(true);
                        }}
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-error"
                        onClick={() => setDeleting(l)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('locations.edit') : t('locations.new')}>
        <form key={editing?.id ?? 'new'} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{t('locations.name')}</label>
            <Input name="name" defaultValue={editing?.name} required autoFocus />
          </div>
          {formError ? <p className="text-sm text-error">{formError}</p> : null}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        target={deleting}
        title={t('locations.deleteTitle')}
        renderMessage={(l) => t('locations.deleteBody', { name: l.name })}
        onClose={() => setDeleting(null)}
        onDelete={onDelete}
        mapError={(err) => mapLocationError(err, t)}
      />
    </div>
  );
}
