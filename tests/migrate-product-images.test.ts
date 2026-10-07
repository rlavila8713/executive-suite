import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeDb, getDb, initDb } from '../server/db.js';
import { migrateEmbeddedProductImagesToFiles } from '../server/migrateProductImages.js';
import { getProductImagesDir } from '../server/productImageStorage.js';

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('migrate embedded product images', () => {
  let dataDir = '';

  before(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-migrate-img-'));
    process.env.DATA_DIR = dataDir;
    closeDb();
    await initDb();
    const db = getDb();
    db.prepare(
      `INSERT INTO products (id, name, sku, category, price, cost, stock, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'A', 'SKU', 'Cat', 1, 1, 1, tinyPng);
  });

  after(() => {
    closeDb();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('dry run counts embedded images', () => {
    const db = getDb();
    const result = migrateEmbeddedProductImagesToFiles(db, { dryRun: true, pruneOrphans: false });
    assert.equal(result.migrated, 1);
    const row = db.prepare('SELECT image FROM products WHERE id = ?').get('p1') as { image: string };
    assert.ok(row.image.startsWith('data:'));
  });

  it('moves embedded image to file reference', () => {
    const db = getDb();
    const result = migrateEmbeddedProductImagesToFiles(db, { dryRun: false });
    assert.equal(result.migrated, 1);
    const row = db.prepare('SELECT image FROM products WHERE id = ?').get('p1') as { image: string };
    assert.ok(row.image.startsWith('file:'));
    assert.equal(row.image, 'file:product-photos/p1.png');
    assert.ok(fs.existsSync(path.join(getProductImagesDir(), 'p1.png')));
  });
});
