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
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../components/ui';
import { AppSettings, type AppLocale } from '../types';
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

type Section = 'general' | 'profile' | 'notifications' | 'security' | 'regional' | 'billing' | 'data' | 'server';

interface SettingsProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<Omit<AppSettings, 'id'>>) => void | Promise<void>;
  apiConnected: boolean;
  apiChecking: boolean;
  onRetryApiConnection: () => Promise<boolean>;
  onDataChanged?: () => void | Promise<void>;
}

export function Settings({
  settings,
  onUpdate,
  apiConnected,
  apiChecking,
  onRetryApiConnection,
  onDataChanged,
}: SettingsProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<Section>('general');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ExecutiveSuiteBackup | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [apiUrlDraft, setApiUrlDraft] = useState(getApiBaseUrl());
  const [healthInfo, setHealthInfo] = useState<HealthResponse | null>(null);
  const [serverMessage, setServerMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [draft, setDraft] = useState({
    storeName: settings.storeName,
    branch: settings.branch,
    currency: settings.currency,
    taxRate: settings.taxRate,
    cardQrPayload: settings.cardQrPayload,
    managerName: settings.managerName,
    managerTitle: settings.managerTitle,
  });

  const baselineRef = useRef({
    storeName: settings.storeName,
    branch: settings.branch,
    currency: settings.currency,
    taxRate: settings.taxRate,
    cardQrPayload: settings.cardQrPayload,
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
        prev.managerName !== b.managerName ||
        prev.managerTitle !== b.managerTitle;
      const matchesIncoming =
        prev.storeName === settings.storeName &&
        prev.branch === settings.branch &&
        prev.currency === settings.currency &&
        prev.taxRate === settings.taxRate &&
        prev.cardQrPayload === settings.cardQrPayload &&
        prev.managerName === settings.managerName &&
        prev.managerTitle === settings.managerTitle;
      if (dirty && !matchesIncoming) return prev;
      baselineRef.current = {
        storeName: settings.storeName,
        branch: settings.branch,
        currency: settings.currency,
        taxRate: settings.taxRate,
        cardQrPayload: settings.cardQrPayload,
        managerName: settings.managerName,
        managerTitle: settings.managerTitle,
      };
      return {
        storeName: settings.storeName,
        branch: settings.branch,
        currency: settings.currency,
        taxRate: settings.taxRate,
        cardQrPayload: settings.cardQrPayload,
        managerName: settings.managerName,
        managerTitle: settings.managerTitle,
      };
    });
  }, [settings]);

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

  useEffect(() => {
    if (section === 'server') void loadHealth();
  }, [section, apiConnected]);

  const saveApiUrl = () => {
    setApiBaseUrl(apiUrlDraft.trim() || DEFAULT_API_BASE_URL);
    setServerMessage({ type: 'ok', text: t('settings.serverUrlSaved') });
    void onRetryApiConnection();
  };

  const saveStore = async () => {
    await onUpdate({
      storeName: draft.storeName,
      branch: draft.branch,
      currency: draft.currency,
      taxRate: draft.taxRate,
      cardQrPayload: draft.cardQrPayload,
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
                    <p className="text-xs text-on-surface-variant mt-1.5">{t('settings.taxRateCardOnlyNote')}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {t('settings.cardQrPayloadLabel')}
                  </label>
                  <textarea
                    rows={3}
                    value={draft.cardQrPayload}
                    onChange={(e) => setDraft((d) => ({ ...d, cardQrPayload: e.target.value }))}
                    className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all outline-none resize-y min-h-[5rem]"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <p className="text-xs text-on-surface-variant">{t('settings.cardQrPayloadHelp')}</p>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button onClick={saveStore}>{t('settings.saveChanges')}</Button>
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
              <p className="text-sm text-on-surface-variant mt-2">{t('settings.billingBody')}</p>
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
    </div>
  );
}
