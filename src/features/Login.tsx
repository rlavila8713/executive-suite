import { useState } from 'react';
import { Button, Card, Input } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { mapMutationError } from '../lib/mutationErrors';

export function LoginGate() {
  const { t } = useI18n();
  const { status, login, bootstrap } = useAuth();
  const needsBootstrapFlow = status?.needsBootstrap ?? false;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeName = status?.storeName?.trim() || t('auth.defaultStoreName');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsBootstrapFlow) {
        await bootstrap(username, password);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">{storeName}</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {needsBootstrapFlow ? t('auth.bootstrapSubtitle') : t('auth.loginSubtitle')}
          </p>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-on-surface">{t('auth.username')}</span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-on-surface">
              {needsBootstrapFlow ? t('auth.password') : t('auth.passwordOrPin')}
            </span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={needsBootstrapFlow ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {needsBootstrapFlow ? t('auth.bootstrapAction') : t('auth.loginAction')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
