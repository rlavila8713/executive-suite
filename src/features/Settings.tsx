import { useEffect, useRef, useState } from 'react';
import {
  Store,
  User,
  Bell,
  Shield,
  Globe,
  CreditCard,
  ChevronRight,
  HardDrive,
  Upload,
  Download,
  Monitor,
  Smartphone,
  HelpCircle,
  Wallet,
  QrCode,
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { PLACEHOLDER_PRODUCT_IMAGE } from '../constants';
import { readStoreLogoFileAsDataUrl } from '../lib/images';
import {
  AppSettings,
  type AppLocale,
  type ConnectedDevice,
  type LicenseInfo,
  type LicensePlanId,
  type LicenseRequestPayload,
} from '../types';
import { mapMutationError } from '../lib/mutationErrors';
import { cn } from '../lib/utils';
import { useI18n } from '../i18n/I18nContext';
import {
  buildBackupSnapshot,
  downloadBackupFile,
  readBackupFromFile,
  restoreBackupSnapshot,
  type ExecutiveSuiteBackup,
} from '../lib/backup';
import { api } from '../api/client';
import { getApiBaseUrl, setApiBaseUrl, DEFAULT_API_BASE_URL } from '../api/config';
import type { HealthResponse } from '../api/client';
import { CardQrModal } from '../components/CardQrModal';
import { buildServerConnectQrPayload, isValidTransferPhone, normalizeTransferPhone } from '../lib/paymentQr';

type Section = 'general' | 'payments' | 'profile' | 'notifications' | 'security' | 'regional' | 'billing' | 'data' | 'server';

interface SettingsProps {
  settings: AppSettings;
  licenseInfo: LicenseInfo | null;
  onUpdate: (patch: Partial<Omit<AppSettings, 'id'>>) => void | Promise<void>;
  onRequestLicense: (planId: LicensePlanId) => Promise<{ requestCode: string; payload: LicenseRequestPayload }>;
  onActivateLicense: (licenseKey: string) => Promise<unknown>;
  onFactoryReset: () => Promise<void>;
  apiConnected: boolean;
  apiChecking: boolean;
  onRetryApiConnection: () => Promise<boolean>;
  onDataChanged?: () => void | Promise<void>;
  initialSection?: Section;
}

export function Settings({
  settings,
  licenseInfo,
  onUpdate,
  onRequestLicense,
  onActivateLicense,
  onFactoryReset,
  apiConnected,
  apiChecking,
  onRetryApiConnection,
  onDataChanged,
  initialSection,
}: SettingsProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<Section>(initialSection ?? 'general');
  const [backupBusy, setBackupBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<LicensePlanId | null>(null);
  const [requestCode, setRequestCode] = useState<string | null>(null);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [factoryResetOpen, setFactoryResetOpen] = useState(false);
  const [factoryResetBusy, setFactoryResetBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ExecutiveSuiteBackup | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [apiUrlDraft, setApiUrlDraft] = useState(getApiBaseUrl());
  const [healthInfo, setHealthInfo] = useState<HealthResponse | null>(null);
  const [serverMessage, setServerMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [revokeBusyId, setRevokeBusyId] = useState<string | null>(null);
  const [storeLogoDraft, setStoreLogoDraft] = useState<string | null>(null);
  const [operatorDrafts, setOperatorDrafts] = useState<Record<string, string>>({});
  const [operatorBusyId, setOperatorBusyId] = useState<string | null>(null);
  const [serverQrOpen, setServerQrOpen] = useState(false);
  const [serverQrUrl, setServerQrUrl] = useState('');
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    storeName: settings.storeName,
    branch: settings.branch,
    currency: settings.currency,
    taxRate: settings.taxRate,
    cardQrPayload: settings.cardQrPayload,
    transferBank: settings.transferBank,
    transferAccountHolder: settings.transferAccountHolder,
    transferAccountNumber: settings.transferAccountNumber,
    transferPhoneNumber: settings.transferPhoneNumber,
    transferQrExtra: settings.transferQrExtra,
    managerName: settings.managerName,
    managerTitle: settings.managerTitle,
  });

  const baselineRef = useRef({
    storeName: settings.storeName,
    branch: settings.branch,
    currency: settings.currency,
    taxRate: settings.taxRate,
    cardQrPayload: settings.cardQrPayload,
    transferBank: settings.transferBank,
    transferAccountHolder: settings.transferAccountHolder,
    transferAccountNumber: settings.transferAccountNumber,
    transferPhoneNumber: settings.transferPhoneNumber,
    transferQrExtra: settings.transferQrExtra,
    managerName: settings.managerName,
    managerTitle: settings.managerTitle,
  });

  useEffect(() => {
    setDraft((prev) => {
      const b = baselineRef.current;
      const dirty =
        prev.storeName !== b.storeName ||
        prev.branch !== b.branch ||
        prev.currency !== b.currency ||
        prev.taxRate !== b.taxRate ||
        prev.cardQrPayload !== b.cardQrPayload ||
        prev.transferBank !== b.transferBank ||
        prev.transferAccountHolder !== b.transferAccountHolder ||
        prev.transferAccountNumber !== b.transferAccountNumber ||
        prev.transferPhoneNumber !== b.transferPhoneNumber ||
        prev.transferQrExtra !== b.transferQrExtra ||
        prev.managerName !== b.managerName ||
        prev.managerTitle !== b.managerTitle;
      const matchesIncoming =
        prev.storeName === settings.storeName &&
        prev.branch === settings.branch &&
        prev.currency === settings.currency &&
        prev.taxRate === settings.taxRate &&
        prev.cardQrPayload === settings.cardQrPayload &&
        prev.transferBank === settings.transferBank &&
        prev.transferAccountHolder === settings.transferAccountHolder &&
        prev.transferAccountNumber === settings.transferAccountNumber &&
        prev.transferPhoneNumber === settings.transferPhoneNumber &&
        prev.transferQrExtra === settings.transferQrExtra &&
        prev.managerName === settings.managerName &&
        prev.managerTitle === settings.managerTitle;
      if (dirty && !matchesIncoming) return prev;
      baselineRef.current = {
        storeName: settings.storeName,
        branch: settings.branch,
        currency: settings.currency,
        taxRate: settings.taxRate,
        cardQrPayload: settings.cardQrPayload,
        transferBank: settings.transferBank,
        transferAccountHolder: settings.transferAccountHolder,
        transferAccountNumber: settings.transferAccountNumber,
        transferPhoneNumber: settings.transferPhoneNumber,
        transferQrExtra: settings.transferQrExtra,
        managerName: settings.managerName,
        managerTitle: settings.managerTitle,
      };
      return {
        storeName: settings.storeName,
        branch: settings.branch,
        currency: settings.currency,
        taxRate: settings.taxRate,
        cardQrPayload: settings.cardQrPayload,
        transferBank: settings.transferBank,
        transferAccountHolder: settings.transferAccountHolder,
        transferAccountNumber: settings.transferAccountNumber,
        transferPhoneNumber: settings.transferPhoneNumber,
        transferQrExtra: settings.transferQrExtra,
        managerName: settings.managerName,
        managerTitle: settings.managerTitle,
      };
    });
  }, [settings]);

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  const handleRequestLicense = async (planId: LicensePlanId) => {
    setBillingMsg(null);
    setBillingBusy(true);
    try {
      const result = await onRequestLicense(planId);
      setSelectedPlanId(planId);
      setRequestCode(result.requestCode);
      setBillingMsg({ type: 'ok', text: t('settings.billingRequestOk') });
    } catch (e) {
      setBillingMsg({ type: 'err', text: e instanceof Error ? e.message : t('settings.billingRequestErr') });
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
      await onActivateLicense(key);
      setLicenseKeyInput('');
      setRequestCode(null);
      setSelectedPlanId(null);
      setShowChangePlan(false);
      setBillingMsg({ type: 'ok', text: t('settings.billingActivateOk') });
      await onDataChanged?.();
    } catch (e) {
      setBillingMsg({ type: 'err', text: e instanceof Error ? e.message : t('settings.billingActivateErr') });
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

  const [showChangePlan, setShowChangePlan] = useState(false);

  const confirmFactoryReset = async () => {
    setFactoryResetBusy(true);
    try {
      await onFactoryReset();
      setFactoryResetOpen(false);
      setBackupMessage({ type: 'ok', text: t('settings.factoryResetOk') });
      await onDataChanged?.();
    } catch (e) {
      setBackupMessage({ type: 'err', text: e instanceof Error ? e.message : t('settings.factoryResetErr') });
    } finally {
      setFactoryResetBusy(false);
    }
  };

  const activePlan = licenseInfo?.planId
    ? licenseInfo.plans.find((p) => p.id === licenseInfo.planId) ?? null
    : null;

  const loadHealth = async () => {
    try {
      const health = await api.health();
      setHealthInfo(health);
      setServerMessage({ type: 'ok', text: t('settings.serverConnected') });
    } catch {
      setHealthInfo(null);
      setServerMessage({ type: 'err', text: t('settings.serverUnreachable') });
    }
  };

  const loadConnectedDevices = async () => {
    if (!apiConnected) {
      setConnectedDevices([]);
      return;
    }
    setDevicesLoading(true);
    try {
      const devices = await api.getConnectedDevices();
      setConnectedDevices(devices);
      setOperatorDrafts((prev) => {
        const next = { ...prev };
        for (const device of devices) {
          if (!(device.deviceId in next)) next[device.deviceId] = device.operatorName;
        }
        return next;
      });
    } catch {
      setConnectedDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleRevokeDevice = async (device: ConnectedDevice) => {
    if (!window.confirm(t('settings.serverDeviceDisconnectConfirm'))) return;
    setRevokeBusyId(device.deviceId);
    setServerMessage(null);
    try {
      await api.revokeConnectedDevice(device.deviceId);
      setServerMessage({ type: 'ok', text: t('settings.serverDeviceDisconnectOk') });
      await loadConnectedDevices();
    } catch (e) {
      setServerMessage({ type: 'err', text: mapMutationError(e, t) });
    } finally {
      setRevokeBusyId(null);
    }
  };

  const handleSaveOperator = async (device: ConnectedDevice) => {
    const name = (operatorDrafts[device.deviceId] ?? device.operatorName).trim();
    setOperatorBusyId(device.deviceId);
    setServerMessage(null);
    try {
      const updated = await api.assignDeviceOperator(device.deviceId, name);
      setConnectedDevices((prev) => prev.map((d) => (d.deviceId === updated.deviceId ? updated : d)));
      setOperatorDrafts((prev) => ({ ...prev, [device.deviceId]: updated.operatorName }));
      setServerMessage({ type: 'ok', text: t('settings.serverOperatorSaved') });
    } catch (e) {
      setServerMessage({ type: 'err', text: mapMutationError(e, t) });
    } finally {
      setOperatorBusyId(null);
    }
  };

  const openServerQr = () => {
    const lan = healthInfo?.lanUrls?.[0];
    const url = (lan || apiUrlDraft.trim() || getApiBaseUrl()).replace(/\/$/, '');
    setServerQrUrl(url);
    setServerQrOpen(true);
  };

  const formatDeviceTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

  const formatSessionDuration = (firstSeenAt: number, lastSeenAt: number) => {
    const ms = Math.max(0, lastSeenAt - firstSeenAt);
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    if (hours < 24) return rem > 0 ? `${hours} h ${rem} min` : `${hours} h`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days} d ${remHours} h` : `${days} d`;
  };

  const deviceKindLabel = (kind: ConnectedDevice['clientKind']) => {
    if (kind === 'mobile') return t('settings.serverDeviceMobile');
    if (kind === 'web') return t('settings.serverDeviceWeb');
    return t('settings.serverDeviceUnknown');
  };

  const deviceKindIcon = (kind: ConnectedDevice['clientKind']) => {
    if (kind === 'mobile') return <Smartphone size={16} className="shrink-0" />;
    if (kind === 'web') return <Monitor size={16} className="shrink-0" />;
    return <HelpCircle size={16} className="shrink-0" />;
  };

  const shortDeviceId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

  useEffect(() => {
    if (section === 'server') {
      void loadHealth();
      void loadConnectedDevices();
    }
  }, [section, apiConnected]);

  useEffect(() => {
    if (section !== 'server' || !apiConnected) return;
    const id = window.setInterval(() => void loadConnectedDevices(), 10_000);
    return () => window.clearInterval(id);
  }, [section, apiConnected]);

  const saveApiUrl = () => {
    setApiBaseUrl(apiUrlDraft.trim() || DEFAULT_API_BASE_URL);
    setServerMessage({ type: 'ok', text: t('settings.serverUrlSaved') });
    void onRetryApiConnection();
  };

  const saveStore = async () => {
    const patch: Partial<Omit<AppSettings, 'id'>> = {
      storeName: draft.storeName,
      branch: draft.branch,
      currency: draft.currency,
    };
    if (storeLogoDraft !== null) {
      patch.storeLogo = storeLogoDraft;
    }
    await onUpdate(patch);
    setStoreLogoDraft(null);
  };

  const savePayments = async () => {
    const account = draft.transferAccountNumber.trim();
    const phone = normalizeTransferPhone(draft.transferPhoneNumber);
    if (account && !isValidTransferPhone(phone)) {
      setPaymentsError(t('settings.transferPhoneInvalid'));
      return;
    }
    if (phone && !account) {
      setPaymentsError(t('settings.transferPhoneNeedsAccount'));
      return;
    }
    setPaymentsError(null);
    await onUpdate({
      taxRate: draft.taxRate,
      cardQrPayload: draft.cardQrPayload,
      transferBank: draft.transferBank,
      transferAccountHolder: draft.transferAccountHolder,
      transferAccountNumber: account,
      transferPhoneNumber: phone,
      transferQrExtra: draft.transferQrExtra,
    });
  };

  const saveProfile = async () => {
    await onUpdate({
      managerName: draft.managerName,
      managerTitle: draft.managerTitle,
    });
  };

  const handleExportBackup = async () => {
    setBackupMessage(null);
    setBackupBusy(true);
    try {
      const snap = await buildBackupSnapshot();
      downloadBackupFile(snap);
      setBackupMessage({ type: 'ok', text: t('settings.backupOkDownload') });
    } catch (e) {
      setBackupMessage({ type: 'err', text: e instanceof Error ? e.message : t('settings.exportFailed') });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupMessage(null);
    setBackupBusy(true);
    try {
      const data = await readBackupFromFile(file);
      setPendingBackup(data);
      setPendingFileName(file.name);
      setImportConfirmOpen(true);
    } catch (err) {
      setBackupMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('settings.readFileFailed'),
      });
    } finally {
      setBackupBusy(false);
    }
  };

  const confirmRestoreBackup = async () => {
    if (!pendingBackup) return;
    setBackupBusy(true);
    try {
      await restoreBackupSnapshot(pendingBackup);
      await onDataChanged?.();
      setImportConfirmOpen(false);
      setPendingBackup(null);
      setPendingFileName('');
      setBackupMessage({
        type: 'ok',
        text: t('settings.backupOkRestored'),
      });
    } catch (e) {
      setBackupMessage({ type: 'err', text: e instanceof Error ? e.message : t('settings.restoreFailed') });
    } finally {
      setBackupBusy(false);
    }
  };

  const nav = [
    { id: 'general' as const, label: t('settings.navGeneral'), icon: Store },
    { id: 'payments' as const, label: t('settings.navPayments'), icon: Wallet },
    { id: 'profile' as const, label: t('settings.navProfile'), icon: User },
    { id: 'notifications' as const, label: t('settings.navNotifications'), icon: Bell },
    { id: 'security' as const, label: t('settings.navSecurity'), icon: Shield },
    { id: 'regional' as const, label: t('settings.navRegional'), icon: Globe },
    { id: 'billing' as const, label: t('settings.navBilling'), icon: CreditCard },
    { id: 'data' as const, label: t('settings.navData'), icon: HardDrive },
    { id: 'server' as const, label: t('settings.navServer'), icon: Globe },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 sm:mb-10">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">{t('settings.pageTitle')}</h2>
        <p className="text-on-surface-variant text-sm font-medium">{t('settings.pageSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'w-full flex items-center justify-between p-4 rounded-xl transition-all',
                section === item.id
                  ? 'bg-white dark:bg-slate-800 shadow-md text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-low',
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon size={18} />
                <span className="text-sm font-bold">{item.label}</span>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {section === 'general' && (
            <Card title={t('settings.storeConfig')}>
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t('settings.storeName')}
                    </label>
                    <Input
                      value={draft.storeName}
                      onChange={(e) => setDraft((d) => ({ ...d, storeName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t('settings.branchLocation')}
                    </label>
                    <Input
                      value={draft.branch}
                      onChange={(e) => setDraft((d) => ({ ...d, branch: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t('settings.currencyLabel')}
                    </label>
                    <Input
                      value={draft.currency}
                      onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                    />
                  </div>
                </div>
                <ImagePicker
                  label={t('settings.storeLogoLabel')}
                  helperText={t('settings.storeLogoHelp')}
                  clearLabel={t('settings.storeLogoRemove')}
                  value={storeLogoDraft ?? ''}
                  previewUrl={storeLogoDraft === null ? settings.storeLogoUrl : null}
                  readFile={readStoreLogoFileAsDataUrl}
                  onChange={(dataUrl) =>
                    setStoreLogoDraft(dataUrl === PLACEHOLDER_PRODUCT_IMAGE ? '' : dataUrl)
                  }
                />
                <div className="pt-4 flex justify-end">
                  <Button onClick={saveStore}>{t('settings.saveChanges')}</Button>
                </div>
              </div>
            </Card>
          )}

          {section === 'payments' && (
            <Card title={t('settings.paymentsTitle')}>
              <p className="text-sm text-on-surface-variant mt-2 mb-6">{t('settings.paymentsBody')}</p>
              <div className="space-y-8 mt-2">
                <div className="space-y-4 rounded-xl border border-black/5 p-4 bg-surface-container-lowest">
                  <p className="text-sm font-bold">{t('settings.transferSection')}</p>
                  <p className="text-xs text-on-surface-variant">{t('settings.transferSectionHelp')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {t('settings.transferBank')}
                      </label>
                      <Input
                        value={draft.transferBank}
                        onChange={(e) => setDraft((d) => ({ ...d, transferBank: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {t('settings.transferAccountHolder')}
                      </label>
                      <Input
                        value={draft.transferAccountHolder}
                        onChange={(e) => setDraft((d) => ({ ...d, transferAccountHolder: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {t('settings.transferAccountNumber')}
                      </label>
                      <Input
                        value={draft.transferAccountNumber}
                        onChange={(e) => setDraft((d) => ({ ...d, transferAccountNumber: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {t('settings.transferPhoneNumber')}
                      </label>
                      <div className="flex items-stretch">
                        <span className="inline-flex items-center px-3 rounded-l-lg bg-surface-container-high text-sm font-semibold text-on-surface-variant select-none">
                          +53
                        </span>
                        <Input
                          className="rounded-l-none"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          maxLength={8}
                          placeholder="51234567"
                          value={draft.transferPhoneNumber}
                          onChange={(e) => {
                            const next = normalizeTransferPhone(e.target.value).slice(0, 8);
                            setDraft((d) => ({ ...d, transferPhoneNumber: next }));
                            if (paymentsError) setPaymentsError(null);
                          }}
                        />
                      </div>
                      <p className="text-xs text-on-surface-variant mt-1.5">{t('settings.transferPhoneHelp')}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {t('settings.taxRate')}
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={draft.taxRate}
                        onChange={(e) => setDraft((d) => ({ ...d, taxRate: parseFloat(e.target.value) || 0 }))}
                      />
                      <p className="text-xs text-on-surface-variant mt-1.5">{t('settings.taxRateTransferNote')}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-black/5 p-4 bg-surface-container-lowest">
                  <p className="text-sm font-bold">{t('settings.onlineSection')}</p>
                  <p className="text-xs text-on-surface-variant">{t('settings.onlineSectionHelp')}</p>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t('settings.onlineQrPayloadLabel')}
                    </label>
                    <textarea
                      rows={3}
                      value={draft.cardQrPayload}
                      onChange={(e) => setDraft((d) => ({ ...d, cardQrPayload: e.target.value }))}
                      className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all outline-none resize-y min-h-[5rem]"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <p className="text-xs text-on-surface-variant">{t('settings.onlineQrPayloadHelp')}</p>
                  </div>
                </div>

                {paymentsError ? (
                  <p className="text-sm text-error font-medium">{paymentsError}</p>
                ) : null}
                <div className="pt-2 flex justify-end">
                  <Button onClick={() => void savePayments()}>{t('settings.saveChanges')}</Button>
                </div>
              </div>
            </Card>
          )}

          {section === 'profile' && (
            <Card title={t('settings.userProfile')}>
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t('settings.displayName')}
                    </label>
                    <Input
                      value={draft.managerName}
                      onChange={(e) => setDraft((d) => ({ ...d, managerName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {t('settings.roleTitle')}
                    </label>
                    <Input
                      value={draft.managerTitle}
                      onChange={(e) => setDraft((d) => ({ ...d, managerTitle: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button onClick={saveProfile}>{t('settings.saveProfile')}</Button>
                </div>
              </div>
            </Card>
          )}

          {section === 'notifications' && (
            <Card title={t('settings.notificationsTitle')}>
              <p className="text-sm text-on-surface-variant mt-2 mb-6">{t('settings.notificationsLowStockHelp')}</p>
              <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
                <div>
                  <p className="text-sm font-bold">{t('settings.lowStockTitle')}</p>
                  <p className="text-xs text-on-surface-variant">{t('settings.lowStockSubtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdate({ lowStockNotifications: !settings.lowStockNotifications })}
                  className={cn(
                    'w-12 h-6 rounded-full relative transition-colors',
                    settings.lowStockNotifications ? 'bg-primary' : 'bg-surface-container-high',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all',
                      settings.lowStockNotifications ? 'right-1' : 'left-1',
                    )}
                  />
                </button>
              </div>
            </Card>
          )}

          {section === 'security' && (
            <Card title={t('settings.securityTitle')}>
              <p className="text-sm text-on-surface-variant mt-2">{t('settings.securityBody')}</p>
            </Card>
          )}

          {section === 'regional' && (
            <Card title={t('settings.regionalTitle')}>
              <p className="text-sm text-on-surface-variant mt-2 mb-4">{t('settings.regionalCurrencyNote')}</p>
              <div className="space-y-2 max-w-md">
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block">
                  {t('settings.languageLabel')}
                </label>
                <select
                  value={settings.locale}
                  onChange={(e) => onUpdate({ locale: e.target.value as AppLocale })}
                  className="w-full rounded-lg border border-black/10 bg-surface-container-high px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="es">{t('settings.languageEs')}</option>
                  <option value="en">{t('settings.languageEn')}</option>
                </select>
                <p className="text-xs text-on-surface-variant">{t('settings.languageHelp')}</p>
              </div>
            </Card>
          )}

          {section === 'billing' && (
            <Card title={t('settings.billingTitle')}>
              <p className="text-sm text-on-surface-variant mt-2 mb-4">{t('settings.billingIntro')}</p>
              {billingMsg && (
                <p
                  className={cn(
                    'text-sm mb-4 rounded-lg px-3 py-2',
                    billingMsg.type === 'ok'
                      ? 'bg-tertiary-container/15 text-on-tertiary-container'
                      : 'bg-error-container text-on-error-container',
                  )}
                >
                  {billingMsg.text}
                </p>
              )}
              {licenseInfo ? (
                <div className="space-y-6">
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
                          date: new Date(licenseInfo.paidUntil).toLocaleDateString(
                            settings.locale === 'es' ? 'es' : 'en-US',
                          ),
                        })}
                      </p>
                    ) : (
                      <p className="text-xs text-on-surface-variant">
                        {t('settings.billingTrialEnds', {
                          date: new Date(licenseInfo.trialEndsAt).toLocaleDateString(
                            settings.locale === 'es' ? 'es' : 'en-US',
                          ),
                        })}
                      </p>
                    )}
                  </div>

                  {activePlan && !showChangePlan ? (
                    <div className="p-5 border border-primary/20 rounded-xl bg-primary/5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                        {t('settings.billingCurrentPlan')}
                      </p>
                      <p className="text-xl font-black text-primary">{activePlan.name}</p>
                      <p className="text-sm text-on-surface-variant mt-1">
                        {t('settings.billingPlanPrice', { price: activePlan.price })}
                      </p>
                      <Button
                        variant="secondary"
                        className="mt-4"
                        disabled={billingBusy}
                        onClick={() => {
                          setShowChangePlan(true);
                          setRequestCode(null);
                          setSelectedPlanId(null);
                        }}
                      >
                        {t('settings.billingChangePlan')}
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {licenseInfo.plans.map((plan) => (
                        <div
                          key={plan.id}
                          className={cn(
                            'p-5 rounded-xl border transition-all',
                            selectedPlanId === plan.id
                              ? 'border-primary bg-primary/5'
                              : 'border-black/10 bg-surface-container-low',
                          )}
                        >
                          <p className="text-lg font-black text-primary">{plan.name}</p>
                          <p className="text-2xl font-extrabold text-primary mt-2">
                            {plan.price.toLocaleString()} <span className="text-sm font-bold">CUP</span>
                          </p>
                          <p className="text-xs text-on-surface-variant mt-2">{t('settings.billingPlanDays', { days: plan.days })}</p>
                          <Button
                            className="w-full mt-4"
                            variant={selectedPlanId === plan.id ? 'secondary' : 'primary'}
                            disabled={billingBusy || licenseInfo.status === 'device_mismatch'}
                            onClick={() => handleRequestLicense(plan.id)}
                          >
                            {t('settings.billingRequestCode')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

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
                      <Button variant="secondary" onClick={copyRequestCode}>
                        {t('settings.billingCopyCode')}
                      </Button>
                    </div>
                  ) : null}

                  <div className="p-4 rounded-xl border border-black/10 space-y-3">
                    <p className="text-sm font-bold text-primary">{t('settings.billingActivateTitle')}</p>
                    <p className="text-xs text-on-surface-variant">{t('settings.billingActivateHelp')}</p>
                    <textarea
                      rows={3}
                      value={licenseKeyInput}
                      onChange={(e) => setLicenseKeyInput(e.target.value)}
                      placeholder={t('settings.billingLicensePlaceholder')}
                      className="w-full font-mono text-xs rounded-lg border border-black/10 bg-surface-container-high p-3 resize-y min-h-[4rem]"
                      spellCheck={false}
                    />
                    <Button
                      disabled={billingBusy || !licenseKeyInput.trim() || licenseInfo.status === 'device_mismatch'}
                      onClick={handleActivateLicense}
                    >
                      {t('settings.billingActivate')}
                    </Button>
                  </div>

                  {showChangePlan && activePlan ? (
                    <Button variant="ghost" onClick={() => setShowChangePlan(false)}>
                      {t('common.cancel')}
                    </Button>
                  ) : null}

                  <p className="text-xs text-on-surface-variant">{t('settings.billingPaymentNote')}</p>
                  {licenseInfo.deviceId ? (
                    <p className="text-[10px] text-on-surface-variant font-mono break-all">
                      {t('settings.billingDeviceId')}: {licenseInfo.deviceId}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">{t('settings.billingLoading')}</p>
              )}
            </Card>
          )}

          {section === 'data' && (
            <Card title={t('settings.dataTitle')}>
              <p className="text-sm text-on-surface-variant mt-2 mb-6">{t('settings.dataBody')}</p>
              {backupMessage && (
                <p
                  className={cn(
                    'text-sm mb-4 rounded-lg px-3 py-2',
                    backupMessage.type === 'ok'
                      ? 'bg-tertiary-container/15 text-on-tertiary-container'
                      : 'bg-error-container text-on-error-container',
                  )}
                >
                  {backupMessage.text}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button className="flex items-center gap-2" disabled={backupBusy} onClick={handleExportBackup}>
                  <Download size={16} /> {t('settings.downloadBackup')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex items-center gap-2"
                  disabled={backupBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} /> {t('settings.importBackup')}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleBackupFileChange}
                />
              </div>
              <p className="text-xs text-on-surface-variant mt-6">{t('settings.dataTip')}</p>
              <div className="mt-8 pt-6 border-t border-black/5">
                <p className="text-sm font-bold text-primary mb-2">{t('settings.factoryResetTitle')}</p>
                <p className="text-xs text-on-surface-variant mb-4">{t('settings.factoryResetBody')}</p>
                <Button variant="danger" disabled={backupBusy} onClick={() => setFactoryResetOpen(true)}>
                  {t('settings.factoryResetButton')}
                </Button>
              </div>
            </Card>
          )}

          {section === 'server' && (
            <Card title={t('settings.serverTitle')}>
              <p className="text-sm text-on-surface-variant mt-2 mb-6">{t('settings.serverBody')}</p>
              {serverMessage && (
                <p
                  className={cn(
                    'text-sm mb-4 rounded-lg px-3 py-2',
                    serverMessage.type === 'ok'
                      ? 'bg-tertiary-container/15 text-on-tertiary-container'
                      : 'bg-error-container text-on-error-container',
                  )}
                >
                  {serverMessage.text}
                </p>
              )}
              <div className="space-y-4 max-w-xl">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {t('settings.serverUrlLabel')}
                  </label>
                  <Input
                    value={apiUrlDraft}
                    onChange={(e) => setApiUrlDraft(e.target.value)}
                    placeholder={DEFAULT_API_BASE_URL}
                  />
                  <p className="text-xs text-on-surface-variant">{t('settings.serverUrlHelp')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveApiUrl}>{t('settings.serverSaveUrl')}</Button>
                  <Button variant="secondary" disabled={apiChecking} onClick={() => void loadHealth()}>
                    {apiChecking ? t('settings.serverChecking') : t('settings.serverTest')}
                  </Button>
                  <Button variant="secondary" className="flex items-center gap-2" onClick={openServerQr}>
                    <QrCode size={16} /> {t('settings.serverQr')}
                  </Button>
                </div>
                <div className="p-4 bg-surface-container-low rounded-xl space-y-2">
                  <p className="text-sm font-bold">
                    {t('settings.serverStatus')}:{' '}
                    <span className={apiConnected ? 'text-on-tertiary-container' : 'text-on-error-container'}>
                      {apiConnected ? t('settings.serverOnline') : t('settings.serverOffline')}
                    </span>
                  </p>
                  {healthInfo && (
                    <>
                      <p className="text-xs text-on-surface-variant">
                        {t('settings.serverVersion', { version: healthInfo.version })}
                      </p>
                      {healthInfo.lanUrls.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                            {t('settings.serverLanUrls')}
                          </p>
                          <ul className="text-sm font-mono space-y-1">
                            {healthInfo.lanUrls.map((url) => (
                              <li key={url} className="break-all">
                                {url}
                              </li>
                            ))}
                          </ul>
                          <p className="text-xs text-on-surface-variant mt-2">{t('settings.serverMobileHint')}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="pt-6 border-t border-black/5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">{t('settings.serverConnectedDevices')}</p>
                      <p className="text-xs text-on-surface-variant mt-1">{t('settings.serverConnectedDevicesHint')}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!apiConnected || devicesLoading}
                      onClick={() => void loadConnectedDevices()}
                    >
                      {devicesLoading ? t('settings.serverChecking') : t('settings.serverDeviceRefresh')}
                    </Button>
                  </div>

                  {!apiConnected ? null : connectedDevices.length === 0 && !devicesLoading ? (
                    <p className="text-sm text-on-surface-variant">{t('settings.serverDeviceNone')}</p>
                  ) : (
                    <div className="space-y-2">
                      {connectedDevices.map((device) => {
                        const statusLabel = device.revokedAt != null
                          ? t('settings.serverDeviceRevoked')
                          : device.online
                            ? t('settings.serverDeviceOnline')
                            : t('settings.serverDeviceOffline');
                        const statusClass = device.revokedAt != null
                          ? 'bg-error-container/20 text-on-error-container'
                          : device.online
                            ? 'bg-tertiary-container/20 text-on-tertiary-container'
                            : 'bg-surface-container-high text-on-surface-variant';

                        return (
                          <div
                            key={device.deviceId}
                            className="rounded-xl border border-black/5 bg-surface-container-lowest p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                                    {deviceKindIcon(device.clientKind)}
                                    {deviceKindLabel(device.clientKind)}
                                  </span>
                                  {device.isCurrent ? (
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                                      {t('settings.serverDeviceThisDevice')}
                                    </span>
                                  ) : null}
                                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', statusClass)}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <p className="text-xs font-mono text-on-surface-variant break-all" title={device.deviceId}>
                                  {shortDeviceId(device.deviceId)}
                                </p>
                              </div>
                              {!device.isCurrent && device.revokedAt == null ? (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={revokeBusyId === device.deviceId}
                                  onClick={() => void handleRevokeDevice(device)}
                                >
                                  {t('settings.serverDeviceDisconnect')}
                                </Button>
                              ) : null}
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                                {t('settings.serverOperatorName')}
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <Input
                                  value={operatorDrafts[device.deviceId] ?? device.operatorName}
                                  onChange={(e) =>
                                    setOperatorDrafts((prev) => ({ ...prev, [device.deviceId]: e.target.value }))
                                  }
                                  placeholder={t('settings.serverOperatorPlaceholder')}
                                  className="flex-1 min-w-[10rem]"
                                  disabled={device.revokedAt != null}
                                />
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={device.revokedAt != null || operatorBusyId === device.deviceId}
                                  onClick={() => void handleSaveOperator(device)}
                                >
                                  {t('settings.serverOperatorSave')}
                                </Button>
                              </div>
                              <p className="text-[10px] text-on-surface-variant">{t('settings.serverOperatorHelp')}</p>
                            </div>
                            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                              <div>
                                <dt className="font-bold text-on-surface-variant">{t('settings.serverDeviceFirstSeen')}</dt>
                                <dd className="mt-0.5">{formatDeviceTime(device.firstSeenAt)}</dd>
                              </div>
                              <div>
                                <dt className="font-bold text-on-surface-variant">{t('settings.serverDeviceLastSeen')}</dt>
                                <dd className="mt-0.5">{formatDeviceTime(device.lastSeenAt)}</dd>
                              </div>
                              <div>
                                <dt className="font-bold text-on-surface-variant">{t('settings.serverDeviceSessionDuration')}</dt>
                                <dd className="mt-0.5">
                                  {formatSessionDuration(device.firstSeenAt, device.revokedAt ?? device.lastSeenAt)}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Card title={t('settings.appearance')}>
            <div className="space-y-4 mt-6">
              <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
                <div>
                  <p className="text-sm font-bold">{t('settings.darkMode')}</p>
                  <p className="text-xs text-on-surface-variant">{t('settings.darkModeHelp')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdate({ darkMode: !settings.darkMode })}
                  className={cn(
                    'w-12 h-6 rounded-full relative transition-colors',
                    settings.darkMode ? 'bg-primary' : 'bg-surface-container-high',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all',
                      settings.darkMode ? 'right-1' : 'left-1',
                    )}
                  />
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={factoryResetOpen}
        onClose={() => {
          if (!factoryResetBusy) setFactoryResetOpen(false);
        }}
        title={t('settings.factoryResetTitle')}
      >
        <p className="text-sm text-on-surface-variant mb-2">{t('settings.factoryResetConfirm')}</p>
        <p className="text-xs text-error font-medium mb-6">{t('settings.factoryResetWarning')}</p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={factoryResetBusy}
            onClick={() => setFactoryResetOpen(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button variant="danger" className="flex-1" disabled={factoryResetBusy} onClick={confirmFactoryReset}>
            {factoryResetBusy ? t('settings.factoryResetting') : t('settings.factoryResetButton')}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={importConfirmOpen}
        onClose={() => {
          if (!backupBusy) {
            setImportConfirmOpen(false);
            setPendingBackup(null);
            setPendingFileName('');
          }
        }}
        title={t('settings.replaceDbTitle')}
      >
        <p className="text-sm text-on-surface-variant mb-2">{t('settings.replaceDbBody')}</p>
        <p className="text-sm font-bold text-primary mb-6 break-all">{pendingFileName}</p>
        <p className="text-xs text-error font-medium mb-6">{t('settings.replaceDbWarning')}</p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={backupBusy}
            onClick={() => {
              setImportConfirmOpen(false);
              setPendingBackup(null);
              setPendingFileName('');
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button variant="danger" className="flex-1" disabled={backupBusy} onClick={confirmRestoreBackup}>
            {backupBusy ? t('settings.restoring') : t('settings.yesRestore')}
          </Button>
        </div>
      </Modal>

      <CardQrModal
        open={serverQrOpen}
        onClose={() => setServerQrOpen(false)}
        payload={buildServerConnectQrPayload(serverQrUrl)}
        title={t('settings.serverQrTitle')}
        hint={t('settings.serverQrHint', { url: serverQrUrl })}
        empty={t('settings.serverQrEmpty')}
      />
    </div>
  );
}
