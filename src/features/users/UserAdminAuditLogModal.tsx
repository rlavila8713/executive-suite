import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/ui';
import { api } from '../../api/client';
import type { UserAdminAuditAction, UserAdminAuditEntry } from '../../types';
import { mapMutationError } from '../../lib/mutationErrors';
import { formatAppDateTime } from '../../lib/dateFormat';
import { useI18n } from '../../i18n/I18nContext';
import { cn } from '../../lib/utils';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function formatRoleKey(t: (key: string) => string, roleKey: unknown): string {
  if (roleKey === 'manager') return t('users.roleManager');
  if (roleKey === 'seller') return t('users.roleSeller');
  return String(roleKey ?? '—');
}

function describeAuditEntry(
  entry: UserAdminAuditEntry,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const d = entry.details;

  if (entry.action === 'user.created') {
    const name = String(d.displayName ?? '—');
    const role = formatRoleKey(t, d.roleKey);
    const user = d.username ? String(d.username) : t('users.auditNoUsername');
    return t('users.auditDetailUserCreated', { name, role, user });
  }

  if (entry.action === 'user.password_set') {
    return t('users.auditDetailPasswordSet', { name: String(d.displayName ?? '—') });
  }

  if (entry.action === 'role.permissions_updated') {
    const role = String(d.roleName ?? d.roleKey ?? '—');
    const added = Array.isArray(d.permissionKeysAdded) ? d.permissionKeysAdded.length : 0;
    const removed = Array.isArray(d.permissionKeysRemoved) ? d.permissionKeysRemoved.length : 0;
    return t('users.auditDetailRolePermissions', { role, added, removed });
  }

  if (entry.action === 'user.updated') {
    const changes = d.changes;
    if (!isRecord(changes) || Object.keys(changes).length === 0) {
      return t('users.auditDetailUserUpdatedEmpty', { name: String(d.displayName ?? '—') });
    }
    const parts: string[] = [];
    for (const [field, raw] of Object.entries(changes)) {
      if (!isRecord(raw)) continue;
      const from = raw.from;
      const to = raw.to;
      if (field === 'roleKey') {
        parts.push(
          t('users.auditChangeRole', {
            from: formatRoleKey(t, from),
            to: formatRoleKey(t, to),
          }),
        );
      } else if (field === 'active') {
        parts.push(
          t('users.auditChangeActive', {
            to: to ? t('users.statusActive') : t('users.statusInactive'),
          }),
        );
      } else if (field === 'displayName') {
        parts.push(t('users.auditChangeName', { from: String(from ?? '—'), to: String(to ?? '—') }));
      } else if (field === 'username') {
        parts.push(
          t('users.auditChangeUsername', {
            from: from ? String(from) : t('users.auditNoUsername'),
            to: to ? String(to) : t('users.auditNoUsername'),
          }),
        );
      }
    }
    return parts.length > 0
      ? t('users.auditDetailUserUpdated', { name: String(d.displayName ?? '—'), changes: parts.join('; ') })
      : t('users.auditDetailUserUpdatedEmpty', { name: String(d.displayName ?? '—') });
  }

  return entry.action;
}

function actionLabel(action: UserAdminAuditAction, t: (key: string) => string): string {
  switch (action) {
    case 'user.created':
      return t('users.auditActionUserCreated');
    case 'user.updated':
      return t('users.auditActionUserUpdated');
    case 'user.password_set':
      return t('users.auditActionPasswordSet');
    case 'role.permissions_updated':
      return t('users.auditActionRolePermissions');
    default:
      return action;
  }
}

export function UserAdminAuditLogModal({
  open,
  onClose,
  apiConnected,
}: {
  open: boolean;
  onClose: () => void;
  apiConnected: boolean;
}) {
  const { t, locale } = useI18n();
  const [entries, setEntries] = useState<UserAdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiConnected) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listUserAdminAuditLog({ limit: 200 });
      setEntries(rows);
    } catch (e) {
      setError(mapMutationError(e, t));
    } finally {
      setLoading(false);
    }
  }, [apiConnected, t]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        action: actionLabel(entry.action, t),
        detail: describeAuditEntry(entry, t),
        when: formatAppDateTime(entry.createdAt, locale, 'short'),
        actor: entry.actorDisplayName || t('users.auditActorUnknown'),
      })),
    [entries, locale, t],
  );

  return (
    <Modal isOpen={open} onClose={onClose} title={t('users.auditLogTitle')} size="large">
      <p className="text-sm text-on-surface-variant mb-4">{t('users.auditLogSubtitle')}</p>

      {error ? (
        <p className="text-sm font-medium rounded-lg px-4 py-2 bg-error-container/30 text-on-error-container mb-4">
          {error}
        </p>
      ) : null}

      {loading && entries.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-6 text-center">{t('users.auditLogLoading')}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-6 text-center">{t('users.auditLogEmpty')}</p>
      ) : (
        <div className="overflow-x-auto max-h-[min(60vh,520px)] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-container-low z-10">
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-black/5">
                <th className="py-3 pr-4">{t('users.auditColWhen')}</th>
                <th className="py-3 pr-4">{t('users.auditColActor')}</th>
                <th className="py-3 pr-4">{t('users.auditColAction')}</th>
                <th className="py-3">{t('users.auditColDetail')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, action, detail, when, actor }) => (
                <tr key={entry.id} className="border-b border-black/5 last:border-0 align-top">
                  <td className="py-3 pr-4 text-on-surface-variant whitespace-nowrap text-xs">{when}</td>
                  <td className="py-3 pr-4">
                    <span className="font-semibold">{actor}</span>
                    {entry.actorUsername ? (
                      <span className="block text-[10px] text-on-surface-variant">{entry.actorUsername}</span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase rounded-full px-2 py-0.5 inline-block',
                        entry.action === 'role.permissions_updated'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface-container-high text-on-surface-variant',
                      )}
                    >
                      {action}
                    </span>
                  </td>
                  <td className="py-3 text-on-surface-variant">{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
