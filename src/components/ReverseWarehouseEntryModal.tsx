import { useEffect, useState } from 'react';
import { Button, Input, Modal } from './ui';
import type { WarehouseMovement } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { mapMutationError } from '../lib/mutationErrors';
import { api } from '../api/client';

interface ReverseWarehouseEntryModalProps {
  movement: WarehouseMovement | null;
  onClose: () => void;
  onReversed: () => void;
}

export function ReverseWarehouseEntryModal({ movement, onClose, onReversed }: ReverseWarehouseEntryModalProps) {
  const { t } = useI18n();
  const maxQty = movement?.reversibleQuantity ?? movement?.quantityDelta ?? 0;
  const [quantity, setQuantity] = useState(String(maxQty));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (movement) {
      setQuantity(String(movement.reversibleQuantity ?? movement.quantityDelta));
      setReason('');
      setError(null);
    }
  }, [movement]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movement) return;
    setError(null);
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t('stockMovements.reversalInvalidQty'));
      return;
    }
    if (qty > maxQty) {
      setError(t('stockMovements.reversalExceeds', { max: maxQty }));
      return;
    }
    if (reason.trim().length < 3) {
      setError(t('stockMovements.reversalReasonRequired'));
      return;
    }
    setBusy(true);
    try {
      await api.reverseWarehouseEntry(movement.id, { quantity: qty, reason: reason.trim() });
      onReversed();
      onClose();
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={movement !== null}
      onClose={onClose}
      title={t('stockMovements.reversalTitle')}
    >
      {movement ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <p className="text-sm text-on-surface-variant">{t('stockMovements.reversalHelp')}</p>
          <div>
            <label className="text-[10px] font-bold uppercase text-on-surface-variant block mb-1">
              {t('stockMovements.reversalQtyLabel')}
            </label>
            <Input
              type="number"
              min={1}
              max={maxQty}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
            <p className="text-xs text-on-surface-variant mt-1">
              {t('stockMovements.reversalQtyHint', { max: maxQty })}
            </p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-on-surface-variant block mb-1">
              {t('stockMovements.reversalReasonLabel')}
            </label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('stockMovements.reversalReasonPlaceholder')}
              required
              minLength={3}
            />
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="secondary" disabled={busy || maxQty <= 0}>
              {t('stockMovements.reversalConfirm')}
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
