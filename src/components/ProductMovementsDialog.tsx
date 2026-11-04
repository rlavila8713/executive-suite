import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from './ui';
import { MovementQuantityCell } from './MovementQuantityCell';
import { MovementReversalActions } from './MovementReversalActions';
import { MovementReversalHistoryModal } from './MovementReversalHistoryModal';
import { ReverseWarehouseEntryModal } from './ReverseWarehouseEntryModal';
import type { Product, WarehouseMovement } from '../types';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import {
  movementCanBeReversed,
  movementReversibleQuantity,
} from '../lib/stockMovements';
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
  const [reversalHistoryFor, setReversalHistoryFor] = useState<WarehouseMovement | null>(null);

  const reload = useCallback(async () => {
    if (!product) return;
    setLoading(true);
    setError(null);
    try {
      const types =
        scope === 'warehouseEntry'
          ? (['ENTRY', 'REVERSAL'] as const)
          : (['TRANSFER_TO_STORE', 'REVERSAL'] as const);
      const data = await api.getWarehouseMovements({
        productId: product.id,
        types: [...types],
        limit: 500,
      });
      const filtered =
        scope === 'storeEntry'
          ? data.filter((m) => m.type !== 'REVERSAL' || m.quantityDelta > 0)
          : data.filter((m) => m.type !== 'REVERSAL' || m.quantityDelta < 0);
      setRows(filtered);
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
                <th className="py-2 px-2 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const reversible = movementReversibleQuantity(m);
                const canReverse = movementCanBeReversed(m) && !m.reversedAt && reversible > 0;
                return (
                  <tr key={m.id} className="border-b border-black/5">
                    <td className="py-2 px-2 text-xs whitespace-nowrap">
                      {formatAppDateTime(m.createdAt, locale, 'short')}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <MovementQuantityCell movement={m} perspective={perspective} />
                    </td>
                    <td className="py-2 px-2 text-right">{formatMoney(m.unitCost)}</td>
                    <td className="py-2 px-2 text-right">
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
    <MovementReversalHistoryModal
      movement={reversalHistoryFor}
      onClose={() => setReversalHistoryFor(null)}
    />
    </>
  );
}
