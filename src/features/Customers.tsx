import { useMemo, useState } from 'react';
import { Search, Plus, Edit2, Trash2, Users } from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { TablePagination } from '../components/TablePagination';
import type { Customer } from '../types';
import { formatCustomerName } from '../lib/customers';
import { rowMatchesSearch } from '../lib/utils';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n } from '../i18n/I18nContext';
import { usePagination } from '../lib/usePagination';
import { cn } from '../lib/utils';

interface CustomersProps {
  customers: Customer[];
  globalSearch?: string;
  highlightId?: string | null;
  onAdd: (row: Omit<Customer, 'id' | 'createdAt'>) => void | Promise<void>;
  onUpdate: (id: string, updates: Partial<Omit<Customer, 'id' | 'createdAt'>>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export function Customers({
  customers,
  globalSearch = '',
  highlightId = null,
  onAdd,
  onUpdate,
  onDelete,
}: CustomersProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      [...customers]
        .sort((a, b) => formatCustomerName(a).localeCompare(formatCustomerName(b)))
        .filter(
          (c) =>
            rowMatchesSearch(searchTerm, [
              c.firstName,
              c.lastName,
              c.phone,
              c.address,
              c.notes,
              formatCustomerName(c),
            ]) &&
            rowMatchesSearch(globalSearch, [
              c.firstName,
              c.lastName,
              c.phone,
              c.address,
              formatCustomerName(c),
            ]),
        ),
    [customers, searchTerm, globalSearch],
  );

  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const firstName = (fd.get('firstName') as string).trim();
    if (!firstName) {
      setFormError(t('customers.nameRequired'));
      return;
    }
    const row = {
      firstName,
      lastName: (fd.get('lastName') as string).trim(),
      address: (fd.get('address') as string).trim(),
      phone: (fd.get('phone') as string).trim(),
      notes: (fd.get('notes') as string).trim(),
    };
    try {
      if (editing) await onUpdate(editing.id, row);
      else await onAdd(row);
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(mapMutationError(err, t));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">
            {t('customers.title')}
          </h2>
          <p className="text-on-surface-variant text-sm font-medium max-w-xl">{t('customers.subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2"
        >
          <Plus size={16} /> {t('customers.addCustomer')}
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
          <Input
            className="pl-9"
            placeholder={t('customers.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low">
              <tr className="text-[10px] uppercase text-on-surface-variant">
                <th className="px-4 py-3">{t('customers.colName')}</th>
                <th className="px-4 py-3">{t('customers.colPhone')}</th>
                <th className="px-4 py-3">{t('customers.colAddress')}</th>
                <th className="px-4 py-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-on-surface-variant">
                    {t('customers.empty')}
                  </td>
                </tr>
              ) : (
                pageItems.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      'border-t border-black/5 hover:bg-surface-container-low/50',
                      highlightId === c.id && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-primary shrink-0" />
                        <div>
                          <p className="font-bold text-primary">{formatCustomerName(c)}</p>
                          {c.notes ? (
                            <p className="text-xs text-on-surface-variant line-clamp-1">{c.notes}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm max-w-xs truncate">{c.address || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditing(c);
                            setFormError(null);
                            setModalOpen(true);
                          }}
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setDeleting(c)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? t('customers.editTitle') : t('customers.addTitle')}
      >
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('customers.fieldFirstName')} *
            </label>
            <Input name="firstName" defaultValue={editing?.firstName ?? ''} required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('customers.fieldLastName')}
            </label>
            <Input name="lastName" defaultValue={editing?.lastName ?? ''} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('customers.fieldAddress')}
            </label>
            <Input name="address" defaultValue={editing?.address ?? ''} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('customers.fieldPhone')}
            </label>
            <Input name="phone" defaultValue={editing?.phone ?? ''} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              {t('customers.fieldNotes')}
            </label>
            <Input name="notes" defaultValue={editing?.notes ?? ''} />
          </div>
          {formError ? <p className="text-sm text-error">{formError}</p> : null}
          <Button type="submit" className="w-full">
            {editing ? t('common.save') : t('customers.create')}
          </Button>
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={deleting != null}
        title={t('customers.deleteTitle')}
        body={t('customers.deleteBody', { name: deleting ? formatCustomerName(deleting) : '' })}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await onDelete(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
