import { useState } from 'react';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { Button, Input, Modal } from './ui';
import { TableActionGroup, TableIconAction } from './TableIconAction';
import type { ExpenseCategory } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { mapMutationError } from '../lib/mutationErrors';

interface ExpenseCategoryManagerProps {
  isOpen: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ExpenseCategoryManager({
  isOpen,
  categories,
  onClose,
  onAdd,
  onRename,
  onDelete,
}: ExpenseCategoryManagerProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onAdd(name.trim());
      setName('');
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setBusy(true);
    try {
      await onRename(editing.id, editName.trim());
      setEditing(null);
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('expenses.categoriesTitle')}>
      <form onSubmit={(e) => void handleAdd(e)} className="flex gap-2 mb-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('expenses.categoryNamePlaceholder')}
          required
        />
        <Button type="submit" disabled={busy} className="gap-1 shrink-0">
          <Plus size={14} /> {t('common.add')}
        </Button>
      </form>
      {error ? <p className="text-sm text-error mb-3">{error}</p> : null}
      <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-black/5 px-3 py-2 bg-surface-container-lowest"
          >
            <div>
              <p className="text-sm font-bold text-primary">{c.name}</p>
              {c.isSystem ? (
                <p className="text-[10px] text-on-surface-variant uppercase font-bold">{t('expenses.categorySystem')}</p>
              ) : null}
            </div>
            {!c.isSystem ? (
              <TableActionGroup>
                <TableIconAction
                  icon={Edit2}
                  label={t('common.edit')}
                  tone="brand"
                  onClick={() => {
                    setEditing(c);
                    setEditName(c.name);
                    setError(null);
                  }}
                />
                <TableIconAction
                  icon={Trash2}
                  label={t('common.delete')}
                  tone="danger"
                  onClick={() => void onDelete(c.id)}
                />
              </TableActionGroup>
            ) : null}
          </li>
        ))}
      </ul>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={t('expenses.editCategory')}>
        <form onSubmit={(e) => void handleRename(e)} className="space-y-4">
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <Button type="submit" disabled={busy}>{t('common.save')}</Button>
        </form>
      </Modal>
    </Modal>
  );
}
