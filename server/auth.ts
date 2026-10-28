import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import { ApiError } from './apiError.js';
import { inferClientKind, type ClientKind } from './connectedDevices.js';
import {
  ROLE_MANAGER,
  mobileModulesForPermissions,
  permissionKeysForUser,
  resolveDeviceAccessContext,
  setDeviceOperatorAssignment,
  type DeviceAccessContext,
} from './rbac.js';
import { hashPassword, verifyPassword, validatePasswordForRole } from './password.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export type AuthSettings = {
  loginRequired: boolean;
  sessionTtlMs: number;
};

export type SessionRow = {
  id: string;
  user_id: string;
  device_id: string | null;
  token_hash: string;
  expires_at: number;
  created_at: number;
  last_seen_at: number;
};

export function migrateAuthSchema(db: SqliteStore): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
  `);

  const cols = db.prepare('PRAGMA table_info(app_settings)').all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('auth_login_required')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN auth_login_required INTEGER NOT NULL DEFAULT 0`);
  }
  const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  const userNames = new Set(userCols.map((c) => c.name));
  if (!userNames.has('failed_login_attempts')) {
    db.exec(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
  }
  if (!userNames.has('locked_until')) {
    db.exec(`ALTER TABLE users ADD COLUMN locked_until INTEGER`);
  }
}

export function getAuthSettings(db: SqliteStore): AuthSettings {
  migrateAuthSchema(db);
  const row = db.prepare('SELECT auth_login_required FROM app_settings WHERE id = ?').get('main') as
    | { auth_login_required?: number }
    | undefined;
  return {
    loginRequired: (row?.auth_login_required ?? 0) === 1,
    sessionTtlMs: SESSION_TTL_MS,
  };
}

export function setLoginRequired(db: SqliteStore, loginRequired: boolean): void {
  migrateAuthSchema(db);
  db.prepare('UPDATE app_settings SET auth_login_required = ? WHERE id = ?').run(loginRequired ? 1 : 0, 'main');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function roleKeyForUser(db: SqliteStore, userId: string): string {
  const row = db
    .prepare(
      `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? LIMIT 1`,
    )
    .get(userId) as { key: string } | undefined;
  return row?.key ?? 'seller';
}

function operatorForUser(db: SqliteStore, userId: string): { id: string; displayName: string } | null {
  const op = db
    .prepare('SELECT id, display_name FROM operators WHERE user_id = ? AND active = 1 LIMIT 1')
    .get(userId) as { id: string; display_name: string } | undefined;
  if (!op) return null;
  return { id: op.id, displayName: op.display_name.trim() };
}

export function buildAccessContextForUser(
  db: SqliteStore,
  deviceId: string,
  userId: string,
  mode: 'session' | 'device',
  loginRequired: boolean,
): DeviceAccessContext {
  const user = db
    .prepare('SELECT id, display_name, username, active FROM users WHERE id = ?')
    .get(userId) as
    | { id: string; display_name: string; username: string | null; active: number }
    | undefined;
  if (!user || !user.active) {
    throw new ApiError(403, 'User inactive', 'ERR_USER_INACTIVE');
  }
  const roleKey = roleKeyForUser(db, userId);
  const permissions = permissionKeysForUser(db, userId);
  const operator = operatorForUser(db, userId);
  return {
    deviceId,
    operator,
    user: {
      id: user.id,
      displayName: user.display_name,
      username: user.username?.trim() || null,
      roleKey,
    },
    permissions,
    mobileModules: mobileModulesForPermissions(permissions),
    auth: { mode, loginRequired },
  };
}

export function needsPasswordBootstrap(db: SqliteStore): boolean {
  migrateAuthSchema(db);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.key = ? AND u.password_hash IS NOT NULL AND TRIM(u.password_hash) != ''`,
    )
    .get(ROLE_MANAGER) as { c: number };
  return row.c === 0;
}

export function revokeAllSessionsForUser(db: SqliteStore, userId: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
}

export function revokeSessionByToken(db: SqliteStore, token: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(token));
}

export function revokeAllSessions(db: SqliteStore): void {
  db.prepare('DELETE FROM auth_sessions').run();
}

function createSession(db: SqliteStore, userId: string, deviceId: string | null): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const id = newId();
  db.prepare(
    `INSERT INTO auth_sessions (id, user_id, device_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, deviceId, hashToken(token), expiresAt, now, now);
  return { token, expiresAt };
}

export type LoginResult = {
  token: string;
  expiresAt: number;
  access: DeviceAccessContext;
};

export function loginWithCredentials(
  db: SqliteStore,
  username: string,
  password: string,
  deviceId: string,
): LoginResult {
  migrateAuthSchema(db);
  const login = username.trim().toLowerCase();
  if (!login || !password) {
    throw new ApiError(400, 'Username and password required', 'ERR_AUTH_INVALID');
  }

  const user = db
    .prepare('SELECT * FROM users WHERE LOWER(TRIM(username)) = ?')
    .get(login) as
    | {
        id: string;
        display_name: string;
        active: number;
        password_hash: string | null;
        failed_login_attempts?: number;
        locked_until?: number | null;
      }
    | undefined;

  if (!user || !user.active) {
    throw new ApiError(401, 'Invalid credentials', 'ERR_AUTH_INVALID');
  }

  const now = Date.now();
  if (user.locked_until != null && user.locked_until > now) {
    throw new ApiError(429, 'Account temporarily locked', 'ERR_AUTH_LOCKED');
  }

  if (!verifyPassword(password, user.password_hash)) {
    const attempts = (user.failed_login_attempts ?? 0) + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : null;
    db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
      attempts,
      lockedUntil,
      user.id,
    );
    throw new ApiError(401, 'Invalid credentials', 'ERR_AUTH_INVALID');
  }

  db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

  if (deviceId) {
    const operator = operatorForUser(db, user.id);
    if (operator) {
      try {
        setDeviceOperatorAssignment(db, deviceId, { operatorId: operator.id });
      } catch {
        /* Device row may not exist yet on first contact; next API touch will create it. */
      }
    }
  }

  const { token, expiresAt } = createSession(db, user.id, deviceId || null);
  const settings = getAuthSettings(db);
  const access = buildAccessContextForUser(db, deviceId, user.id, 'session', settings.loginRequired);
  return { token, expiresAt, access };
}

export function bootstrapManagerPassword(
  db: SqliteStore,
  input: { username: string; password: string },
): void {
  if (!needsPasswordBootstrap(db)) {
    throw new ApiError(409, 'Bootstrap already completed', 'ERR_AUTH_BOOTSTRAP_DONE');
  }
  const manager = db
    .prepare(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.key = ?
       ORDER BY u.created_at ASC LIMIT 1`,
    )
    .get(ROLE_MANAGER) as { id: string } | undefined;
  if (!manager) {
    throw new ApiError(409, 'No manager user to bootstrap', 'ERR_AUTH_NO_MANAGER');
  }
  const username = input.username.trim();
  if (!username) throw new ApiError(400, 'Username required', 'ERR_AUTH_USERNAME_REQUIRED');
  const roleKey = roleKeyForUser(db, manager.id);
  const policyError = validatePasswordForRole(roleKey, input.password);
  if (policyError) throw new ApiError(400, policyError, 'ERR_AUTH_WEAK_PASSWORD');

  const clash = db
    .prepare('SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?) AND id != ?')
    .get(username, manager.id) as { id: string } | undefined;
  if (clash) throw new ApiError(409, 'Username already taken', 'ERR_AUTH_USERNAME_TAKEN');

  const hash = hashPassword(input.password.trim());
  db.prepare('UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?').run(
    username,
    hash,
    Date.now(),
    manager.id,
  );
}

export function setUserPassword(
  db: SqliteStore,
  userId: string,
  newPassword: string,
  revokeSessions = true,
): void {
  const roleKey = roleKeyForUser(db, userId);
  const policyError = validatePasswordForRole(roleKey, newPassword);
  if (policyError) throw new ApiError(400, policyError, 'ERR_AUTH_WEAK_PASSWORD');
  const hash = hashPassword(newPassword.trim());
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hash,
    Date.now(),
    userId,
  );
  if (revokeSessions) revokeAllSessionsForUser(db, userId);
}

export function resolveSessionUserId(db: SqliteStore, token: string | undefined): string | null {
  if (!token?.trim()) return null;
  migrateAuthSchema(db);
  const hash = hashToken(token.trim());
  const now = Date.now();
  const row = db
    .prepare('SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?')
    .get(hash) as { user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at < now) {
    if (row) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hash);
    return null;
  }
  db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, hash);
  return row.user_id;
}

export function bearerTokenFromRequest(req: Request): string | undefined {
  const header = req.header('Authorization')?.trim();
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return undefined;
}

export function clientKindFromRequest(req: Request): ClientKind {
  return inferClientKind(req.header('User-Agent') ?? '', req.header('X-Client-Kind') ?? undefined);
}

export function resolveEffectiveAccess(
  db: SqliteStore,
  deviceId: string,
  req: Request,
): DeviceAccessContext {
  const settings = getAuthSettings(db);
  const token = bearerTokenFromRequest(req);
  const sessionUserId = resolveSessionUserId(db, token);
  if (sessionUserId) {
    return buildAccessContextForUser(db, deviceId, sessionUserId, 'session', settings.loginRequired);
  }
  return resolveDeviceAccessContext(db, deviceId);
}

export function assertAuthenticatedAccess(
  db: SqliteStore,
  deviceId: string,
  req: Request,
  permission?: string,
): DeviceAccessContext {
  const settings = getAuthSettings(db);
  const kind = clientKindFromRequest(req);
  const ctx = resolveEffectiveAccess(db, deviceId, req);
  const hasSession = ctx.auth.mode === 'session';

  if (settings.loginRequired && !hasSession) {
    throw new ApiError(401, 'Login required', 'ERR_LOGIN_REQUIRED');
  }

  if (kind === 'mobile' && permission) {
    if (!ctx.operator && settings.loginRequired) {
      throw new ApiError(409, 'Assign an operator to this user', 'ERR_OPERATOR_REQUIRED');
    }
    if (!ctx.operator && !settings.loginRequired) {
      const deviceCtx = resolveDeviceAccessContext(db, deviceId);
      if (!deviceCtx.operator) {
        throw new ApiError(409, 'Assign an operator to this device before continuing', 'ERR_OPERATOR_REQUIRED');
      }
      if (!deviceCtx.permissions.includes(permission)) {
        throw new ApiError(403, 'Permission denied', 'ERR_PERMISSION_DENIED');
      }
      return deviceCtx;
    }
    if (!ctx.permissions.includes(permission)) {
      throw new ApiError(403, 'Permission denied', 'ERR_PERMISSION_DENIED');
    }
  }

  if (kind === 'web' && settings.loginRequired && !hasSession) {
    throw new ApiError(401, 'Login required', 'ERR_LOGIN_REQUIRED');
  }

  if (kind === 'web' && permission && hasSession && !ctx.permissions.includes(permission)) {
    throw new ApiError(403, 'Permission denied', 'ERR_PERMISSION_DENIED');
  }

  return ctx;
}

export function assertDevicePermission(
  db: SqliteStore,
  deviceId: string,
  permission: string,
  _clientKind: ClientKind,
  req: Request,
): void {
  assertAuthenticatedAccess(db, deviceId, req, permission);
}

export function getOperatorBindingForRequest(
  db: SqliteStore,
  deviceId: string,
  req: Request,
): { operatorId: string | null; operatorName: string } {
  const ctx = resolveEffectiveAccess(db, deviceId, req);
  if (ctx.operator) {
    return { operatorId: ctx.operator.id, operatorName: ctx.operator.displayName };
  }
  const legacy = resolveDeviceAccessContext(db, deviceId);
  return {
    operatorId: legacy.operator?.id ?? null,
    operatorName: legacy.operator?.displayName ?? '',
  };
}

export const AUTH_PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/bootstrap',
  '/auth/status',
  '/auth/session',
]);

export function isAuthPublicPath(apiPath: string): boolean {
  return AUTH_PUBLIC_PATHS.has(apiPath);
}
