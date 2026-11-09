/** Web client version baked in at build time (package.json). */
export function getWebAppVersion(): string {
  const v = import.meta.env.VITE_APP_VERSION;
  return typeof v === 'string' && v.trim() ? v.trim() : 'dev';
}
