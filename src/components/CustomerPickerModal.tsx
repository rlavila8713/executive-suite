import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal, Button, Input } from './ui';
import type { Customer } from '../types';
import { formatCustomerName } from '../lib/customers';
import { rowMatchesSearch } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';
import { usePagination } from '../lib/usePagination';
import { TablePagination } from './TablePagination';

type CustomerPickerModalProps = {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  onSelect: (customer: Customer) => void;
};

export function CustomerPickerModal({ open, onClose, customers, onSelect }: CustomerPickerModalProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const sorted = [...customers].sort((a, b) => formatCustomerName(a).localeCompare(formatCustomerName(b)));
    return sorted.filter((c) =>
      rowMatchesSearch(search, [
        c.firstName,
        c.lastName,
        c.phone,
        c.address,
        formatCustomerName(c),
      ]),
    );
  }, [customers, search]);

  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(filtered);

  return (
    <Modal isOpen={open} onClose={onClose} title={t('customers.pickerTitle')}>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
          <Input
            className="pl-9"
            placeholder={t('customers.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-[min(50vh,20rem)] overflow-y-auto border border-black/5 rounded-lg">
          {pageItems.length === 0 ? (
            <p className="p-6 text-sm text-center text-on-surface-variant">{t('customers.empty')}</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {pageItems.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors"
                    onClick={() => {
                      onSelect(c);
                      onClose();
                      setSearch('');
                    }}
                  >
                    <p className="font-bold text-primary">{formatCustomerName(c)}</p>
                    {c.phone ? (
                      <p className="text-xs text-on-surface-variant mt-0.5">{c.phone}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Modal>
  );
}
