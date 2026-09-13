import type { SqliteStore } from './db.js';

/** Device is considered online if it sent a request within this window. */
export const DEVICE_ONLINE_THRESHOLD_MS = 90_000;

export type ClientKind = 'mobile' | 'web' | 'unknown';

export type ConnectedDevice = {
  deviceId: string;
  clientKind: ClientKind;
  userAgent: string;
  firstSeenAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
  operatorName: string;
  online: boolean;
  isCurrent: boolean;
};

type ConnectedDeviceRow = {
  device_id: string;
  client_kind: string;
  user_agent: string;
  first_seen_at: number;
  last_seen_at: number;
  revoked_at: number | null;
  operator_name?: string | null;
};

export function ensureConnectedDevicesSchema(db: SqliteStore): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connected_devices (
      device_id TEXT PRIMARY KEY,
      client_kind TEXT NOT NULL DEFAULT 'unknown',
      user_agent TEXT NOT NULL DEFAULT '',
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      revoked_at INTEGER,
      operator_name TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_connected_devices_last_seen ON connected_devices(last_seen_at);
  `);
  const cols = db.prepare('PRAGMA table_info(connected_devices)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'operator_name')) {
    db.exec(`ALTER TABLE connected_devices ADD COLUMN operator_name TEXT NOT NULL DEFAULT ''`);
  }
}

export function inferClientKind(userAgent: string, clientKindHeader?: string): ClientKind {
  const header = (clientKindHeader ?? '').trim().toLowerCase();
  if (header === 'mobile' || header === 'flutter') return 'mobile';
  if (header === 'web') return 'web';

  const ua = userAgent.toLowerCase();
  if (
    ua.includes('dart') ||
    ua.includes('flutter') ||
    ua.includes('okhttp') ||
    ua.includes('cfnetwork') ||
    ua.includes('android') ||
    ua.includes('iphone') ||
    ua.includes('ipad')
  ) {
    return 'mobile';
  }
  if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('electron')) {
    return 'web';
  }
  return 'unknown';
}

export function isDeviceRevoked(db: SqliteStore, deviceId: string): boolean {
  ensureConnectedDevicesSchema(db);
  const row = db
    .prepare('SELECT revoked_at FROM connected_devices WHERE device_id = ?')
    .get(deviceId) as { revoked_at: number | null } | undefined;
  return row?.revoked_at != null;
}

export function touchConnectedDevice(
  db: SqliteStore,
  deviceId: string,
  userAgent: string,
  clientKindHeader?: string,
  now: number = Date.now(),
): void {
  ensureConnectedDevicesSchema(db);
  const clientKind = inferClientKind(userAgent, clientKindHeader);
  const existing = db
    .prepare('SELECT device_id, revoked_at FROM connected_devices WHERE device_id = ?')
    .get(deviceId) as { device_id: string; revoked_at: number | null } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO connected_devices (device_id, client_kind, user_agent, first_seen_at, last_seen_at, revoked_at, operator_name)
       VALUES (?, ?, ?, ?, ?, NULL, '')`,
    ).run(deviceId, clientKind, userAgent.slice(0, 512), now, now);
    return;
  }

  if (existing.revoked_at != null) return;

  db.prepare(
    `UPDATE connected_devices
     SET last_seen_at = ?, client_kind = ?, user_agent = ?
     WHERE device_id = ?`,
  ).run(now, clientKind, userAgent.slice(0, 512), deviceId);
}

export function listConnectedDevices(
  db: SqliteStore,
  currentDeviceId?: string,
  now: number = Date.now(),
): ConnectedDevice[] {
  ensureConnectedDevicesSchema(db);
  const rows = db
    .prepare(
      `SELECT device_id, client_kind, user_agent, first_seen_at, last_seen_at, revoked_at, operator_name
       FROM connected_devices
       ORDER BY revoked_at IS NOT NULL, last_seen_at DESC`,
    )
    .all() as ConnectedDeviceRow[];

  return rows.map((row) => ({
    deviceId: row.device_id,
    clientKind: row.client_kind as ClientKind,
    userAgent: row.user_agent,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    operatorName: (row.operator_name ?? '').trim(),
    online: row.revoked_at == null && now - row.last_seen_at <= DEVICE_ONLINE_THRESHOLD_MS,
    isCurrent: currentDeviceId != null && row.device_id === currentDeviceId,
  }));
}

export function getDeviceOperatorName(db: SqliteStore, deviceId: string): string {
  ensureConnectedDevicesSchema(db);
  const row = db
    .prepare('SELECT operator_name FROM connected_devices WHERE device_id = ?')
    .get(deviceId) as { operator_name?: string | null } | undefined;
  return (row?.operator_name ?? '').trim();
}

export function setDeviceOperatorName(db: SqliteStore, deviceId: string, operatorName: string): boolean {
  ensureConnectedDevicesSchema(db);
  const result = db
    .prepare('UPDATE connected_devices SET operator_name = ? WHERE device_id = ?')
    .run(operatorName.trim().slice(0, 80), deviceId);
  return result.changes > 0;
}

export function revokeConnectedDevice(db: SqliteStore, deviceId: string, now: number = Date.now()): boolean {
  ensureConnectedDevicesSchema(db);
  const result = db
    .prepare('UPDATE connected_devices SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL')
    .run(now, deviceId);
  return result.changes > 0;
}
