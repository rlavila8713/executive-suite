import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';
import { useI18n } from '../i18n/I18nContext';

type TablePaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function TablePagination({ page, totalPages, total, pageSize, onPageChange }: TablePaginationProps) {
  const { t } = useI18n();
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-black/5 bg-surface-container-low/50 text-xs">
      <p className="text-on-surface-variant font-medium">
        {t('common.paginationShowing', { from, to, total })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="gap-1"
        >
          <ChevronLeft size={14} /> {t('common.prevPage')}
        </Button>
        <span className="font-bold text-primary tabular-nums">
          {t('common.paginationPage', { page, totalPages })}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="gap-1"
        >
          {t('common.nextPage')} <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
