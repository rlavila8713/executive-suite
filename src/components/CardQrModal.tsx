import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Modal, Button } from './ui';
import { useI18n } from '../i18n/I18nContext';

export type CardQrModalProps = {
  open: boolean;
  onClose: () => void;
  /** Text encoded into the QR (card number, payment URL, etc.). */
  payload: string;
};

export function CardQrModal({ open, onClose, payload }: CardQrModalProps) {
  const { t } = useI18n();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      setDataUrl(null);
      setFailed(false);
      return;
    }
    const text = payload.trim();
    if (!text) {
      setDataUrl(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);
    QRCode.toDataURL(text, {
      width: 260,
      margin: 2,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, payload]);

  const trimmed = payload.trim();

  return (
    <Modal isOpen={open} onClose={onClose} title={t('pos.cardQrTitle')}>
      <div className="flex flex-col items-center gap-4">
        {trimmed ? (
          dataUrl ? (
            <img
              src={dataUrl}
              alt=""
              className="w-[min(260px,85vw)] h-[min(260px,85vw)] max-w-full rounded-lg border border-black/10 dark:border-white/10"
            />
          ) : failed ? (
            <p className="text-sm text-error text-center">{t('pos.cardQrError')}</p>
          ) : (
            <p className="text-sm text-on-surface-variant">{t('pos.cardQrLoading')}</p>
          )
        ) : (
          <p className="text-sm text-center text-on-surface-variant">{t('pos.cardQrEmpty')}</p>
        )}
        {trimmed && dataUrl ? (
          <p className="text-xs text-center text-on-surface-variant max-w-xs">{t('pos.cardQrHint')}</p>
        ) : null}
        <Button type="button" className="w-full" onClick={onClose}>
          {t('pos.done')}
        </Button>
      </div>
    </Modal>
  );
}
