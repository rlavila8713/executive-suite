import type { Request } from 'express';
import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import { bearerTokenFromRequest, resolveEffectiveAccess } from './auth.js';

export type UserAdminAuditAction =
  | 'user.created'
  | 'user.updated'
  | 'user.password_set'
  | 'role.permissions_updated';

export type UserAdminAuditDetails = Record<string, unknown>;

export type UserAdminAuditEntry = {
  id: string;
  action: UserAdminAuditAction;
  createdAt: number;
  actorUserId: string | null;
  actorDisplayName: string;
  actorUsername: string | null;
  deviceId: string | null;
  details: UserAdminAuditDetails;
};

export function migrateUserAuditSchema(db: SqliteStore): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_admin_audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      actor_user_id TEXT,
      actor_display_name TEXT NOT NULL DEFAULT '',
      actor_username TEXT,
      device_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_user_admin_audit_created ON user_admin_audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_admin_audit_action ON user_admin_audit_log(action);
  `);
}

export function clearUserAdminAuditLog(db: SqliteStore): void {
  migrateUserAuditSchema(db);
  db.prepare('DELETE FROM user_admin_audit_log').run();
}

type AuditActor = {
  userId: string | null;
  displayName: string;
  username: string | null;
};

export function resolveAuditActorFromRequest(db: SqliteStore, req: Request): AuditActor {
  const deviceId = req.header('X-Device-Id')?.trim() ?? '';
  if (deviceId) {
    const access = resolveEffectiveAccess(db, deviceId, req);
    if (access.user) {
      return {
        userId: access.user.id,
        displayName: access.user.displayName.trim() || access.user.username || 'Usuario',
        username: access.user.username,
      };
    }
    if (access.operator) {
      return {
        userId: null,
        displayName: access.operator.displayName.trim() || 'Operador',
        username: null,
      };
    }
  }

  const token = bearerTokenFromRequest(req);
  if (token) {
    const deviceIdFallback = deviceId || 'web';
    const access = resolveEffectiveAccess(db, deviceIdFallback, req);
    if (access.user) {
      return {
        userId: access.user.id,
        displayName: access.user.displayName.trim() || access.user.username || 'Usuario',
        username: access.user.username,
      };
    }
  }

  return { userId: null, displayName: 'Sistema', username: null };
}

export function appendUserAdminAuditLog(
  db: SqliteStore,
  input: {
    action: UserAdminAuditAction;
    req: Request;
    details: UserAdminAuditDetails;
  },
): void {
  migrateUserAuditSchema(db);
  const actor = resolveAuditActorFromRequest(db, input.req);
  const deviceId = reqDeviceId(input.req);
  db.prepare(
    `INSERT INTO user_admin_audit_log
     (id, action, created_at, actor_user_id, actor_display_name, actor_username, device_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.action,
    Date.now(),
    actor.userId,
    actor.displayName.slice(0, 120),
    actor.username?.slice(0, 80) ?? null,
    deviceId,
    JSON.stringify(input.details),
  );
}

function reqDeviceId(req: Request): string | null {
  const id = req.header('X-Device-Id')?.trim();
  return id || null;
}

export function listUserAdminAuditLogs(
  db: SqliteStore,
  input: { limit?: number; offset?: number } = {},
): UserAdminAuditEntry[] {
  migrateUserAuditSchema(db);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT id, action, created_at, actor_user_id, actor_display_name, actor_username, device_id, details_json
       FROM user_admin_audit_log
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as {
    id: string;
    action: string;
    created_at: number;
    actor_user_id: string | null;
    actor_display_name: string;
    actor_username: string | null;
    device_id: string | null;
    details_json: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    action: row.action as UserAdminAuditAction,
    createdAt: row.created_at,
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    actorUsername: row.actor_username,
    deviceId: row.device_id,
    details: parseDetails(row.details_json),
  }));
}

function parseDetails(raw: string): UserAdminAuditDetails {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as UserAdminAuditDetails;
    }
  } catch {
    /* ignore */
  }
  return {};
}
