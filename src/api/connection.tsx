import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

type ConnectionBannerProps = {
  connected: boolean;
  checking: boolean;
  onRetry: () => void;
};

export function ConnectionBanner({ connected, checking, onRetry }: ConnectionBannerProps) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (connected) setDismissed(false);
  }, [connected]);

  if (connected || dismissed) return null;

  return (
    <div
      role="alert"
      className="no-print shrink-0 bg-error-container text-on-error-container px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-black/10"
    >
      <p className="text-sm font-medium">{t('app.offlineBanner')}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className="text-sm font-bold underline underline-offset-2 disabled:opacity-50"
        >
          {checking ? t('app.offlineChecking') : t('app.offlineRetry')}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-sm font-bold opacity-70 hover:opacity-100"
        >
          {t('app.offlineDismiss')}
        </button>
      </div>
    </div>
  );
}

export function useApiPolling(refresh: () => Promise<void>, enabled: boolean, intervalMs = 5000) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, refresh]);
}

export function useApiConnection(checkHealth: () => Promise<boolean>) {
  const [connected, setConnected] = useState(true);
  const [checking, setChecking] = useState(false);

  const verify = useCallback(async () => {
    setChecking(true);
    try {
      const ok = await checkHealth();
      setConnected(ok);
      return ok;
    } finally {
      setChecking(false);
    }
  }, [checkHealth]);

  useEffect(() => {
    void verify();
    const id = setInterval(() => void verify(), 15000);
    return () => clearInterval(id);
  }, [verify]);

  return { connected, checking, verify };
}
