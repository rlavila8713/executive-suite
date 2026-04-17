import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { AppLocale } from '../types';
import { dictionaries } from './dictionaries';

type DictNode = string | { [k: string]: DictNode };

function lookup(table: DictNode | undefined, path: string): string | undefined {
  const parts = path.split('.');
  let cur: DictNode | undefined = table;
  for (const p of parts) {
    if (cur === undefined || typeof cur === 'string') return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

type I18nValue = {
  locale: AppLocale;
  t: TranslateFn;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale === 'es' ? 'es' : 'en';
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const primary = dictionaries[locale];
    const fallbackEs = dictionaries.es;
    const fallbackEn = dictionaries.en;
    const t: TranslateFn = (key, vars) => {
      let s =
        lookup(primary, key) ??
        lookup(fallbackEs, key) ??
        lookup(fallbackEn, key) ??
        key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    };
    return { locale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
