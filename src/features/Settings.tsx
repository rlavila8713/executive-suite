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
import { AppSettings } from '../types';
import { cn } from '../lib/utils';
import {
  buildBackupSnapshot,
  downloadBackupFile,
  readBackupFromFile,
  restoreBackupSnapshot,
  type ExecutiveSuiteBackup,
} from '../lib/backup';

type Section = 'general' | 'profile' | 'notifications' | 'security' | 'regional' | 'billing' | 'data';

interface SettingsProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<Omit<AppSettings, 'id'>>) => void | Promise<void>;
}

export function Settings({ settings, onUpdate }: SettingsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<Section>('general');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ExecutiveSuiteBackup | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');

  const [draft, setDraft] = useState({
    storeName: settings.storeName,
    branch: settings.branch,
    currency: settings.currency,
    taxRate: settings.taxRate,
    managerName: settings.managerName,
    managerTitle: settings.managerTitle,
  });

  useEffect(() => {
    setDraft({
      storeName: settings.storeName,
      branch: settings.branch,
      currency: settings.currency,
      taxRate: settings.taxRate,
      managerName: settings.managerName,
      managerTitle: settings.managerTitle,
    });
  }, [settings]);

  const saveStore = async () => {
    await onUpdate({
      storeName: draft.storeName,
      branch: draft.branch,
      currency: draft.currency,
      taxRate: draft.taxRate,
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
      setBackupMessage({ type: 'ok', text: 'Backup file downloaded. Copy it to your other computer, then use Import there.' });
    } catch (e) {
      setBackupMessage({ type: 'err', text: e instanceof Error ? e.message : 'Export failed.' });
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
        text: err instanceof Error ? err.message : 'Could not read this file.',
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
      setImportConfirmOpen(false);
      setPendingBackup(null);
      setPendingFileName('');
      setBackupMessage({
        type: 'ok',
        text: 'Local database replaced. Your screens should update immediately.',
      });
    } catch (e) {
      setBackupMessage({ type: 'err', text: e instanceof Error ? e.message : 'Restore failed.' });
    } finally {
      setBackupBusy(false);
    }
  };

  const nav = [
    { id: 'general' as const, label: 'General Store', icon: Store },
    { id: 'profile' as const, label: 'User Profile', icon: User },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'regional' as const, label: 'Regional & Language', icon: Globe },
    { id: 'billing' as const, label: 'Billing & Plans', icon: CreditCard },
    { id: 'data' as const, label: 'Backup & data', icon: HardDrive },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-10">
        <h2 className="text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">System Settings</h2>
        <p className="text-on-surface-variant text-sm font-medium">
          Configure your store preferences and system parameters. Changes are saved locally.
        </p>
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
            <Card title="Store configuration">
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Store name
                    </label>
                    <Input
                      value={draft.storeName}
                      onChange={(e) => setDraft((d) => ({ ...d, storeName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Branch location
                    </label>
                    <Input
                      value={draft.branch}
                      onChange={(e) => setDraft((d) => ({ ...d, branch: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Currency label
                    </label>
                    <Input
                      value={draft.currency}
                      onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Tax rate (%)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={draft.taxRate}
                      onChange={(e) => setDraft((d) => ({ ...d, taxRate: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button onClick={saveStore}>Save changes</Button>
                </div>
              </div>
            </Card>
          )}

          {section === 'profile' && (
            <Card title="User profile">
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Display name
                    </label>
                    <Input
                      value={draft.managerName}
                      onChange={(e) => setDraft((d) => ({ ...d, managerName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Role title
                    </label>
                    <Input
                      value={draft.managerTitle}
                      onChange={(e) => setDraft((d) => ({ ...d, managerTitle: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button onClick={saveProfile}>Save profile</Button>
                </div>
              </div>
            </Card>
          )}

          {section === 'notifications' && (
            <Card title="Notifications">
              <p className="text-sm text-on-surface-variant mt-2 mb-6">
                Low-stock alerts preference is stored locally and can be used by future features.
              </p>
              <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
                <div>
                  <p className="text-sm font-bold">Low stock notifications</p>
                  <p className="text-xs text-on-surface-variant">Alert when items fall below threshold</p>
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
            <Card title="Security">
              <p className="text-sm text-on-surface-variant mt-2">
                This prototype has no sign-in. Data stays on this device only (IndexedDB).
              </p>
            </Card>
          )}

          {section === 'regional' && (
            <Card title="Regional">
              <p className="text-sm text-on-surface-variant mt-2">
                Currency display is configured under General Store.
              </p>
            </Card>
          )}

          {section === 'billing' && (
            <Card title="Billing">
              <p className="text-sm text-on-surface-variant mt-2">No billing integration in this build.</p>
            </Card>
          )}

          {section === 'data' && (
            <Card title="Backup & portability">
              <p className="text-sm text-on-surface-variant mt-2 mb-6">
                Export everything (products, sales, expenses, settings) as one JSON file. On another computer, open this
                app and import that file to recreate your database in the browser.
              </p>
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
                  <Download size={16} /> Download backup (.json)
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex items-center gap-2"
                  disabled={backupBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} /> Import backup…
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleBackupFileChange}
                />
              </div>
              <p className="text-xs text-on-surface-variant mt-6">
                Tip: keep periodic copies of your backup file. Importing always replaces the current local data on this
                device.
              </p>
            </Card>
          )}

          <Card title="Appearance">
            <div className="space-y-4 mt-6">
              <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
                <div>
                  <p className="text-sm font-bold">Dark mode</p>
                  <p className="text-xs text-on-surface-variant">Uses the Tailwind class strategy on the document root</p>
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
        title="Replace local database?"
      >
        <p className="text-sm text-on-surface-variant mb-2">
          All current data in this browser will be deleted and replaced with the contents of:
        </p>
        <p className="text-sm font-bold text-primary mb-6 break-all">{pendingFileName}</p>
        <p className="text-xs text-error font-medium mb-6">This cannot be undone. Make sure you exported a backup first if you need to keep today&apos;s data.</p>
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
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" disabled={backupBusy} onClick={confirmRestoreBackup}>
            {backupBusy ? 'Restoring…' : 'Yes, restore'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
