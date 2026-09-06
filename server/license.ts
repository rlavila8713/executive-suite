import type { SqliteStore } from './db.js';
import { newId } from './db.js';
import {
  decodeLicenseRequest,
  encodeLicenseRequest,
  verifyLicenseKey,
  type LicenseRequestPayload,
} from './licenseCrypto.js';

export const TRIAL_DAYS = 15;
export const LICENSE_EXPENSE_CATEGORY = 'Licencia de uso';

export type LicensePlanId = 'monthly' | 'quarterly' | 'annual';

export type LicensePlan = {
  id: LicensePlanId;
  name: string;
  price: number;
  days: number;
};

export const LICENSE_PLANS: Record<LicensePlanId, LicensePlan> = {
  monthly: { id: 'monthly', name: 'Mensual', price: 1000, days: 30 },
  quarterly: { id: 'quarterly', name: 'Trimestral', price: 2800, days: 90 },
  annual: { id: 'annual', name: 'Anual', price: 10000, days: 365 },
};

export type LicenseStatus = 'trial' | 'active' | 'expired' | 'device_mismatch';

export type LicenseInfo = {
  status: LicenseStatus;
  planId: LicensePlanId | null;
  trialStartedAt: number;
  trialEndsAt: number;
  trialDaysRemaining: number;
  paidUntil: number | null;
  deviceRegistered: boolean;
  deviceId: string | null;
  plans: LicensePlan[];
};

type LicenseRow = {
  id: string;
  trial_started_at: number;
  plan_id: string | null;
  paid_until: number | null;
  device_fingerprint: string | null;
  device_registered_at: number | null;
  last_payment_at: number | null;
  license_nonce: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class LicenseError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'LicenseError';
  }
}

export function ensureLicenseRow(db: SqliteStore): void {
  const row = db.prepare('SELECT id FROM license_state WHERE id = ?').get('main') as { id: string } | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO license_state (id, trial_started_at, plan_id, paid_until, device_fingerprint, device_registered_at, last_payment_at, license_nonce)
       VALUES ('main', ?, NULL, NULL, NULL, NULL, NULL, NULL)`,
    ).run(Date.now());
  }
}

function getLicenseRow(db: SqliteStore): LicenseRow {
  ensureLicenseRow(db);
  return db.prepare('SELECT * FROM license_state WHERE id = ?').get('main') as LicenseRow;
}

export function registerDevice(db: SqliteStore, deviceId: string): { ok: true } | { ok: false; reason: 'device_mismatch' } {
  const row = getLicenseRow(db);
  if (!row.device_fingerprint) {
    db.prepare(
      'UPDATE license_state SET device_fingerprint = ?, device_registered_at = ? WHERE id = ?',
    ).run(deviceId, Date.now(), 'main');
    return { ok: true };
  }
  if (row.device_fingerprint !== deviceId) {
    return { ok: false, reason: 'device_mismatch' };
  }
  return { ok: true };
}

export function isDeviceAuthorized(db: SqliteStore, deviceId: string | undefined): boolean {
  if (!deviceId?.trim()) return false;
  const row = getLicenseRow(db);
  if (!row.device_fingerprint) return true;
  return row.device_fingerprint === deviceId;
}

function computeStatus(row: LicenseRow, deviceOk: boolean): LicenseStatus {
  if (!deviceOk) return 'device_mismatch';
  const now = Date.now();
  const trialEndsAt = row.trial_started_at + TRIAL_DAYS * MS_PER_DAY;
  if (row.paid_until != null && row.paid_until > now) return 'active';
  if (now < trialEndsAt) return 'trial';
  return 'expired';
}

export function getLicenseInfo(db: SqliteStore, deviceId?: string): LicenseInfo {
  const row = getLicenseRow(db);
  const deviceOk = isDeviceAuthorized(db, deviceId);
  const now = Date.now();
  const trialEndsAt = row.trial_started_at + TRIAL_DAYS * MS_PER_DAY;
  const trialDaysRemaining = Math.max(0, Math.ceil((trialEndsAt - now) / MS_PER_DAY));
  const status = computeStatus(row, deviceOk);

  return {
    status,
    planId: (row.plan_id as LicensePlanId | null) ?? null,
    trialStartedAt: row.trial_started_at,
    trialEndsAt,
    trialDaysRemaining,
    paidUntil: row.paid_until,
    deviceRegistered: row.device_fingerprint != null,
    deviceId: row.device_fingerprint,
    plans: Object.values(LICENSE_PLANS),
  };
}

export function isLicenseActive(db: SqliteStore, deviceId?: string): boolean {
  const info = getLicenseInfo(db, deviceId);
  return info.status === 'trial' || info.status === 'active';
}

function getStoreContext(db: SqliteStore): { storeName: string; branch: string } {
  const row = db.prepare('SELECT store_name, branch FROM app_settings WHERE id = ?').get('main') as
    | { store_name: string; branch: string }
    | undefined;
  return { storeName: row?.store_name ?? '', branch: row?.branch ?? '' };
}

export function buildLicenseRequest(
  db: SqliteStore,
  deviceId: string,
  planId: LicensePlanId,
): { requestCode: string; payload: LicenseRequestPayload } {
  const plan = LICENSE_PLANS[planId];
  if (!plan) throw new LicenseError('Invalid plan', 'ERR_LICENSE_INVALID');

  const store = getStoreContext(db);
  const payload: LicenseRequestPayload = {
    v: 1,
    deviceId,
    planId,
    storeName: store.storeName,
    branch: store.branch,
    requestedAt: Date.now(),
  };
  return { requestCode: encodeLicenseRequest(payload), payload };
}

export function parseLicenseRequestCode(code: string): LicenseRequestPayload {
  try {
    return decodeLicenseRequest(code);
  } catch {
    throw new LicenseError('Invalid request code', 'ERR_LICENSE_REQUEST_INVALID');
  }
}

export function activateLicense(
  db: SqliteStore,
  deviceId: string,
  licenseKey: string,
): { expenseId: string; paidUntil: number } {
  let payload;
  try {
    payload = verifyLicenseKey(licenseKey);
  } catch {
    throw new LicenseError('Invalid or forged license key', 'ERR_LICENSE_INVALID');
  }

  if (payload.deviceId !== deviceId) {
    throw new LicenseError('License is for a different device', 'ERR_LICENSE_DEVICE_MISMATCH');
  }

  const plan = LICENSE_PLANS[payload.planId];
  if (!plan) throw new LicenseError('Invalid plan in license', 'ERR_LICENSE_INVALID');

  if (payload.days !== plan.days || payload.price !== plan.price) {
    throw new LicenseError('License plan details do not match', 'ERR_LICENSE_INVALID');
  }

  const row = getLicenseRow(db);
  if (row.license_nonce === payload.nonce) {
    throw new LicenseError('This license key was already used', 'ERR_LICENSE_ALREADY_USED');
  }

  const now = Date.now();
  const base = row.paid_until != null && row.paid_until > now ? row.paid_until : now;
  const paidUntil = base + payload.days * MS_PER_DAY;
  const expenseId = newId();
  const today = new Date().toISOString().slice(0, 10);
  const title = `Licencia ${plan.name}`;

  db.runInTransaction(() => {
    db.prepare(
      'UPDATE license_state SET plan_id = ?, paid_until = ?, last_payment_at = ?, license_nonce = ? WHERE id = ?',
    ).run(payload.planId, paidUntil, now, payload.nonce, 'main');
    db.prepare(
      'INSERT INTO expenses (id, title, amount, category, date, locked) VALUES (?, ?, ?, ?, ?, 1)',
    ).run(expenseId, title, payload.price, LICENSE_EXPENSE_CATEGORY, today);
  });

  return { expenseId, paidUntil };
}

export function resetLicenseForFactory(db: SqliteStore): void {
  db.prepare('DELETE FROM license_state').run();
  ensureLicenseRow(db);
}
