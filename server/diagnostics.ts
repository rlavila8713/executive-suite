import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SqliteStore } from './db.js';
import { getDataDir, getDbPath } from './db.js';
import { getBackupMetrics, getPersistenceMetrics } from './persistenceMetrics.js';
import { listSqliteBackups } from './dbBackup.js';

export const CATALOG_SCHEMA_VERSION = 2;

function readAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as {
      version?: string;
    };
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

export type ServerDiagnostics = {
  appVersion: string;
  dataDir: string;
  database: {
    path: string;
    sizeBytes: number | null;
    lastModified: string | null;
    products: number;
    categories: number;
    transactions: number;
    schemaVersion: number;
  };
  persistence: ReturnType<typeof getPersistenceMetrics>;
  backup: ReturnType<typeof getBackupMetrics> & { rotatedBackupCount: number };
};

export function buildServerDiagnostics(db: SqliteStore): ServerDiagnostics {
  const dbPath = getDbPath();
  let sizeBytes: number | null = null;
  let lastModified: string | null = null;
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    sizeBytes = stat.size;
    lastModified = stat.mtime.toISOString();
  }

  const products = (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c;
  const categories = (db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }).c;
  const transactions = (db.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }).c;

  return {
    appVersion: readAppVersion(),
    dataDir: getDataDir(),
    database: {
      path: dbPath,
      sizeBytes,
      lastModified,
      products,
      categories,
      transactions,
      schemaVersion: CATALOG_SCHEMA_VERSION,
    },
    persistence: getPersistenceMetrics(),
    backup: {
      ...getBackupMetrics(),
      rotatedBackupCount: listSqliteBackups().length,
    },
  };
}

export type ClientDiagnostics = {
  apiUrl: string;
  appVersion: string;
  database: {
    products: number;
    categories: number;
    transactions: number;
    sizeBytes: number | null;
    embeddedImageCount: number;
    fileImageCount: number;
  };
  persistence: { lastSuccessfulPersist: string | null; lastPersistDurationMs: number | null };
  warnings: string[];
  /** Guidance for mobile/Flutter clients consuming this API. */
  mobileClientHints: {
    maxImageDimensionPx: number;
    preferSequentialUploads: boolean;
    productListUseIncludeImagesFalse: boolean;
  };
};

function countProductImages(db: SqliteStore): { embedded: number; file: number } {
  const rows = db.prepare('SELECT image FROM products').all() as { image: string }[];
  let embedded = 0;
  let file = 0;
  for (const row of rows) {
    const v = (row.image ?? '').trim();
    if (!v || v.startsWith('data:image/svg')) continue;
    if (v.startsWith('file:')) file += 1;
    else if (v.startsWith('data:image/')) embedded += 1;
  }
  return { embedded, file };
}

/** Safe subset for LAN clients (no absolute host paths). */
export function buildClientDiagnostics(db: SqliteStore, apiBaseUrl: string): ClientDiagnostics {
  const full = buildServerDiagnostics(db);
  const imageCounts = countProductImages(db);
  const warnings: string[] = [];
  if (full.database.products === 0) {
    warnings.push('CATALOG_EMPTY');
  }
  if (imageCounts.embedded > 0) {
    warnings.push('EMBEDDED_IMAGES_IN_SQLITE');
  }
  return {
    apiUrl: apiBaseUrl,
    appVersion: full.appVersion,
    database: {
      products: full.database.products,
      categories: full.database.categories,
      transactions: full.database.transactions,
      sizeBytes: full.database.sizeBytes,
      embeddedImageCount: imageCounts.embedded,
      fileImageCount: imageCounts.file,
    },
    persistence: {
      lastSuccessfulPersist: full.persistence.lastSuccessfulPersist,
      lastPersistDurationMs: full.persistence.lastPersistDurationMs,
    },
    warnings,
    mobileClientHints: {
      maxImageDimensionPx: 800,
      preferSequentialUploads: true,
      productListUseIncludeImagesFalse: true,
    },
  };
}
