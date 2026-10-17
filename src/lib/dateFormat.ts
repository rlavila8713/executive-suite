/** BCP 47 tag for Intl formatters (app locales: es | en). */
export function intlLocale(locale: string): string {
  return locale === 'es' ? 'es' : 'en-US';
}

export type AppDateStyle = 'short' | 'medium' | 'long';

export type AppDateInput = number | string | Date;

function toDate(value: AppDateInput): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

/** Date + time with 12-hour clock and AM/PM (or a. m. / p. m. in Spanish). */
export function createAppDateTimeFormatter(
  locale: string,
  dateStyle: AppDateStyle = 'short',
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle,
    timeStyle: 'short',
    hour12: true,
  });
}

export function formatAppDateTime(
  value: AppDateInput,
  locale: string,
  dateStyle: AppDateStyle = 'short',
): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return createAppDateTimeFormatter(locale, dateStyle).format(d);
}

/** Calendar date without time of day. */
export function formatAppDate(
  value: AppDateInput,
  locale: string,
  dateStyle: AppDateStyle = 'medium',
): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle }).format(d);
}

/** Time only with AM/PM. */
export function formatAppTime(value: AppDateInput, locale: string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}
