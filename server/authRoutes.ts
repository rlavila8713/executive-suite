import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';
import { ApiError } from './apiError.js';
import {
  bootstrapManagerPassword,
  bearerTokenFromRequest,
  buildAccessContextForUser,
  getAuthSettings,
  loginWithCredentials,
  needsPasswordBootstrap,
  recoverPasswordWithRecoveryCode,
  resolveEffectiveAccess,
  resolveSessionUserId,
  revokeSessionByToken,
  setUserPassword,
} from './auth.js';
import { hasRecoveryCodeConfigured, issueNewRecoveryCode } from './authRecovery.js';
import { updateAppUser } from './rbac.js';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function registerAuthRoutes(router: import('express').Router): void {
  router.get(
    '/auth/status',
    asyncHandler(async (_req, res) => {
      const db = getDb();
      const settings = getAuthSettings(db);
      const store = db.prepare('SELECT store_name FROM app_settings WHERE id = ?').get('main') as
        | { store_name: string }
        | undefined;
      res.json({
        loginRequired: settings.loginRequired,
        needsBootstrap: needsPasswordBootstrap(db),
        hasRecoveryCode: hasRecoveryCodeConfigured(db),
        storeName: store?.store_name ?? '',
      });
    }),
  );

  router.post(
    '/auth/bootstrap',
    asyncHandler(async (req, res) => {
      const body = req.body as { username?: string; password?: string };
      const username = body.username?.trim() ?? '';
      const password = body.password ?? '';
      if (!username || !password) {
        throw new ApiError(400, 'Username and password required', 'ERR_AUTH_INVALID');
      }
      const db = getDb();
      const recoveryCode = bootstrapManagerPassword(db, { username, password });
      res.status(201).json({ recoveryCode });
    }),
  );

  router.post(
    '/auth/recover',
    asyncHandler(async (req, res) => {
      const body = req.body as { username?: string; recoveryCode?: string; newPassword?: string };
      const username = body.username?.trim() ?? '';
      const recoveryCode = body.recoveryCode ?? '';
      const newPassword = body.newPassword ?? '';
      if (!username || !recoveryCode || !newPassword) {
        throw new ApiError(400, 'Username, recovery code and new password required', 'ERR_AUTH_INVALID');
      }
      const db = getDb();
      recoverPasswordWithRecoveryCode(db, { username, recoveryCode, newPassword });
      res.status(204).send();
    }),
  );

  router.post(
    '/auth/recovery-code',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const db = getDb();
      const token = bearerTokenFromRequest(req);
      const userId = resolveSessionUserId(db, token);
      if (!userId) throw new ApiError(401, 'Login required', 'ERR_LOGIN_REQUIRED');
      const access = resolveEffectiveAccess(db, deviceId, req);
      if (!access.permissions.includes('settings.manage')) {
        throw new ApiError(403, 'Permission denied', 'ERR_PERMISSION_DENIED');
      }
      const recoveryCode = issueNewRecoveryCode(db);
      res.status(201).json({ recoveryCode });
    }),
  );

  router.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const body = req.body as { username?: string; password?: string };
      const username = body.username?.trim() ?? '';
      const password = body.password ?? '';
      const db = getDb();
      const result = loginWithCredentials(db, username, password, deviceId);
      res.json({
        token: result.token,
        expiresAt: result.expiresAt,
        access: result.access,
      });
    }),
  );

  router.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      const token = bearerTokenFromRequest(req);
      if (token) {
        revokeSessionByToken(getDb(), token);
      }
      res.status(204).send();
    }),
  );

  router.get(
    '/auth/session',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const db = getDb();
      const settings = getAuthSettings(db);
      const token = bearerTokenFromRequest(req);
      const userId = resolveSessionUserId(db, token);
      if (!userId) {
        res.json({
          authenticated: false,
          loginRequired: settings.loginRequired,
          needsBootstrap: needsPasswordBootstrap(db),
        });
        return;
      }
      const access = buildAccessContextForUser(
        db,
        deviceId,
        userId,
        'session',
        settings.loginRequired,
      );
      res.json({
        authenticated: true,
        loginRequired: settings.loginRequired,
        access,
      });
    }),
  );

  router.patch(
    '/auth/password',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const db = getDb();
      const token = bearerTokenFromRequest(req);
      const userId = resolveSessionUserId(db, token);
      if (!userId) throw new ApiError(401, 'Login required', 'ERR_LOGIN_REQUIRED');
      const body = req.body as { password?: string; keepSession?: boolean };
      const password = body.password ?? '';
      if (!password) throw new ApiError(400, 'Password required', 'ERR_AUTH_INVALID');
      const keepSession = body.keepSession === true;
      setUserPassword(db, userId, password, !keepSession);
      res.status(204).send();
    }),
  );

  router.patch(
    '/auth/profile',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const db = getDb();
      const token = bearerTokenFromRequest(req);
      const userId = resolveSessionUserId(db, token);
      if (!userId) throw new ApiError(401, 'Login required', 'ERR_LOGIN_REQUIRED');
      const body = req.body as { displayName?: string; username?: string | null };
      const user = updateAppUser(db, userId, {
        displayName: body.displayName,
        username: body.username,
      });
      res.json(user);
    }),
  );

  router.get(
    '/auth/access',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const db = getDb();
      res.json(resolveEffectiveAccess(db, deviceId, req));
    }),
  );
}
