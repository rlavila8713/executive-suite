import { useEffect, useState } from 'react';
import { Modal } from './ui';
import type { WarehouseMovement } from '../types';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { formatAppDateTime } from '../lib/dateFormat';
import {
  movementOriginalAbsoluteQuantity,
  movementTypeLabelKey,
  reversalRowUnits,
} from '../lib/stockMovements';

interface MovementReversalHistoryModalProps {
  movement: WarehouseMovement | null;
  onClose: () => void;
}

export function MovementReversalHistoryModal({ movement, onClose }: MovementReversalHistoryModalProps) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<WarehouseMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movement) {
      setRows([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .getWarehouseMovementReversals(movement.id)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setError(t('stockMovements.reversalHistoryLoadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movement, t]);

  const originalQty = movement ? movementOriginalAbsoluteQuantity(movement) : 0;

  return (
    <Modal
      isOpen={movement !== null}
      onClose={onClose}
      title={t('stockMovements.reversalHistoryTitle')}
    >
      {movement ? (
        <div className="space-y-4">
          <div className="text-sm text-on-surface-variant space-y-1">
            <p>
              <span className="font-medium text-on-surface">{movement.productName}</span>
              {movement.productSku ? (
                <span className="text-on-surface-variant"> · {movement.productSku}</span>
              ) : null}
            </p>
            <p>
              {t(movementTypeLabelKey(movement.type))} ·{' '}
              {t('stockMovements.reversalHistoryOriginalQty', { qty: originalQty })}
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-on-surface-variant text-center py-4">{t('stockMovements.loading')}</p>
          ) : error ? (
            <p className="text-sm text-error text-center py-4">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">
              {t('stockMovements.reversalHistoryEmpty')}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-on-surface-variant border-b border-black/5">
                    <th className="py-2 px-2">{t('warehouse.colMovementDate')}</th>
                    <th className="py-2 px-2 text-right">{t('stockMovements.reversalHistoryColQty')}</th>
                    <th className="py-2 px-2">{t('stockMovements.reversalReasonLabel')}</th>
                    <th className="py-2 px-2">{t('warehouse.colMovementOperator')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-black/5 align-top">
                      <td className="py-2 px-2 text-xs whitespace-nowrap">
                        {formatAppDateTime(r.createdAt, locale, 'short')}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{reversalRowUnits(r)}</td>
                      <td className="py-2 px-2 text-xs whitespace-pre-wrap">{r.notes?.trim() || '—'}</td>
                      <td className="py-2 px-2 text-xs text-on-surface-variant">{r.createdBy ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
