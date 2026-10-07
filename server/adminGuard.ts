import type { Request } from 'express';
import { ApiError } from './apiError.js';
import { inferClientKind } from './connectedDevices.js';

/** Destructive or host-sensitive admin routes: LAN mobile clients must not call these. */
export function assertWebAdminClient(req: Request): void {
  const kind = inferClientKind(req.header('User-Agent') ?? '', req.header('X-Client-Kind'));
  if (kind === 'mobile') {
    throw new ApiError(403, 'This action is only available from the store web app', 'ERR_ADMIN_WEB_ONLY');
  }
}
