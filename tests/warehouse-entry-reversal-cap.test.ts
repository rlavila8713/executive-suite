import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeDb, getDb, initDb } from '../server/db.js';
import { ApiError } from '../server/apiError.js';
import {
  listWarehouseMovements,
  receiveProductToWarehouse,
  reverseWarehouseEntry,
  transferWarehouseToStore,
  getDefaultWarehouse,
} from '../server/warehouse.js';

describe('warehouse entry reversal vs store transfer', () => {
  let dataDir = '';

  before(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-entry-rev-'));
    process.env.DATA_DIR = dataDir;
    closeDb();
    await initDb();
    const db = getDb();
    db.prepare(
      `INSERT INTO products (id, name, sku, category, price, cost, stock, image, warehouse_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'M8', 'M8', 'Cat', 20, 0, 0, '', 0);
    receiveProductToWarehouse(db, 'p1', 200, 5, 20, null, 'test', null);
    transferWarehouseToStore(db, 'p1', 100, 20, 'op');
  });

  after(() => {
    closeDb();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('caps reversible entry quantity by warehouse stock on hand', () => {
    const db = getDb();
    const entries = listWarehouseMovements(db, {
      warehouseId: getDefaultWarehouse(db).id,
      types: ['ENTRY'],
      limit: 5,
    });
    assert.equal(entries[0].reversibleQuantity, 100);

    try {
      reverseWarehouseEntry(db, entries[0].id, 200, 'test reason', 'op');
      assert.fail('expected ApiError');
    } catch (err) {
      assert.ok(err instanceof ApiError);
      assert.ok(String((err as ApiError).code).startsWith('ERR_WAREHOUSE_REVERSAL_EXCEEDS'));
    }

    reverseWarehouseEntry(db, entries[0].id, 100, 'ok partial', 'op');
    const wh = db
      .prepare('SELECT quantity FROM warehouse_stock WHERE product_id = ?')
      .get('p1') as { quantity: number };
    assert.equal(wh.quantity, 0);
    const store = db.prepare('SELECT stock FROM products WHERE id = ?').get('p1') as { stock: number };
    assert.equal(store.stock, 100);
  });
});
