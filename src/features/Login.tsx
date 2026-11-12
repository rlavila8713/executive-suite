import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Modal } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { mapMutationError } from '../lib/mutationErrors';
import { isStoreLicenseActive } from '../lib/storeLicense';
import { api } from '../api/client';
import type { LicenseInfo } from '../types';
import { LicenseActivationStep } from './onboarding/LicenseActivationStep';

type WizardPhase = 'license' | 'account';
type AccountView = 'login' | 'recover';

export function LoginGate() {
  const { t } = useI18n();
  const { status, login, bootstrap, loading: authLoading } = useAuth();
  const needsBootstrapFlow = status?.needsBootstrap ?? false;
  const hasRecoveryCode = status?.hasRecoveryCode ?? false;
  const [accountView, setAccountView] = useState<AccountView>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverOk, setRecoverOk] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseLoadError, setLicenseLoadError] = useState<string | null>(null);
  const [bootstrapRecoveryCode, setBootstrapRecoveryCode] = useState<string | null>(null);

  const loadLicense = useCallback(async () => {
    setLicenseLoading(true);
    setLicenseLoadError(null);
    try {
      setLicenseInfo(await api.getLicense());
    } catch (e) {
      setLicenseLoadError(mapMutationError(e, t));
    } finally {
      setLicenseLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadLicense();
  }, [loadLicense]);

  const licenseOk = licenseInfo != null && isStoreLicenseActive(licenseInfo);

  const phase: WizardPhase = licenseOk ? 'account' : 'license';

  const wizardSteps = useMemo(() => {
    const steps: WizardPhase[] = [];
    if (licenseInfo && !isStoreLicenseActive(licenseInfo)) steps.push('license');
    steps.push('account');
    return steps;
  }, [licenseInfo]);

  const stepNumber = wizardSteps.indexOf(phase) + 1;
  const stepTotal = wizardSteps.length;

  const storeName = status?.storeName?.trim() || t('auth.defaultStoreName');

  async function submitAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsBootstrapFlow) {
        const code = await bootstrap(username, password);
        setBootstrapRecoveryCode(code);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function submitRecover(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setRecoverOk(false);
    try {
      await api.recoverPassword(username.trim(), recoveryCodeInput.trim(), newPassword);
      setRecoverOk(true);
      setAccountView('login');
      setPassword('');
      setNewPassword('');
      setRecoveryCodeInput('');
    } catch (err) {
      setError(mapMutationError(err, t));
    } finally {
      setBusy(false);
    }
  }

  const loading = authLoading || licenseLoading;

  const accountSubtitle =
    accountView === 'recover'
      ? t('auth.recoverSubtitle')
      : needsBootstrapFlow
        ? t('auth.bootstrapSubtitle')
        : t('auth.loginSubtitle');

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">{storeName}</h1>
          {stepTotal > 1 ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary mt-2">
              {t('auth.wizardProgress', { step: stepNumber, total: stepTotal })}
              {' · '}
              {phase === 'license'
                ? t('auth.wizardLicenseStep')
                : accountView === 'recover'
                  ? t('auth.recoverTitle')
                  : needsBootstrapFlow
                    ? t('auth.wizardAdminStep')
                    : t('auth.wizardLoginStep')}
            </p>
          ) : null}
          <p className="text-sm text-on-surface-variant mt-1">
            {phase === 'license' ? t('auth.licenseGateSubtitle') : accountSubtitle}
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-on-surface-variant">{t('settings.billingLoading')}</p>
        ) : licenseLoadError ? (
          <div className="space-y-3">
            <p className="text-sm text-error">{licenseLoadError}</p>
            <Button variant="secondary" onClick={() => void loadLicense()}>
              {t('auth.retryLoadLicense')}
            </Button>
          </div>
        ) : phase === 'license' && licenseInfo ? (
          <LicenseActivationStep licenseInfo={licenseInfo} onActivated={loadLicense} />
        ) : accountView === 'recover' ? (
          <form className="space-y-3" onSubmit={submitRecover}>
            {!hasRecoveryCode ? (
              <p className="text-sm text-on-surface-variant">{t('auth.recoverNotConfigured')}</p>
            ) : null}
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
              <span className="text-sm font-medium text-on-surface">{t('auth.recoveryCode')}</span>
              <Input
                value={recoveryCodeInput}
                onChange={(e) => setRecoveryCodeInput(e.target.value)}
                autoComplete="off"
                placeholder="XXXX-XXXX-XXXX"
                required
                disabled={!hasRecoveryCode}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-on-surface">{t('auth.newPassword')}</span>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={!hasRecoveryCode}
              />
            </label>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            {recoverOk ? <p className="text-sm text-green-700">{t('auth.recoverOk')}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !hasRecoveryCode}>
              {t('auth.recoverAction')}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setAccountView('login')}>
              {t('auth.backToLogin')}
            </Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={submitAccount}>
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
            {!needsBootstrapFlow ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setError(null);
                  setAccountView('recover');
                }}
              >
                {t('auth.forgotPassword')}
              </Button>
            ) : null}
          </form>
        )}
      </Card>

      <Modal
        isOpen={bootstrapRecoveryCode != null}
        onClose={() => setBootstrapRecoveryCode(null)}
        title={t('auth.recoveryCodeTitle')}
      >
        <p className="text-sm text-on-surface-variant mb-4">{t('auth.recoveryCodeBootstrapBody')}</p>
        <p className="text-lg font-mono font-bold tracking-widest text-center py-4 bg-surface-container-low rounded-xl">
          {bootstrapRecoveryCode}
        </p>
        <Button className="w-full mt-4" onClick={() => setBootstrapRecoveryCode(null)}>
          {t('auth.recoveryCodeSaved')}
        </Button>
      </Modal>
    </div>
  );
}
