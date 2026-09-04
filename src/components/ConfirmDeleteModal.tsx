import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from './ui';
import { useI18n } from '../i18n/I18nContext';
import { mapMutationError } from '../lib/mutationErrors';

type ConfirmDeleteModalProps<T extends { id: string }> = {
  target: T | null;
  title: string;
  renderMessage: (item: T) => string;
  onClose: () => void;
  onDelete: (id: string) => void | Promise<void>;
  mapError?: (err: unknown) => string;
  confirmLabel?: string;
  busyLabel?: string;
  confirmVariant?: 'danger' | 'primary';
};

export function ConfirmDeleteModal<T extends { id: string }>({
  target,
  title,
  renderMessage,
  onClose,
  onDelete,
  mapError,
  confirmLabel,
  busyLabel,
  confirmVariant = 'danger',
}: ConfirmDeleteModalProps<T>) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (target) setError(null);
  }, [target]);

  const handleClose = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!target || busy || inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onDelete(target.id);
      onClose();
    } catch (err) {
      setError(mapError?.(err) ?? mapMutationError(err, t));
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={!!target} onClose={handleClose} title={title}>
      <p className="text-sm text-on-surface-variant mb-4">{target ? renderMessage(target) : ''}</p>
      {error ? <p className="text-sm text-error font-medium mb-4">{error}</p> : null}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" className="flex-1" onClick={handleClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button type="button" variant={confirmVariant} className="flex-1" onClick={() => void handleConfirm()} disabled={busy}>
          {busy ? (busyLabel ?? t('common.deleting')) : (confirmLabel ?? t('common.delete'))}
        </Button>
      </div>
    </Modal>
  );
}
