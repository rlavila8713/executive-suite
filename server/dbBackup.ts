import fs from 'node:fs';
import path from 'node:path';
import { getDataDir, getDbPath } from './db.js';
import { logStructured } from './structuredLog.js';
import { recordBackupFailure, recordBackupSuccess } from './persistenceMetrics.js';

const DEFAULT_MAX_BACKUPS = 10;

export function getBackupsDir(): string {
  return path.join(getDataDir(), 'backups');
}

function formatBackupStamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function listSqliteBackups(): string[] {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('executive-suite-') && f.endsWith('.sqlite'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function pruneOldBackups(maxBackups: number): void {
  const files = listSqliteBackups();
  for (const old of files.slice(maxBackups)) {
    try {
      fs.unlinkSync(old);
    } catch {
      // keep file if delete fails
    }
  }
}

/**
 * Copies the current SQLite file to backups/ (does not use db.export).
 * Returns destination path on success.
 */
export function createSqliteBackup(reason: string, maxBackups = DEFAULT_MAX_BACKUPS): string {
  const src = getDbPath();
  if (!fs.existsSync(src)) {
    const err = 'No SQLite file to backup';
    recordBackupFailure(err);
    logStructured('DB_BACKUP_FAILURE', { reason, error: err });
    throw new Error(err);
  }

  const dir = getBackupsDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `executive-suite-${formatBackupStamp()}.sqlite`);

  logStructured('DB_BACKUP_START', { reason, dest });

  const tmp = `${dest}.tmp`;
  try {
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dest);
    const sizeBytes = fs.statSync(dest).size;
    recordBackupSuccess(dest, sizeBytes);
    pruneOldBackups(maxBackups);
    logStructured('DB_BACKUP_SUCCESS', { reason, path: dest, sizeBytes });
    return dest;
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    const message = err instanceof Error ? err.message : String(err);
    recordBackupFailure(message);
    logStructured('DB_BACKUP_FAILURE', { reason, error: message });
    throw err;
  }
}
