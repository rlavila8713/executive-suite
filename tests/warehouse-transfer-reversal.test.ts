import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeDb, getDb, initDb } from '../server/db.js';
import {
  listReversalsForMovement,
  listWarehouseMovements,
  receiveProductToWarehouse,
  reverseWarehouseTransferToStore,
  transferWarehouseToStore,
  getDefaultWarehouse,
} from '../server/warehouse.js';

describe('warehouse transfer to store reversal', () => {
  let dataDir = '';

  before(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-wh-rev-'));
    process.env.DATA_DIR = dataDir;
    closeDb();
    await initDb();
    const db = getDb();
    db.prepare(
      `INSERT INTO products (id, name, sku, category, price, cost, stock, image, warehouse_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'Widget', 'W-1', 'Cat', 20, 0, 0, '', 0);
    receiveProductToWarehouse(db, 'p1', 100, 5, 20, null, 'test', null);
  });

  after(() => {
    closeDb();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns units from store to warehouse and records a reversal', () => {
    const db = getDb();
    transferWarehouseToStore(db, 'p1', 100, 20, 'op');
    const transfers = listWarehouseMovements(db, {
      warehouseId: getDefaultWarehouse(db).id,
      types: ['TRANSFER_TO_STORE'],
      limit: 10,
    });
    assert.equal(transfers.length, 1);
    const transferId = transfers[0].id;

    reverseWarehouseTransferToStore(db, transferId, 10, 'count error', 'op');

    const product = db.prepare('SELECT stock, cost FROM products WHERE id = ?').get('p1') as {
      stock: number;
      cost: number;
    };
    assert.equal(product.stock, 90);

    const wh = db
      .prepare('SELECT quantity FROM warehouse_stock WHERE product_id = ?')
      .get('p1') as { quantity: number };
    assert.equal(wh.quantity, 10);

    const enriched = listWarehouseMovements(db, {
      warehouseId: getDefaultWarehouse(db).id,
      types: ['TRANSFER_TO_STORE'],
      limit: 10,
    })[0];
    assert.equal(enriched.reversedQuantity ?? 0, 10);
    assert.equal(enriched.reversibleQuantity ?? 0, 90);
    assert.equal(enriched.reversedAt, null);

    const reversals = listWarehouseMovements(db, {
      warehouseId: getDefaultWarehouse(db).id,
      types: ['REVERSAL'],
      limit: 10,
    });
    assert.equal(reversals.length, 1);
    assert.equal(reversals[0].quantityDelta, 10);
    assert.equal(reversals[0].reversesMovementId, transferId);

    const history = listReversalsForMovement(db, transferId);
    assert.equal(history.length, 1);
    assert.equal(history[0].notes, 'count error');
  });
});
