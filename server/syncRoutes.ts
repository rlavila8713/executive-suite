import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';
import { ApiError } from './apiError.js';
import { inferClientKind } from './connectedDevices.js';
import { buildMobileOfflinePack, processMobileSale, syncMobileSalesBatch, type MobileSaleInput } from './mobileOffline.js';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function registerSyncRoutes(router: import('express').Router): void {
  router.get(
    '/sync/offline-pack',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const clientKind = inferClientKind(req.header('User-Agent') ?? '', req.header('X-Client-Kind') ?? undefined);
      if (clientKind !== 'mobile') {
        throw new ApiError(403, 'Offline pack is intended for mobile clients', 'ERR_SYNC_MOBILE_ONLY');
      }
      const db = getDb();
      res.json(buildMobileOfflinePack(db, deviceId, req));
    }),
  );

  router.post(
    '/sync/sales',
    asyncHandler(async (req, res) => {
      const deviceId = req.header('X-Device-Id')?.trim();
      if (!deviceId) throw new ApiError(400, 'Device id required');
      const clientKind = inferClientKind(req.header('User-Agent') ?? '', req.header('X-Client-Kind') ?? undefined);
      if (clientKind !== 'mobile') {
        throw new ApiError(403, 'Offline sale sync is intended for mobile clients', 'ERR_SYNC_MOBILE_ONLY');
      }
      const body = req.body as { sales?: MobileSaleInput[] };
      const db = getDb();
      const results = syncMobileSalesBatch(db, req, body.sales ?? []);
      res.json({ results, syncedAt: Date.now() });
    }),
  );

  router.post(
    '/sync/sales/:clientSaleId/replay',
    asyncHandler(async (req, res) => {
      const clientSaleId = req.params.clientSaleId?.trim();
      if (!clientSaleId) throw new ApiError(400, 'clientSaleId required');
      const body = req.body as MobileSaleInput;
      const db = getDb();
      const outcome = processMobileSale(db, req, {
        ...body,
        clientSaleId,
        syncOffline: body.syncOffline ?? true,
      });
      res.status(outcome.status === 'created' ? 201 : 200).json(outcome);
    }),
  );
}
