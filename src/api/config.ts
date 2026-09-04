const STORAGE_KEY = 'executive-suite.apiBaseUrl';

/** Default API base URL (no trailing slash). */
export const DEFAULT_API_BASE_URL = 'http://localhost:4000';

export function getApiBaseUrl(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored?.trim()) return stored.replace(/\/$/, '');
  } catch {
    // ignore
  }
  return DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url: string): void {
  const trimmed = url.trim().replace(/\/$/, '');
  localStorage.setItem(STORAGE_KEY, trimmed);
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
