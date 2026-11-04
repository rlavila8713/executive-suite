import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';
import { ApiError } from './apiError.js';
import { assertWebAdminClient } from './adminGuard.js';
import { resolveEffectiveAccess, setUserPassword } from './auth.js';
import {
  createAppUser,
  listActiveOperators,
  listPermissions,
  listRoles,
  listUsers,
  updateAppUser,
  updateRolePermissions,
} from './rbac.js';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
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
      const role = updateRolePermissions(db, roleKey, body.permissionKeys);
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
      const user = updateAppUser(db, userId, body);
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
      setUserPassword(db, userId, password, true);
      res.status(204).send();
    }),
  );
}
