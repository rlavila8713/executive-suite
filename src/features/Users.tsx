import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, UserCog, Shield } from 'lucide-react';
import { RolePermissionsEditor } from './users/RolePermissionsEditor';
import { Card, Button, Input, Modal } from '../components/ui';
import { TableIconAction, TableActionGroup } from '../components/TableIconAction';
import { api } from '../api/client';
import type { AppPermission, AppRole, AppRoleKey, AppUser } from '../types';
import { mapMutationError } from '../lib/mutationErrors';
import { useI18n } from '../i18n/I18nContext';
import { cn } from '../lib/utils';

export function Users({ apiConnected }: { apiConnected: boolean }) {
  const { t } = useI18n();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<AppPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [roleKey, setRoleKey] = useState<AppRoleKey>('seller');
  const [username, setUsername] = useState('');
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const roleOptions = useMemo(
    () => roles.filter((r) => r.key === 'manager' || r.key === 'seller'),
    [roles],
  );

  const load = useCallback(async () => {
    if (!apiConnected) {
      setUsers([]);
      setRoles([]);
      setPermissionCatalog([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const [userRows, roleRows, perms] = await Promise.all([
        api.listUsers(),
        api.listRoles(),
        api.listPermissions(),
      ]);
      setUsers(userRows);
      setRoles(roleRows);
      setPermissionCatalog(perms);
    } catch (e) {
      setMessage({ type: 'err', text: mapMutationError(e, t) });
    } finally {
      setLoading(false);
    }
  }, [apiConnected, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setDisplayName('');
    setRoleKey('seller');
    setUsername('');
    setActive(true);
    setPassword('');
    setModalOpen(true);
  };

  const openEdit = (user: AppUser) => {
    setEditing(user);
    setDisplayName(user.displayName);
    setRoleKey(user.roleKey);
    setUsername(user.username ?? '');
    setActive(user.active);
    setPassword('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    const name = displayName.trim();
    if (!name) {
      setMessage({ type: 'err', text: t('users.nameRequired') });
      return;
    }
    setSaving(true);
    setMessage(null);
    const pwd = password.trim();
    const uname = username.trim();
    if (pwd && !uname) {
      setMessage({ type: 'err', text: t('users.passwordNeedsUsername') });
      return;
    }
    try {
      let userId: string;
      if (editing) {
        const updated = await api.updateUser(editing.id, {
          displayName: name,
          roleKey,
          active,
          username: uname || null,
        });
        userId = updated.id;
      } else {
        const created = await api.createUser({
          displayName: name,
          roleKey,
          username: uname || null,
        });
        userId = created.id;
      }
      if (pwd) {
        await api.setUserPassword(userId, pwd);
      }
      setModalOpen(false);
      setMessage({ type: 'ok', text: t('users.saved') });
      await load();
    } catch (e) {
      setMessage({ type: 'err', text: mapMutationError(e, t) });
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (key: AppRoleKey) =>
    key === 'manager' ? t('users.roleManager') : t('users.roleSeller');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mb-2 font-headline">
            {t('users.pageTitle')}
          </h2>
          <p className="text-on-surface-variant text-sm font-medium max-w-2xl">{t('users.pageSubtitle')}</p>
        </div>
        <Button onClick={openCreate} disabled={!apiConnected || loading}>
          <Plus size={16} className="mr-2" />
          {t('users.addUser')}
        </Button>
      </div>

      {message ? (
        <p
          className={cn(
            'text-sm font-medium rounded-lg px-4 py-2',
            message.type === 'ok' ? 'bg-tertiary-container/30 text-on-tertiary-container' : 'bg-error-container/30 text-on-error-container',
          )}
        >
          {message.text}
        </p>
      ) : null}

      {!apiConnected ? (
        <Card title={t('users.offlineTitle')}>
          <p className="text-sm text-on-surface-variant mt-2">{t('users.offlineBody')}</p>
        </Card>
      ) : (
        <Card title={t('users.listTitle')}>
          {loading && users.length === 0 ? (
            <p className="text-sm text-on-surface-variant mt-4">{t('users.loading')}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-on-surface-variant mt-4">{t('users.empty')}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-black/5">
                    <th className="py-3 pr-4">{t('users.colName')}</th>
                    <th className="py-3 pr-4">{t('users.colRole')}</th>
                    <th className="py-3 pr-4">{t('users.colUsername')}</th>
                    <th className="py-3 pr-4">{t('users.colStatus')}</th>
                    <th className="py-3 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-black/5 last:border-0">
                      <td className="py-3 pr-4 font-semibold">{user.displayName}</td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          {user.roleKey === 'manager' ? <Shield size={14} /> : <UserCog size={14} />}
                          {roleLabel(user.roleKey)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-on-surface-variant">{user.username ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase rounded-full px-2 py-0.5',
                            user.active
                              ? 'bg-tertiary-container/25 text-on-tertiary-container'
                              : 'bg-surface-container-high text-on-surface-variant',
                          )}
                        >
                          {user.active ? t('users.statusActive') : t('users.statusInactive')}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <TableActionGroup>
                          <TableIconAction
                            label={t('common.edit')}
                            icon={Edit2}
                            onClick={() => openEdit(user)}
                          />
                        </TableActionGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {roles.length > 0 && permissionCatalog.length > 0 ? (
        <RolePermissionsEditor
          roles={roles}
          catalog={permissionCatalog}
          disabled={!apiConnected || loading}
          onSaved={load}
          onMessage={setMessage}
        />
      ) : null}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('users.editUser') : t('users.addUser')}
      >
        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {t('users.colName')}
            </label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {t('users.colRole')}
            </label>
            <select
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value as AppRoleKey)}
              className="w-full bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            >
              {roleOptions.map((r) => (
                <option key={r.id} value={r.key}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {t('users.colUsername')}
            </label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('users.usernameOptional')}
              autoComplete="off"
            />
            <p className="text-[10px] text-on-surface-variant">{t('users.usernameHelp')}</p>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {t('users.colPassword')}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('users.passwordOptional')}
              autoComplete="new-password"
            />
            <p className="text-[10px] text-on-surface-variant">
              {roleKey === 'seller' ? t('users.passwordSellerHint') : t('users.passwordManagerHint')}
            </p>
          </div>
          {editing ? (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-none"
              />
              {t('users.statusActive')}
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? t('users.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
