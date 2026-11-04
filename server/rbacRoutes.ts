import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';
import { ApiError } from './apiError.js';
import { assertWebAdminClient } from './adminGuard.js';
import { resolveEffectiveAccess, setUserPassword } from './auth.js';
import {
  createAppUser,
  getAppUserById,
  listActiveOperators,
  listPermissions,
  listRoles,
  listUsers,
  updateAppUser,
  updateRolePermissions,
} from './rbac.js';
import { appendUserAdminAuditLog, listUserAdminAuditLogs } from './userAuditLog.js';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function permissionDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((k) => !beforeSet.has(k)).sort();
  const removed = before.filter((k) => !afterSet.has(k)).sort();
  return { added, removed };
}

function userChangeFields(
  before: ReturnType<typeof getAppUserById>,
  after: ReturnType<typeof getAppUserById>,
  input: { displayName?: string; roleKey?: string; active?: boolean; username?: string | null },
): Record<string, { from: unknown; to: unknown }> {
  if (!before || !after) return {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (input.displayName !== undefined && before.displayName !== after.displayName) {
    changes.displayName = { from: before.displayName, to: after.displayName };
  }
  if (input.roleKey !== undefined && before.roleKey !== after.roleKey) {
    changes.roleKey = { from: before.roleKey, to: after.roleKey };
  }
  if (input.active !== undefined && before.active !== after.active) {
    changes.active = { from: before.active, to: after.active };
  }
  if (input.username !== undefined && (before.username ?? '') !== (after.username ?? '')) {
    changes.username = { from: before.username, to: after.username };
  }
  return changes;
}

export function registerRbacRoutes(router: import('express').Router): void {
  router.get(
    '/device/access',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const db = getDb();
      res.json(resolveEffectiveAccess(db, deviceId, req));
    }),
  );

  router.get(
    '/roles',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      res.json(listRoles(db));
    }),
  );

  router.get(
    '/permissions',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      res.json(listPermissions(db));
    }),
  );

  router.patch(
    '/roles/:roleKey/permissions',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const roleKey = req.params.roleKey?.trim();
      if (!roleKey) throw new ApiError(400, 'Role key required');
      const body = req.body as { permissionKeys?: string[] };
      if (!Array.isArray(body.permissionKeys)) {
        throw new ApiError(400, 'permissionKeys array required', 'ERR_INVALID_ROLE_PERMISSIONS');
      }
      const db = getDb();
      const rolesBefore = listRoles(db);
      const roleBefore = rolesBefore.find((r) => r.key === roleKey);
      const beforeKeys = roleBefore?.permissionKeys ?? [];
      const role = updateRolePermissions(db, roleKey, body.permissionKeys);
      const { added, removed } = permissionDiff(beforeKeys, role.permissionKeys);
      appendUserAdminAuditLog(db, {
        action: 'role.permissions_updated',
        req,
        details: {
          roleKey: role.key,
          roleName: role.name,
          previousPermissionKeys: beforeKeys,
          newPermissionKeys: role.permissionKeys,
          permissionKeysAdded: added,
          permissionKeysRemoved: removed,
        },
      });
      res.json(role);
    }),
  );

  router.get(
    '/operators',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      res.json(listActiveOperators(db));
    }),
  );

  router.get(
    '/users/audit-log',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const db = getDb();
      const limitRaw = req.query.limit;
      const offsetRaw = req.query.offset;
      const limit = limitRaw != null ? Number(limitRaw) : 100;
      const offset = offsetRaw != null ? Number(offsetRaw) : 0;
      res.json(listUserAdminAuditLogs(db, { limit, offset }));
    }),
  );

  router.get(
    '/users',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const db = getDb();
      res.json(listUsers(db));
    }),
  );

  router.post(
    '/users',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const body = req.body as { displayName?: string; roleKey?: string; username?: string | null };
      if (!body.displayName?.trim()) throw new ApiError(400, 'Display name required', 'ERR_USER_NAME_REQUIRED');
      if (!body.roleKey?.trim()) throw new ApiError(400, 'Role required', 'ERR_INVALID_ROLE');
      const db = getDb();
      const user = createAppUser(db, {
        displayName: body.displayName,
        roleKey: body.roleKey,
        username: body.username,
      });
      appendUserAdminAuditLog(db, {
        action: 'user.created',
        req,
        details: {
          userId: user.id,
          displayName: user.displayName,
          roleKey: user.roleKey,
          roleName: user.roleName,
          username: user.username,
          active: user.active,
        },
      });
      res.status(201).json(user);
    }),
  );

  router.patch(
    '/users/:userId',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const userId = req.params.userId?.trim();
      if (!userId) throw new ApiError(400, 'User id required');
      const body = req.body as {
        displayName?: string;
        roleKey?: string;
        active?: boolean;
        username?: string | null;
      };
      const db = getDb();
      const before = getAppUserById(db, userId);
      const user = updateAppUser(db, userId, body);
      const changes = userChangeFields(before, user, body);
      appendUserAdminAuditLog(db, {
        action: 'user.updated',
        req,
        details: {
          userId: user.id,
          displayName: user.displayName,
          roleKey: user.roleKey,
          roleName: user.roleName,
          username: user.username,
          active: user.active,
          changes,
        },
      });
      res.json(user);
    }),
  );

  router.post(
    '/users/:userId/password',
    asyncHandler(async (req, res) => {
      assertWebAdminClient(req);
      const userId = req.params.userId?.trim();
      if (!userId) throw new ApiError(400, 'User id required');
      const body = req.body as { password?: string };
      const password = body.password ?? '';
      if (!password) throw new ApiError(400, 'Password required', 'ERR_AUTH_INVALID');
      const db = getDb();
      const target = getAppUserById(db, userId);
      if (!target) throw new ApiError(404, 'User not found', 'ERR_USER_NOT_FOUND');
      setUserPassword(db, userId, password, true);
      appendUserAdminAuditLog(db, {
        action: 'user.password_set',
        req,
        details: {
          userId: target.id,
          displayName: target.displayName,
          roleKey: target.roleKey,
          username: target.username,
        },
      });
      res.status(204).send();
    }),
  );
}
