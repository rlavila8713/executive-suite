import { useState } from 'react';
import type { LicenseInfo, LicensePlanId } from '../../types';
import { api } from '../../api/client';
import { Button, Input } from '../../components/ui';
import { formatAppDate } from '../../lib/dateFormat';
import { mapMutationError } from '../../lib/mutationErrors';
import { cn } from '../../lib/utils';
import { useI18n } from '../../i18n/I18nContext';

type Props = {
  licenseInfo: LicenseInfo;
  onActivated: () => void | Promise<void>;
};

export function LicenseActivationStep({ licenseInfo, onActivated }: Props) {
  const { t, locale } = useI18n();
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<LicensePlanId | null>(null);
  const [requestCode, setRequestCode] = useState<string | null>(null);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');

  const deviceBlocked = licenseInfo.status === 'device_mismatch';

  const handleRequestLicense = async (planId: LicensePlanId) => {
    setBillingMsg(null);
    setBillingBusy(true);
    try {
      const result = await api.requestLicense(planId);
      setSelectedPlanId(planId);
      setRequestCode(result.requestCode);
      setBillingMsg({ type: 'ok', text: t('settings.billingRequestOk') });
    } catch (e) {
      setBillingMsg({
        type: 'err',
        text: e instanceof Error ? e.message : t('settings.billingRequestErr'),
      });
    } finally {
      setBillingBusy(false);
    }
  };

  const handleActivateLicense = async () => {
    const key = licenseKeyInput.trim();
    if (!key) return;
    setBillingMsg(null);
    setBillingBusy(true);
    try {
      await api.activateLicense(key);
      setLicenseKeyInput('');
      setRequestCode(null);
      setSelectedPlanId(null);
      setBillingMsg({ type: 'ok', text: t('settings.billingActivateOk') });
      await onActivated();
    } catch (e) {
      setBillingMsg({ type: 'err', text: mapMutationError(e, t) });
    } finally {
      setBillingBusy(false);
    }
  };

  const copyRequestCode = async () => {
    if (!requestCode) return;
    try {
      await navigator.clipboard.writeText(requestCode);
      setBillingMsg({ type: 'ok', text: t('settings.billingCopied') });
    } catch {
      setBillingMsg({ type: 'err', text: t('settings.billingCopyFailed') });
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface-container-low rounded-xl space-y-2">
        <p className="text-sm font-bold text-primary">
          {licenseInfo.status === 'trial' && t('settings.billingStatusTrial', { days: licenseInfo.trialDaysRemaining })}
          {licenseInfo.status === 'active' && t('settings.billingStatusActive')}
          {licenseInfo.status === 'expired' && t('settings.billingStatusExpired')}
          {licenseInfo.status === 'device_mismatch' && t('settings.billingStatusDeviceMismatch')}
        </p>
        {licenseInfo.paidUntil ? (
          <p className="text-xs text-on-surface-variant">
            {t('settings.billingPaidUntil', {
              date: formatAppDate(licenseInfo.paidUntil, locale, 'medium'),
            })}
          </p>
        ) : (
          <p className="text-xs text-on-surface-variant">
            {t('settings.billingTrialEnds', {
              date: formatAppDate(licenseInfo.trialEndsAt, locale, 'medium'),
            })}
          </p>
        )}
      </div>

      {billingMsg ? (
        <p
          className={cn(
            'text-sm rounded-lg px-3 py-2',
            billingMsg.type === 'ok'
              ? 'bg-tertiary-container/15 text-on-tertiary-container'
              : 'bg-error-container text-on-error-container',
          )}
        >
          {billingMsg.text}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {licenseInfo.plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              'p-4 rounded-xl border transition-all',
              selectedPlanId === plan.id ? 'border-primary bg-primary/5' : 'border-black/10 bg-surface-container-low',
            )}
          >
            <p className="text-base font-black text-primary">{plan.name}</p>
            <p className="text-lg font-extrabold text-primary mt-1">
              {plan.price.toLocaleString()} <span className="text-xs font-bold">CUP</span>
            </p>
            <p className="text-xs text-on-surface-variant mt-1">{t('settings.billingPlanDays', { days: plan.days })}</p>
            <Button
              className="w-full mt-3"
              variant={selectedPlanId === plan.id ? 'secondary' : 'primary'}
              disabled={billingBusy || deviceBlocked}
              onClick={() => void handleRequestLicense(plan.id)}
            >
              {t('settings.billingRequestCode')}
            </Button>
          </div>
        ))}
      </div>

      {requestCode ? (
        <div className="p-4 rounded-xl bg-surface-container-low space-y-3">
          <p className="text-sm font-bold text-primary">{t('settings.billingRequestTitle')}</p>
          <p className="text-xs text-on-surface-variant">{t('settings.billingRequestHelp')}</p>
          <textarea
            readOnly
            rows={4}
            value={requestCode}
            className="w-full font-mono text-xs rounded-lg border border-black/10 bg-white dark:bg-slate-900 p-3 resize-none"
          />
          <Button variant="secondary" onClick={() => void copyRequestCode()}>
            {t('settings.billingCopyCode')}
          </Button>
        </div>
      ) : null}

      <div className="p-4 rounded-xl border border-black/10 space-y-3">
        <p className="text-sm font-bold text-primary">{t('settings.billingActivateTitle')}</p>
        <p className="text-xs text-on-surface-variant">{t('settings.billingActivateHelp')}</p>
        <Input
          value={licenseKeyInput}
          onChange={(e) => setLicenseKeyInput(e.target.value)}
          placeholder={t('settings.billingLicensePlaceholder')}
          className="font-mono text-xs"
          spellCheck={false}
        />
        <Button
          className="w-full"
          disabled={billingBusy || !licenseKeyInput.trim() || deviceBlocked}
          onClick={() => void handleActivateLicense()}
        >
          {t('settings.billingActivate')}
        </Button>
      </div>

      <p className="text-xs text-on-surface-variant">{t('settings.billingPaymentNote')}</p>
    </div>
  );
}
