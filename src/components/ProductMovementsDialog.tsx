import { Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from './ui';
import { TableIconAction } from './TableIconAction';
import { ReverseWarehouseEntryModal } from './ReverseWarehouseEntryModal';
import type { Product, WarehouseMovement } from '../types';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { movementDisplayQuantity } from '../lib/stockMovements';
import { formatAppDateTime } from '../lib/dateFormat';

type MovementScope = 'warehouseEntry' | 'storeEntry';

interface ProductMovementsDialogProps {
  product: Product | null;
  scope: MovementScope;
  onClose: () => void;
  onAfterMutation?: () => void;
}

export function ProductMovementsDialog({ product, scope, onClose, onAfterMutation }: ProductMovementsDialogProps) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<WarehouseMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<WarehouseMovement | null>(null);

  const reload = useCallback(async () => {
    if (!product) return;
    setLoading(true);
    setError(null);
    try {
      const types =
        scope === 'warehouseEntry' ? (['ENTRY'] as const) : (['TRANSFER_TO_STORE'] as const);
      const data = await api.getWarehouseMovements({
        productId: product.id,
        types: [...types],
        limit: 500,
      });
      setRows(data);
    } catch {
      setError(t('stockMovements.loadError'));
    } finally {
      setLoading(false);
    }
  }, [product, scope, t]);

  const perspective = scope === 'storeEntry' ? 'store' : 'warehouse';

  useEffect(() => {
    if (!product) {
      setRows([]);
      setError(null);
      return;
    }
    void reload();
  }, [product, scope, reload]);

  const title = useMemo(() => {
    if (!product) return '';
    if (scope === 'warehouseEntry') {
      return t('stockMovements.productDialogTitleWarehouse', { name: product.name });
    }
    return t('stockMovements.productDialogTitleStore', { name: product.name });
  }, [product, scope, t]);

  const formatMoney = (n: number | null) =>
    n != null && Number.isFinite(n) ? `$${n.toFixed(2)}` : '—';

  return (
    <>
    <Modal isOpen={product !== null} onClose={onClose} title={title}>
      {loading ? (
        <p className="text-sm text-on-surface-variant py-4 text-center">{t('stockMovements.loading')}</p>
      ) : error ? (
        <p className="text-sm text-error py-4 text-center">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4 text-center">{t('stockMovements.productDialogEmpty')}</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-on-surface-variant border-b border-black/5">
                <th className="py-2 px-2">{t('warehouse.colMovementDate')}</th>
                <th className="py-2 px-2 text-right">{t('warehouse.colMovementDelta')}</th>
                <th className="py-2 px-2 text-right">{t('stockMovements.colCost')}</th>
                {scope === 'warehouseEntry' ? (
                  <th className="py-2 px-2 text-right">{t('common.actions')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const qty = movementDisplayQuantity(m, perspective);
                const reversible = m.reversibleQuantity ?? m.quantityDelta;
                const canReverse =
                  scope === 'warehouseEntry' &&
                  m.type === 'ENTRY' &&
                  !m.reversedAt &&
                  reversible > 0;
                return (
                  <tr key={m.id} className="border-b border-black/5">
                    <td className="py-2 px-2 text-xs whitespace-nowrap">
                      {formatAppDateTime(m.createdAt, locale, 'short')}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold">
                      {qty > 0 ? `+${qty}` : qty}
                      {m.reversedQuantity && m.reversedQuantity > 0 ? (
                        <span className="block text-[10px] font-normal text-on-surface-variant">
                          {t('stockMovements.partiallyReversed', { qty: m.reversedQuantity })}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 px-2 text-right">{formatMoney(m.unitCost)}</td>
                    {scope === 'warehouseEntry' ? (
                      <td className="py-2 px-2 text-right">
                        {canReverse ? (
                          <TableIconAction
                            icon={Undo2}
                            label={t('stockMovements.reversalAction')}
                            tone="danger"
                            onClick={() => setReversing(m)}
                          />
                        ) : m.reversedAt ? (
                          <span className="text-[10px] text-on-surface-variant uppercase font-bold">
                            {t('stockMovements.reversalDoneLabel')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
    <ReverseWarehouseEntryModal
      movement={reversing}
      onClose={() => setReversing(null)}
      onReversed={() => {
        void reload();
        onAfterMutation?.();
      }}
    />
    </>
  );
}
