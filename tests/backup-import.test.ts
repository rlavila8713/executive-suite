import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeDb, getDb, initDb } from '../server/db.js';
import { importBackupWithSafety } from '../server/backupImport.js';
import { ApiError } from '../server/apiError.js';

const minimalBackup = {
  app: 'executive-suite',
  schemaVersion: 5,
  products: [],
  transactions: [],
  expenses: [],
  appSettings: {
    id: 'main',
    storeName: 'Test',
    branch: '',
    currency: 'CUP',
    taxRate: 0,
    cardQrPayload: '',
    transferBank: '',
    transferAccountHolder: '',
    transferAccountNumber: '',
    transferPhoneNumber: '',
    transferQrExtra: '',
    darkMode: false,
    lowStockNotifications: true,
    managerName: '',
    managerTitle: '',
    locale: 'es',
  },
};

describe('backup import safety', () => {
  let dataDir = '';

  before(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-import-'));
    process.env.DATA_DIR = dataDir;
    closeDb();
    await initDb();
    const db = getDb();
    db.prepare(
      `INSERT INTO products (id, name, sku, category, price, cost, stock, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'A', 'SKU', 'Cat', 1, 1, 1, '');
  });

  after(() => {
    closeDb();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('rejects empty product import when catalog exists', () => {
    const db = getDb();
    try {
      importBackupWithSafety(db, minimalBackup);
      assert.fail('expected ApiError');
    } catch (err) {
      assert.ok(err instanceof ApiError);
      assert.equal((err as ApiError).code, 'ERR_BACKUP_EMPTY_PRODUCTS');
    }
    const count = (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c;
    assert.equal(count, 1);
  });

  it('allows empty import with allowEmptyProducts', () => {
    const db = getDb();
    importBackupWithSafety(db, { ...minimalBackup, allowEmptyProducts: true });
    const count = (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c;
    assert.equal(count, 0);
    const backups = fs.readdirSync(path.join(dataDir, 'backups'));
    assert.ok(backups.some((f) => f.endsWith('.sqlite')));
  });
});
