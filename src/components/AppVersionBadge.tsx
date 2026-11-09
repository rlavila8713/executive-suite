import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { getWebAppVersion } from '../lib/appVersion';
import { cn } from '../lib/utils';

export function AppVersionBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  const webVersion = getWebAppVersion();
  const [apiVersion, setApiVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .health()
      .then((h) => {
        if (!cancelled) setApiVersion(h.version);
      })
      .catch(() => {
        if (!cancelled) setApiVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mismatch = apiVersion != null && apiVersion !== webVersion;
  const title = t('app.versionTooltip', {
    web: webVersion,
    api: apiVersion ?? '—',
  });

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider tabular-nums max-w-[40vw] sm:max-w-none',
        mismatch
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
          : 'border-slate-200/80 bg-slate-100/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400',
        className,
      )}
    >
      <span className="hidden sm:inline text-slate-500 dark:text-slate-500 font-semibold normal-case tracking-normal mr-1">
        {t('app.versionWeb')}
      </span>
      v{webVersion}
      {apiVersion ? (
        <>
          <span className="mx-1 opacity-40 hidden md:inline" aria-hidden>
            ·
          </span>
          <span className="hidden md:inline text-slate-500 dark:text-slate-500 font-semibold normal-case tracking-normal mr-1">
            {t('app.versionApi')}
          </span>
          <span className="hidden md:inline">v{apiVersion}</span>
        </>
      ) : null}
    </span>
  );
}
