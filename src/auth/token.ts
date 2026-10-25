const STORAGE_KEY = 'executive-suite.authToken';

export function getAuthToken(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v?.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (!token) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}
