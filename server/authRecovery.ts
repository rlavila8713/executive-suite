import { createHash, randomBytes } from 'node:crypto';
import type { SqliteStore } from './db.js';

export function migrateAuthRecoverySchema(db: SqliteStore): void {
  const cols = db.prepare('PRAGMA table_info(app_settings)').all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('auth_recovery_code_hash')) {
    db.exec(`ALTER TABLE app_settings ADD COLUMN auth_recovery_code_hash TEXT`);
  }
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_LEN = 12;

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

function hashRecoveryCode(normalized: string): string {
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function formatRecoveryCodeForDisplay(normalized: string): string {
  const c = normalized.slice(0, RECOVERY_CODE_LEN);
  if (c.length < RECOVERY_CODE_LEN) return c;
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

function generateRecoveryCodePlain(): string {
  let s = '';
  const bytes = randomBytes(RECOVERY_CODE_LEN);
  for (let i = 0; i < RECOVERY_CODE_LEN; i++) {
    s += RECOVERY_ALPHABET[bytes[i]! % RECOVERY_ALPHABET.length];
  }
  return s;
}

export function hasRecoveryCodeConfigured(db: SqliteStore): boolean {
  migrateAuthRecoverySchema(db);
  const row = db.prepare('SELECT auth_recovery_code_hash FROM app_settings WHERE id = ?').get('main') as
    | { auth_recovery_code_hash?: string | null }
    | undefined;
  const hash = row?.auth_recovery_code_hash?.trim();
  return Boolean(hash);
}

export function verifyRecoveryCode(db: SqliteStore, code: string): boolean {
  migrateAuthRecoverySchema(db);
  const row = db.prepare('SELECT auth_recovery_code_hash FROM app_settings WHERE id = ?').get('main') as
    | { auth_recovery_code_hash?: string | null }
    | undefined;
  const stored = row?.auth_recovery_code_hash?.trim();
  if (!stored) return false;
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== RECOVERY_CODE_LEN) return false;
  return hashRecoveryCode(normalized) === stored;
}

/** Creates a new recovery code, stores its hash, returns formatted code (show once to the user). */
export function issueNewRecoveryCode(db: SqliteStore): string {
  migrateAuthRecoverySchema(db);
  const plain = generateRecoveryCodePlain();
  db.prepare('UPDATE app_settings SET auth_recovery_code_hash = ? WHERE id = ?').run(
    hashRecoveryCode(plain),
    'main',
  );
  return formatRecoveryCodeForDisplay(plain);
}
