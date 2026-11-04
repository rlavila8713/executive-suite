import { useCallback, useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { Card, Input, Button } from '../components/ui';
import { MovementQuantityCell } from '../components/MovementQuantityCell';
import { MovementReversalActions } from '../components/MovementReversalActions';
import { MovementReversalHistoryModal } from '../components/MovementReversalHistoryModal';
import { ReverseWarehouseEntryModal } from '../components/ReverseWarehouseEntryModal';
import type { Product, WarehouseMovement } from '../types';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { rowMatchesSearch } from '../lib/utils';
import { usePagination } from '../lib/usePagination';
import { TablePagination } from '../components/TablePagination';
import {
  dateRangeForPreset,
  movementCanBeReversed,
  movementListTypeLabelKey,
  movementReversibleQuantity,
  reversalVisibleForPerspective,
  toInputDate,
  type StockMovementDatePreset,
} from '../lib/stockMovements';
import { formatAppDateTime } from '../lib/dateFormat';

type TabId = 'warehouse' | 'store';

interface StockMovementsProps {
  products: Product[];
  globalSearch?: string;
  onAfterMutation?: () => void;
}

export function StockMovements({ products, globalSearch = '', onAfterMutation }: StockMovementsProps) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<TabId>('warehouse');
  const [datePreset, setDatePreset] = useState<StockMovementDatePreset>('month');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return toInputDate(d);
  });
  const [customEnd, setCustomEnd] = useState(() => toInputDate(new Date()));
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<WarehouseMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<WarehouseMovement | null>(null);
  const [reversalHistoryFor, setReversalHistoryFor] = useState<WarehouseMovement | null>(null);
  const [reversalsOnly, setReversalsOnly] = useState(false);
  const [consumptionOnly, setConsumptionOnly] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const range = useMemo(
    () => dateRangeForPreset(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd],
  );

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const scope =
        consumptionOnly && !reversalsOnly ? 'consumption' : tab === 'store' ? 'store' : 'warehouse';
      const data = await api.getWarehouseMovements({
        scope,
        types: reversalsOnly ? ['REVERSAL'] : undefined,
        from: range.start,
        to: range.end,
        limit: 5000,
      });
      setRows(data);
    } catch {
      setLoadError(t('stockMovements.loadError'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, range.start, range.end, consumptionOnly, reversalsOnly, t]);

  useEffect(() => {
    void fetchMovements();
  }, [fetchMovements]);

  const perspective = tab === 'store' ? 'store' : 'warehouse';

  const visible = useMemo(() => {
    return rows.filter((m) => {
      if (!reversalVisibleForPerspective(m, perspective)) return false;
      if (reversalsOnly && m.type !== 'REVERSAL') return false;
      if (consumptionOnly && !reversalsOnly && m.type !== 'EXPENSE_STORE' && m.type !== 'EXPENSE_WAREHOUSE') {
        return false;
      }
      const p = productById.get(m.productId);
      const name = m.productName ?? p?.name ?? '';
      const sku = m.productSku ?? p?.sku ?? '';
      const label = [name, sku, m.createdBy ?? ''].join(' ');
      if (!rowMatchesSearch(search, [label]) || !rowMatchesSearch(globalSearch, [label])) return false;
      return true;
    });
  }, [rows, search, globalSearch, productById, reversalsOnly, consumptionOnly, perspective]);

  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(visible);

  const presets: { id: StockMovementDatePreset; label: string }[] = [
    { id: 'today', label: t('stockMovements.presetToday') },
    { id: 'week', label: t('stockMovements.presetWeek') },
    { id: 'month', label: t('stockMovements.presetMonth') },
    { id: 'custom', label: t('stockMovements.presetCustom') },
  ];

  const tabs: { id: TabId; label: string }[] = [
    { id: 'warehouse', label: t('stockMovements.tabWarehouse') },
    { id: 'store', label: t('stockMovements.tabStore') },
  ];

  const formatMoney = (n: number | null) =>
    n != null && Number.isFinite(n) ? `$${n.toFixed(2)}` : '—';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline flex items-center gap-2">
          <History size={28} className="shrink-0" />
          {t('stockMovements.title')}
        </h2>
        <p className="text-on-surface-variant text-sm font-medium">{t('stockMovements.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? 'px-4 py-2 rounded-full text-xs font-bold bg-primary text-white shadow-md'
                : 'px-4 py-2 rounded-full text-xs font-bold bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-black/5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDatePreset(p.id)}
                className={
                  datePreset === p.id
                    ? 'px-3 py-1.5 rounded-full text-xs font-bold bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'px-3 py-1.5 rounded-full text-xs font-bold bg-surface-container-high text-on-surface-variant'
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          {datePreset === 'custom' ? (
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-[10px] font-bold uppercase text-on-surface-variant block mb-1">
                  {t('stockMovements.from')}
                </label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-on-surface-variant block mb-1">
                  {t('stockMovements.to')}
                </label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Input
              placeholder={t('stockMovements.searchProduct')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <Button variant="secondary" size="sm" disabled={loading} onClick={() => void fetchMovements()}>
              {t('stockMovements.refresh')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setReversalsOnly((v) => {
                  const next = !v;
                  if (next) setConsumptionOnly(false);
                  return next;
                });
              }}
              className={
                reversalsOnly
                  ? 'px-3 py-1.5 rounded-full text-xs font-bold bg-error/15 text-error ring-1 ring-error/30'
                  : 'px-3 py-1.5 rounded-full text-xs font-bold bg-surface-container-high text-on-surface-variant'
              }
            >
              {t('stockMovements.filterReversalsOnly')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConsumptionOnly((v) => {
                  const next = !v;
                  if (next) setReversalsOnly(false);
                  return next;
                });
              }}
              className={
                consumptionOnly
                  ? 'px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-900 dark:text-amber-200 ring-1 ring-amber-500/30'
                  : 'px-3 py-1.5 rounded-full text-xs font-bold bg-surface-container-high text-on-surface-variant'
              }
            >
              {t('stockMovements.filterConsumptionOnly')}
            </button>
          </div>
        </div>

        {loadError ? (
          <p className="p-6 text-sm text-error text-center">{loadError}</p>
        ) : loading ? (
          <p className="p-6 text-sm text-on-surface-variant text-center">{t('stockMovements.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-sm text-on-surface-variant text-center">
            {reversalsOnly ? t('stockMovements.emptyReversals') : t('stockMovements.empty')}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-on-surface-variant border-b border-black/5">
                    <th className="py-3 px-4">{t('warehouse.colMovementDate')}</th>
                    <th className="py-3 px-4">{t('warehouse.colMovementType')}</th>
                    <th className="py-3 px-4">{t('warehouse.colMovementProduct')}</th>
                    <th className="py-3 px-4 text-right">{t('warehouse.colMovementDelta')}</th>
                    <th className="py-3 px-4 text-right">{t('stockMovements.colCost')}</th>
                    {/* {tab === 'warehouse' ? (
                      <th className="py-3 px-4 text-right">{t('warehouse.colMovementBalance')}</th>
                    ) : null} */}
                    <th className="py-3 px-4">{t('warehouse.colMovementOperator')}</th>
                    <th className="py-3 px-4 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((m) => {
                    const p = productById.get(m.productId);
                    const reversible = movementReversibleQuantity(m);
                    const canReverse = movementCanBeReversed(m) && !m.reversedAt && reversible > 0;
                    return (
                      <tr key={m.id} className="border-b border-black/5">
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          {formatAppDateTime(m.createdAt, locale, 'short')}
                        </td>
                        <td className="py-3 px-4">
                          <div>{t(movementListTypeLabelKey(m))}</div>
                          {m.type === 'REVERSAL' && m.notes?.trim() ? (
                            <div className="text-xs text-on-surface-variant mt-0.5 max-w-[14rem]">
                              {m.notes.trim()}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{m.productName ?? p?.name ?? m.productId}</div>
                          <div className="text-xs text-on-surface-variant">{m.productSku ?? p?.sku}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <MovementQuantityCell movement={m} perspective={perspective} />
                        </td>
                        <td className="py-3 px-4 text-right">{formatMoney(m.unitCost)}</td>
                        {/* {tab === 'warehouse' ? (
                          <td className="py-3 px-4 text-right">{m.balanceAfter ?? '—'}</td>
                        ) : null} */}
                        <td className="py-3 px-4 text-xs text-on-surface-variant">{m.createdBy ?? '—'}</td>
                        <td className="py-3 px-4 text-right">
                          <MovementReversalActions
                            movement={m}
                            canReverse={canReverse}
                            onReverse={() => setReversing(m)}
                            onHistory={() => setReversalHistoryFor(m)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ReverseWarehouseEntryModal
        movement={reversing}
        onClose={() => setReversing(null)}
        onReversed={() => {
          void fetchMovements();
          onAfterMutation?.();
        }}
      />
      <MovementReversalHistoryModal
        movement={reversalHistoryFor}
        onClose={() => setReversalHistoryFor(null)}
      />
    </div>
  );
}
