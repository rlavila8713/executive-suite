import type { SqliteStore } from './db.js';
import { ensureConnectedDevicesSchema } from './connectedDevices.js';
import {
  clearRbacUsersOnFactoryReset,
  listRoles,
  migrateRbacSchema,
  PERMISSIONS,
} from './rbac.js';
import type { UserRow, OperatorRow } from './rbac.js';

export type BackupAccessControlSnapshot = {
  roles: { key: string; permissionKeys: string[] }[];
  users: {
    id: string;
    displayName: string;
    username: string | null;
    active: boolean;
    passwordHash: string | null;
    roleKey: string;
    operatorId: string;
    createdAt: number;
    updatedAt: number;
  }[];
  operators: {
    id: string;
    displayName: string;
    userId: string;
    active: boolean;
    createdAt: number;
  }[];
  connectedDevices: {
    deviceId: string;
    clientKind: string;
    userAgent: string;
    firstSeenAt: number;
    lastSeenAt: number;
    revokedAt: number | null;
    operatorName: string;
    operatorId: string | null;
  }[];
};

export function buildAccessControlBackupSnapshot(db: SqliteStore): BackupAccessControlSnapshot {
  migrateRbacSchema(db);
  ensureConnectedDevicesSchema(db);

  const roles = listRoles(db).map((r) => ({ key: r.key, permissionKeys: r.permissionKeys }));

  const userRows = db.prepare('SELECT * FROM users ORDER BY display_name COLLATE NOCASE').all() as UserRow[];
  const users = userRows.map((row) => {
    const role = db
      .prepare(
        `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? LIMIT 1`,
      )
      .get(row.id) as { key: string } | undefined;
    const op = db.prepare('SELECT id FROM operators WHERE user_id = ?').get(row.id) as { id: string } | undefined;
    return {
      id: row.id,
      displayName: row.display_name,
      username: row.username,
      active: row.active === 1,
      passwordHash: row.password_hash,
      roleKey: role?.key ?? 'seller',
      operatorId: op?.id ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const operatorRows = db.prepare('SELECT * FROM operators').all() as OperatorRow[];
  const operators = operatorRows.map((o) => ({
    id: o.id,
    displayName: o.display_name,
    userId: o.user_id,
    active: o.active === 1,
    createdAt: o.created_at,
  }));

  const deviceRows = db.prepare('SELECT * FROM connected_devices').all() as {
    device_id: string;
    client_kind: string;
    user_agent: string;
    first_seen_at: number;
    last_seen_at: number;
    revoked_at: number | null;
    operator_name?: string | null;
    operator_id?: string | null;
  }[];

  const connectedDevices = deviceRows.map((d) => ({
    deviceId: d.device_id,
    clientKind: d.client_kind,
    userAgent: d.user_agent,
    firstSeenAt: d.first_seen_at,
    lastSeenAt: d.last_seen_at,
    revokedAt: d.revoked_at,
    operatorName: d.operator_name ?? '',
    operatorId: d.operator_id ?? null,
  }));

  return { roles, users, operators, connectedDevices };
}

function clearSessionsAndDeviceBindings(db: SqliteStore): void {
  try {
    db.prepare('DELETE FROM auth_sessions').run();
  } catch {
    /* auth schema optional on very old files */
  }
  db.prepare('DELETE FROM connected_devices').run();
}

/** Restores RBAC from v7+ backups; resets to default manager when snapshot is absent (v1–6). */
export function applyAccessControlBackupSnapshot(
  db: SqliteStore,
  snapshot: BackupAccessControlSnapshot | undefined | null,
): void {
  migrateRbacSchema(db);
  ensureConnectedDevicesSchema(db);
  clearSessionsAndDeviceBindings(db);

  db.prepare('DELETE FROM user_roles').run();
  db.prepare('DELETE FROM operators').run();
  db.prepare('DELETE FROM users').run();

  if (!snapshot?.users?.length) {
    clearRbacUsersOnFactoryReset(db);
    return;
  }

  const validPermKeys = new Set(PERMISSIONS.map((p) => p.key));
  const permCatalog = db.prepare('SELECT id, key FROM permissions').all() as { id: string; key: string }[];
  const permIdByKey = new Map(permCatalog.map((p) => [p.key, p.id]));

  for (const role of snapshot.roles ?? []) {
    const roleRow = db.prepare('SELECT id FROM roles WHERE key = ?').get(role.key) as { id: string } | undefined;
    if (!roleRow) continue;
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleRow.id);
    for (const key of role.permissionKeys ?? []) {
      if (!validPermKeys.has(key)) continue;
      const pid = permIdByKey.get(key);
      if (pid) {
        db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(roleRow.id, pid);
      }
    }
  }

  const insertUser = db.prepare(
    `INSERT INTO users (id, display_name, username, active, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const u of snapshot.users) {
    insertUser.run(
      u.id,
      u.displayName,
      u.username,
      u.active ? 1 : 0,
      u.passwordHash,
      u.createdAt,
      u.updatedAt,
    );
  }

  const insertOp = db.prepare(
    `INSERT INTO operators (id, display_name, user_id, active, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const operators =
    snapshot.operators?.length > 0
      ? snapshot.operators
      : snapshot.users.map((u) => ({
          id: u.operatorId || u.id,
          displayName: u.displayName,
          userId: u.id,
          active: u.active,
          createdAt: u.createdAt,
        }));
  for (const o of operators) {
    if (!o.id || !o.userId) continue;
    insertOp.run(o.id, o.displayName, o.userId, o.active ? 1 : 0, o.createdAt);
  }

  const insertUserRole = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
  for (const u of snapshot.users) {
    const roleRow = db.prepare('SELECT id FROM roles WHERE key = ?').get(u.roleKey) as { id: string } | undefined;
    if (roleRow) insertUserRole.run(u.id, roleRow.id);
  }

  const insertDevice = db.prepare(
    `INSERT INTO connected_devices (device_id, client_kind, user_agent, first_seen_at, last_seen_at, revoked_at, operator_name, operator_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const d of snapshot.connectedDevices ?? []) {
    insertDevice.run(
      d.deviceId,
      d.clientKind,
      d.userAgent,
      d.firstSeenAt,
      d.lastSeenAt,
      d.revokedAt,
      d.operatorName ?? '',
      d.operatorId,
    );
  }
}
