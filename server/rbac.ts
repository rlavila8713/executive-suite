import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import { ensureConnectedDevicesSchema } from './connectedDevices.js';
import { ApiError } from './apiError.js';
import type { ClientKind } from './connectedDevices.js';

export type PermissionScope = 'web' | 'mobile' | 'both';

export type PermissionGroupId =
  | 'sales'
  | 'cash'
  | 'inventory'
  | 'warehouse'
  | 'catalog'
  | 'reports'
  | 'administration';

export type PermissionDef = {
  key: string;
  description: string;
  scope: PermissionScope;
  group: PermissionGroupId;
};

/** Stable permission keys used by API and clients. */
export const PERMISSIONS: PermissionDef[] = [
  { key: 'sales.checkout', description: 'Create sales', scope: 'both', group: 'sales' },
  { key: 'sales.reverse', description: 'Reverse sales', scope: 'both', group: 'sales' },
  { key: 'cash.session', description: 'Open and close cash sessions', scope: 'both', group: 'cash' },
  { key: 'inventory.view', description: 'View store inventory', scope: 'both', group: 'inventory' },
  { key: 'warehouse.receive', description: 'Warehouse stock entries', scope: 'both', group: 'warehouse' },
  { key: 'warehouse.transfer', description: 'Transfer warehouse stock to store', scope: 'both', group: 'warehouse' },
  { key: 'catalog.view', description: 'View products and customers', scope: 'both', group: 'catalog' },
  { key: 'catalog.edit', description: 'Edit catalog', scope: 'web', group: 'catalog' },
  { key: 'reports.view', description: 'View reports', scope: 'web', group: 'reports' },
  { key: 'users.manage', description: 'Manage users and roles', scope: 'web', group: 'administration' },
  { key: 'devices.manage', description: 'Assign devices and operators', scope: 'web', group: 'administration' },
  { key: 'settings.manage', description: 'Store settings and license', scope: 'web', group: 'administration' },
  { key: 'admin.dangerous', description: 'Factory reset and diagnostics', scope: 'web', group: 'administration' },
];

export const PERMISSION_GROUP_ORDER: PermissionGroupId[] = [
  'sales',
  'cash',
  'inventory',
  'warehouse',
  'catalog',
  'reports',
  'administration',
];

export type MobileModuleDef = {
  id: string;
  permissions: string[];
  /** If true, user needs every permission; otherwise any one. */
  requireAll?: boolean;
};

export const MOBILE_MODULES: MobileModuleDef[] = [
  { id: 'pos', permissions: ['sales.checkout'] },
  { id: 'cash', permissions: ['cash.session'] },
  { id: 'inventory', permissions: ['inventory.view'] },
  { id: 'warehouse', permissions: ['warehouse.receive', 'warehouse.transfer'] },
  { id: 'customers', permissions: ['catalog.view'] },
];

export const ROLE_MANAGER = 'manager';
export const ROLE_SELLER = 'seller';

/** Default grants for new installs (editable later from the web UI). */
export const DEFAULT_MANAGER_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const DEFAULT_SELLER_PERMISSION_KEYS = [
  'cash.session',
  'catalog.view',
  'inventory.view',
  'sales.checkout',
];

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  system: number;
};

export type UserRow = {
  id: string;
  display_name: string;
  username: string | null;
  active: number;
  password_hash: string | null;
  created_at: number;
  updated_at: number;
};

export type OperatorRow = {
  id: string;
  display_name: string;
  user_id: string;
  active: number;
  created_at: number;
};

export type AppUser = {
  id: string;
  displayName: string;
  username: string | null;
  active: boolean;
  roleKey: string;
  roleName: string;
  operatorId: string;
  createdAt: number;
  updatedAt: number;
};

export type AppRole = {
  id: string;
  key: string;
  name: string;
  system: boolean;
  permissionKeys: string[];
};

export type AppPermission = {
  key: string;
  description: string;
  scope: PermissionScope;
  group: PermissionGroupId;
};

export type DeviceAccessContext = {
  deviceId: string;
  operator: { id: string; displayName: string } | null;
  user: { id: string; displayName: string; username: string | null; roleKey: string } | null;
  permissions: string[];
  mobileModules: string[];
  auth: { mode: 'device' | 'session'; loginRequired: boolean };
};

function tableColumns(db: SqliteStore, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

function hasColumn(db: SqliteStore, table: string, column: string): boolean {
  return tableColumns(db, table).includes(column);
}

export function migrateRbacSchema(db: SqliteStore): void {
  ensureConnectedDevicesSchema(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT 'both'
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (permission_id) REFERENCES permissions(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      username TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_operators_display_name ON operators(display_name);
  `);

  if (!hasColumn(db, 'connected_devices', 'operator_id')) {
    db.exec(`ALTER TABLE connected_devices ADD COLUMN operator_id TEXT`);
  }
  if (!hasColumn(db, 'transactions', 'operator_id')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN operator_id TEXT`);
  }

  seedRbacIfEmpty(db);
  backfillOperatorsFromLegacyNames(db);
  bootstrapDefaultManagerUser(db);
  linkDevicesToOperatorsByName(db);
}

function seedRbacIfEmpty(db: SqliteStore): void {
  const permCount = db.prepare('SELECT COUNT(*) AS c FROM permissions').get() as { c: number };
  if (permCount.c === 0) {
    for (const p of PERMISSIONS) {
      db.prepare('INSERT INTO permissions (id, key, description, scope) VALUES (?, ?, ?, ?)').run(
        newId(),
        p.key,
        p.description,
        p.scope,
      );
    }
  } else {
    for (const p of PERMISSIONS) {
      db.prepare(
        `INSERT OR IGNORE INTO permissions (id, key, description, scope) VALUES (?, ?, ?, ?)`,
      ).run(newId(), p.key, p.description, p.scope);
    }
  }

  const roleCount = db.prepare('SELECT COUNT(*) AS c FROM roles').get() as { c: number };
  let managerRoleId: string;
  let sellerRoleId: string;

  if (roleCount.c === 0) {
    managerRoleId = newId();
    sellerRoleId = newId();
    db.prepare('INSERT INTO roles (id, key, name, system) VALUES (?, ?, ?, 1)').run(
      managerRoleId,
      ROLE_MANAGER,
      'Encargado',
    );
    db.prepare('INSERT INTO roles (id, key, name, system) VALUES (?, ?, ?, 1)').run(
      sellerRoleId,
      ROLE_SELLER,
      'Vendedor',
    );
  } else {
    managerRoleId = (db.prepare('SELECT id FROM roles WHERE key = ?').get(ROLE_MANAGER) as { id: string }).id;
    sellerRoleId = (db.prepare('SELECT id FROM roles WHERE key = ?').get(ROLE_SELLER) as { id: string }).id;
  }

  const permRows = db.prepare('SELECT id, key FROM permissions').all() as { id: string; key: string }[];
  const permByKey = new Map(permRows.map((r) => [r.key, r.id]));

  for (const key of DEFAULT_MANAGER_PERMISSION_KEYS) {
    const pid = permByKey.get(key);
    if (!pid) continue;
    db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(
      managerRoleId,
      pid,
    );
  }
  for (const key of DEFAULT_SELLER_PERMISSION_KEYS) {
    const pid = permByKey.get(key);
    if (!pid) continue;
    db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(
      sellerRoleId,
      pid,
    );
  }
}

function distinctLegacyOperatorNames(db: SqliteStore): string[] {
  const names = new Set<string>();
  const deviceRows = db.prepare('SELECT operator_name FROM connected_devices').all() as {
    operator_name?: string | null;
  }[];
  for (const row of deviceRows) {
    const n = (row.operator_name ?? '').trim();
    if (n) names.add(n);
  }
  const txRows = db.prepare(
    `SELECT DISTINCT operator_name FROM transactions WHERE operator_name IS NOT NULL AND TRIM(operator_name) != ''`,
  ).all() as { operator_name: string }[];
  for (const row of txRows) {
    const n = row.operator_name.trim();
    if (n) names.add(n);
  }
  return [...names];
}

function createUserWithOperator(
  db: SqliteStore,
  displayName: string,
  roleKey: string,
  active = true,
): { userId: string; operatorId: string } {
  const now = Date.now();
  const userId = newId();
  const operatorId = newId();
  const role = db.prepare('SELECT id FROM roles WHERE key = ?').get(roleKey) as { id: string } | undefined;
  if (!role) throw new Error(`Role not found: ${roleKey}`);

  db.prepare(
    `INSERT INTO users (id, display_name, username, active, password_hash, created_at, updated_at)
     VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
  ).run(userId, displayName.trim().slice(0, 120), active ? 1 : 0, now, now);
  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id);
  db.prepare(
    `INSERT INTO operators (id, display_name, user_id, active, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(operatorId, displayName.trim().slice(0, 80), userId, active ? 1 : 0, now);
  return { userId, operatorId };
}

function ensureOperatorForDisplayName(
  db: SqliteStore,
  name: string,
): { operatorId: string; displayName: string; userId: string } {
  const existingId = findOperatorIdByDisplayName(db, name);
  if (existingId) {
    const op = db
      .prepare('SELECT id, display_name, user_id FROM operators WHERE id = ?')
      .get(existingId) as OperatorRow;
    return { operatorId: op.id, displayName: op.display_name.trim(), userId: op.user_id };
  }
  const created = createUserWithOperator(db, name, ROLE_SELLER, true);
  return { operatorId: created.operatorId, displayName: name.trim(), userId: created.userId };
}

function findOperatorIdByDisplayName(db: SqliteStore, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const row = db
    .prepare(`SELECT id FROM operators WHERE LOWER(TRIM(display_name)) = LOWER(?) AND active = 1 LIMIT 1`)
    .get(trimmed) as { id: string } | undefined;
  return row?.id ?? null;
}

/** Create operators + seller users for historical operator_name strings. */
function backfillOperatorsFromLegacyNames(db: SqliteStore): void {
  for (const name of distinctLegacyOperatorNames(db)) {
    if (findOperatorIdByDisplayName(db, name)) continue;
    const existingUser = db
      .prepare(`SELECT id FROM users WHERE LOWER(TRIM(display_name)) = LOWER(?) LIMIT 1`)
      .get(name) as { id: string } | undefined;
    if (existingUser) {
      const op = db.prepare('SELECT id FROM operators WHERE user_id = ?').get(existingUser.id) as
        | { id: string }
        | undefined;
      if (!op) {
        db.prepare(
          `INSERT INTO operators (id, display_name, user_id, active, created_at) VALUES (?, ?, ?, 1, ?)`,
        ).run(newId(), name.slice(0, 80), existingUser.id, Date.now());
      }
      continue;
    }
    createUserWithOperator(db, name, ROLE_SELLER, true);
  }
}

function bootstrapDefaultManagerUser(db: SqliteStore): void {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  if (count.c > 0) return;

  const settings = db.prepare('SELECT manager_name FROM app_settings WHERE id = ?').get('main') as
    | { manager_name: string }
    | undefined;
  const name = (settings?.manager_name ?? 'Encargado').trim() || 'Encargado';
  createUserWithOperator(db, name, ROLE_MANAGER, true);
}

function linkDevicesToOperatorsByName(db: SqliteStore): void {
  const rows = db
    .prepare(`SELECT device_id, operator_name, operator_id FROM connected_devices WHERE operator_id IS NULL`)
    .all() as { device_id: string; operator_name?: string | null; operator_id?: string | null }[];
  for (const row of rows) {
    const name = (row.operator_name ?? '').trim();
    if (!name) continue;
    const opId = findOperatorIdByDisplayName(db, name);
    if (opId) {
      db.prepare('UPDATE connected_devices SET operator_id = ? WHERE device_id = ?').run(opId, row.device_id);
    }
  }
}

export function clearRbacUsersOnFactoryReset(db: SqliteStore): void {
  db.prepare('DELETE FROM user_roles').run();
  db.prepare('DELETE FROM operators').run();
  db.prepare('DELETE FROM users').run();
  bootstrapDefaultManagerUser(db);
}

export function permissionKeysForUser(db: SqliteStore, userId: string): string[] {
  const role = db
    .prepare(
      `SELECT r.key AS role_key FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? LIMIT 1`,
    )
    .get(userId) as { role_key: string } | undefined;
  if (!role) return [];

  const rows = db
    .prepare(
      `SELECT p.key FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ?`,
    )
    .all(userId) as { key: string }[];
  return [...new Set(rows.map((r) => r.key))];
}

export function mobileModulesForPermissions(permissions: string[]): string[] {
  const set = new Set(permissions);
  const modules: string[] = [];
  for (const mod of MOBILE_MODULES) {
    const ok = mod.requireAll
      ? mod.permissions.every((p) => set.has(p))
      : mod.permissions.some((p) => set.has(p));
    if (ok) modules.push(mod.id);
  }
  return modules;
}

export function getOperatorForDevice(
  db: SqliteStore,
  deviceId: string,
): { operatorId: string; operatorName: string; userId: string } | null {
  ensureConnectedDevicesSchema(db);
  const row = db
    .prepare(`SELECT operator_id, operator_name FROM connected_devices WHERE device_id = ?`)
    .get(deviceId) as { operator_id?: string | null; operator_name?: string | null } | undefined;
  if (!row) return null;

  if (row.operator_id) {
    const op = db
      .prepare(`SELECT o.id, o.display_name, o.user_id, o.active FROM operators o WHERE o.id = ?`)
      .get(row.operator_id) as OperatorRow | undefined;
    if (op && op.active) {
      return { operatorId: op.id, operatorName: op.display_name.trim(), userId: op.user_id };
    }
  }

  const legacyName = (row.operator_name ?? '').trim();
  if (!legacyName) return null;
  const opId = findOperatorIdByDisplayName(db, legacyName);
  if (opId) {
    const op = db.prepare('SELECT id, display_name, user_id FROM operators WHERE id = ?').get(opId) as OperatorRow;
    return { operatorId: op.id, operatorName: op.display_name.trim(), userId: op.user_id };
  }
  return null;
}

function readLoginRequired(db: SqliteStore): boolean {
  const row = db.prepare('SELECT auth_login_required FROM app_settings WHERE id = ?').get('main') as
    | { auth_login_required?: number }
    | undefined;
  return (row?.auth_login_required ?? 0) === 1;
}

export function resolveDeviceAccessContext(db: SqliteStore, deviceId: string): DeviceAccessContext {
  const loginRequired = readLoginRequired(db);
  const binding = getOperatorForDevice(db, deviceId);
  if (!binding) {
    return {
      deviceId,
      operator: null,
      user: null,
      permissions: [],
      mobileModules: [],
      auth: { mode: 'device', loginRequired },
    };
  }

  const user = db
    .prepare('SELECT id, display_name, username, active FROM users WHERE id = ?')
    .get(binding.userId) as UserRow | undefined;
  if (!user || !user.active) {
    return {
      deviceId,
      operator: { id: binding.operatorId, displayName: binding.operatorName },
      user: null,
      permissions: [],
      mobileModules: [],
      auth: { mode: 'device', loginRequired },
    };
  }

  const roleRow = db
    .prepare(
      `SELECT r.key, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? LIMIT 1`,
    )
    .get(user.id) as { key: string; name: string } | undefined;

  const permissions = permissionKeysForUser(db, user.id);
  return {
    deviceId,
    operator: { id: binding.operatorId, displayName: binding.operatorName },
    user: {
      id: user.id,
      displayName: user.display_name,
      username: user.username?.trim() || null,
      roleKey: roleRow?.key ?? ROLE_SELLER,
    },
    permissions,
    mobileModules: mobileModulesForPermissions(permissions),
    auth: { mode: 'device', loginRequired },
  };
}

function permissionKeysForRoleId(db: SqliteStore, roleId: string): string[] {
  const permRows = db
    .prepare(
      `SELECT p.key FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ? ORDER BY p.key`,
    )
    .all(roleId) as { key: string }[];
  return permRows.map((p) => p.key);
}

export function listPermissions(db: SqliteStore): AppPermission[] {
  const rows = db.prepare('SELECT key, description, scope FROM permissions ORDER BY key').all() as {
    key: string;
    description: string;
    scope: string;
  }[];
  const groupByKey = new Map(PERMISSIONS.map((p) => [p.key, p.group]));
  return rows.map((row) => ({
    key: row.key,
    description: row.description,
    scope: row.scope as PermissionScope,
    group: groupByKey.get(row.key) ?? 'administration',
  }));
}

export function updateRolePermissions(db: SqliteStore, roleKey: string, permissionKeys: string[]): AppRole {
  const role = db.prepare('SELECT id, key, name, system FROM roles WHERE key = ?').get(roleKey) as RoleRow | undefined;
  if (!role) throw new ApiError(404, 'Role not found', 'ERR_ROLE_NOT_FOUND');
  if (roleKey !== ROLE_MANAGER && roleKey !== ROLE_SELLER) {
    throw new ApiError(400, 'Only system roles can be updated', 'ERR_ROLE_NOT_EDITABLE');
  }

  const unique = [...new Set(permissionKeys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new ApiError(400, 'At least one permission is required', 'ERR_ROLE_PERMISSIONS_EMPTY');
  }

  const catalog = db.prepare('SELECT id, key FROM permissions').all() as { id: string; key: string }[];
  const byKey = new Map(catalog.map((p) => [p.key, p.id]));
  for (const key of unique) {
    if (!byKey.has(key)) throw new ApiError(400, `Unknown permission: ${key}`, 'ERR_INVALID_PERMISSION');
  }

  db.runInTransaction(() => {
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(role.id);
    for (const key of unique) {
      const pid = byKey.get(key)!;
      db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(role.id, pid);
    }
  });

  try {
    db.prepare('DELETE FROM auth_sessions').run();
  } catch {
    /* auth schema not migrated yet */
  }

  return {
    id: role.id,
    key: role.key,
    name: role.name,
    system: role.system === 1,
    permissionKeys: permissionKeysForRoleId(db, role.id),
  };
}

export function listRoles(db: SqliteStore): AppRole[] {
  const roles = db.prepare('SELECT id, key, name, system FROM roles ORDER BY key').all() as RoleRow[];
  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    system: role.system === 1,
    permissionKeys: permissionKeysForRoleId(db, role.id),
  }));
}

function mapUserRow(db: SqliteStore, row: UserRow): AppUser {
  const role = db
    .prepare(
      `SELECT r.key, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? LIMIT 1`,
    )
    .get(row.id) as { key: string; name: string } | undefined;
  const op = db.prepare('SELECT id FROM operators WHERE user_id = ?').get(row.id) as { id: string } | undefined;
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
    active: row.active === 1,
    roleKey: role?.key ?? ROLE_SELLER,
    roleName: role?.name ?? 'Vendedor',
    operatorId: op?.id ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listUsers(db: SqliteStore): AppUser[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY display_name COLLATE NOCASE').all() as UserRow[];
  return rows.map((r) => mapUserRow(db, r));
}

export type OperatorOption = {
  id: string;
  displayName: string;
  userId: string;
  roleKey: string;
  active: boolean;
};

export function listActiveOperators(db: SqliteStore): OperatorOption[] {
  const rows = db
    .prepare(
      `SELECT o.id, o.display_name, o.user_id, o.active, r.key AS role_key
       FROM operators o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE o.active = 1 AND u.active = 1
       ORDER BY o.display_name COLLATE NOCASE`,
    )
    .all() as { id: string; display_name: string; user_id: string; active: number; role_key: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    userId: r.user_id,
    roleKey: r.role_key ?? ROLE_SELLER,
    active: r.active === 1,
  }));
}

export function createAppUser(
  db: SqliteStore,
  input: { displayName: string; roleKey: string; username?: string | null },
): AppUser {
  const name = input.displayName.trim();
  if (!name) throw new ApiError(400, 'Display name required', 'ERR_USER_NAME_REQUIRED');
  const roleKey = input.roleKey === ROLE_MANAGER ? ROLE_MANAGER : ROLE_SELLER;
  const role = db.prepare('SELECT id FROM roles WHERE key = ?').get(roleKey) as { id: string } | undefined;
  if (!role) throw new ApiError(400, 'Invalid role', 'ERR_INVALID_ROLE');

  const username = input.username?.trim() || null;
  if (username) {
    const clash = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: string } | undefined;
    if (clash) throw new ApiError(409, 'Username already in use', 'ERR_DUPLICATE_USERNAME');
  }

  const now = Date.now();
  const userId = newId();
  const operatorId = newId();
  db.prepare(
    `INSERT INTO users (id, display_name, username, active, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?)`,
  ).run(userId, name.slice(0, 120), username, now, now);
  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id);
  db.prepare(
    `INSERT INTO operators (id, display_name, user_id, active, created_at) VALUES (?, ?, ?, 1, ?)`,
  ).run(operatorId, name.slice(0, 80), userId, now);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  return mapUserRow(db, row);
}

export function updateAppUser(
  db: SqliteStore,
  userId: string,
  input: { displayName?: string; roleKey?: string; active?: boolean; username?: string | null },
): AppUser {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!existing) throw new ApiError(404, 'User not found', 'ERR_USER_NOT_FOUND');

  const now = Date.now();
  const displayName = input.displayName !== undefined ? input.displayName.trim() : existing.display_name;
  if (!displayName) throw new ApiError(400, 'Display name required', 'ERR_USER_NAME_REQUIRED');

  let username = existing.username;
  if (input.username !== undefined) {
    username = input.username?.trim() || null;
    if (username) {
      const clash = db
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .get(username, userId) as { id: string } | undefined;
      if (clash) throw new ApiError(409, 'Username already in use', 'ERR_DUPLICATE_USERNAME');
    }
  }

  const active = input.active !== undefined ? (input.active ? 1 : 0) : existing.active;

  db.prepare(
    `UPDATE users SET display_name = ?, username = ?, active = ?, updated_at = ? WHERE id = ?`,
  ).run(displayName.slice(0, 120), username, active, now, userId);

  if (input.roleKey !== undefined) {
    const roleKey = input.roleKey === ROLE_MANAGER ? ROLE_MANAGER : ROLE_SELLER;
    const role = db.prepare('SELECT id FROM roles WHERE key = ?').get(roleKey) as { id: string } | undefined;
    if (!role) throw new ApiError(400, 'Invalid role', 'ERR_INVALID_ROLE');
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id);
    try {
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
    } catch {
      /* auth schema optional */
    }
  }

  db.prepare(`UPDATE operators SET display_name = ?, active = ? WHERE user_id = ?`).run(
    displayName.slice(0, 80),
    active,
    userId,
  );

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  return mapUserRow(db, row);
}

export function setDeviceOperatorAssignment(
  db: SqliteStore,
  deviceId: string,
  input: { operatorId?: string; operatorName?: string },
): { operatorId: string | null; operatorName: string } {
  ensureConnectedDevicesSchema(db);
  const exists = db.prepare('SELECT device_id FROM connected_devices WHERE device_id = ?').get(deviceId) as
    | { device_id: string }
    | undefined;
  if (!exists) throw new ApiError(404, 'Device not found', 'ERR_DEVICE_NOT_FOUND');

  let operatorId: string | null = null;
  let operatorName = '';

  if (input.operatorId?.trim()) {
    const op = db
      .prepare(
        `SELECT o.id, o.display_name, o.active, u.active AS user_active
         FROM operators o JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
      )
      .get(input.operatorId.trim()) as
      | { id: string; display_name: string; active: number; user_active: number }
      | undefined;
    if (!op || !op.active || !op.user_active) {
      throw new ApiError(400, 'Invalid or inactive operator', 'ERR_INVALID_OPERATOR');
    }
    operatorId = op.id;
    operatorName = op.display_name.trim();
  } else if (input.operatorName !== undefined) {
    const legacy = input.operatorName.trim().slice(0, 80);
    operatorName = legacy;
    if (legacy) {
      const ensured = ensureOperatorForDisplayName(db, legacy);
      operatorId = ensured.operatorId;
      operatorName = ensured.displayName;
    }
  }

  db.prepare('UPDATE connected_devices SET operator_id = ?, operator_name = ? WHERE device_id = ?').run(
    operatorId,
    operatorName,
    deviceId,
  );

  return { operatorId, operatorName };
}

export function deviceOperatorDisplayName(db: SqliteStore, deviceId: string): string {
  const binding = getOperatorForDevice(db, deviceId);
  if (binding) return binding.operatorName;
  const row = db
    .prepare('SELECT operator_name FROM connected_devices WHERE device_id = ?')
    .get(deviceId) as { operator_name?: string | null } | undefined;
  return (row?.operator_name ?? '').trim();
}
