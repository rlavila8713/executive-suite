import fs from 'node:fs';
import path from 'node:path';
import type { Database as SqlDatabase } from 'sql.js';
import { getDataDir, getDbPath } from './db.js';
import { logStructured } from './structuredLog.js';
import { recordPersistFailure, recordPersistSuccess } from './persistenceMetrics.js';

function fsyncFile(filePath: string): void {
  const fd = fs.openSync(filePath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function persistDatabaseAtomicOnce(db: SqlDatabase): void {
  const dataDir = getDataDir();
  const dbPath = getDbPath();
  const tmpPath = `${dbPath}.tmp`;

  fs.mkdirSync(dataDir, { recursive: true });
  if (process.env.LOG_DB_PERSIST === '1') {
    logStructured('DB_PERSIST_START');
  }

  const started = Date.now();
  let exported: Uint8Array;
  try {
    exported = db.export();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordPersistFailure(message);
    logStructured('DB_PERSIST_FAILURE', { phase: 'export', error: message });
    throw err;
  }

  try {
    fs.writeFileSync(tmpPath, Buffer.from(exported));
    fsyncFile(tmpPath);
    fs.renameSync(tmpPath, dbPath);
    const sizeBytes = exported.byteLength;
    const durationMs = Date.now() - started;
    recordPersistSuccess(durationMs, sizeBytes);
    if (process.env.LOG_DB_PERSIST === '1') {
      logStructured('DB_PERSIST_SUCCESS', { durationMs, sizeBytes });
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    const message = err instanceof Error ? err.message : String(err);
    recordPersistFailure(message);
    logStructured('DB_PERSIST_FAILURE', { phase: 'write', error: message });
    throw err;
  }
}

/** Atomically persist sql.js database: write complete .tmp, fsync, rename over main file. */
export function persistDatabaseAtomic(db: SqlDatabase): void {
  try {
    persistDatabaseAtomicOnce(db);
  } catch (first) {
    const message = first instanceof Error ? first.message : String(first);
    logStructured('DB_PERSIST_RETRY', { error: message });
    persistDatabaseAtomicOnce(db);
  }
}
