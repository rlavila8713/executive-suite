import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { closeDb, getDb, initDb, newId } from '../server/db.js';
import { migrateMobileOfflineSchema, processMobileSale } from '../server/mobileOffline.js';
import { touchConnectedDevice } from '../server/connectedDevices.js';
import { migrateRbacSchema, createAppUser, ROLE_SELLER, setDeviceOperatorAssignment } from '../server/rbac.js';
import type { Request } from 'express';

function mockReq(deviceId: string): Request {
  return {
    header(name: string) {
      if (name === 'X-Device-Id') return deviceId;
      if (name === 'X-Client-Kind') return 'mobile';
      if (name === 'User-Agent') return 'Dart/3.0 (flutter)';
      return undefined;
    },
  } as Request;
}

test('processMobileSale is idempotent by clientSaleId', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-offline-unit-'));
  process.env.DATA_DIR = dataDir;
  closeDb();
  await initDb();
  const db = getDb();
  migrateRbacSchema(db);
  migrateMobileOfflineSchema(db);

  const sessionId = newId();
  db.prepare(
    `INSERT INTO cash_sessions (id, opened_at, closed_at, opening_cash, closing_cash, total_cash_sales, total_card_sales, total_transfer_sales, total_other_sales)
     VALUES (?, ?, NULL, 0, NULL, 0, 0, 0, 0)`,
  ).run(sessionId, Date.now());

  const seller = createAppUser(db, { displayName: 'Offline Seller', roleKey: ROLE_SELLER });
  touchConnectedDevice(db, 'offline-device', 'test', 'mobile');
  setDeviceOperatorAssignment(db, 'offline-device', { operatorId: seller.operatorId });

  const productId = 'prod-offline-1';
  db.prepare(
    `INSERT INTO products (id, name, sku, category, price, cost, stock, image) VALUES (?, 'Item', 'OFF-1', 'Cat', 10, 5, 5, '')`,
  ).run(productId);

  const clientSaleId = '11111111-1111-1111-1111-111111111111';
  const input = {
    clientSaleId,
    clientCreatedAt: Date.now(),
    cashSessionId: sessionId,
    syncOffline: true,
    operatorId: seller.operatorId,
    operatorName: seller.displayName,
    receipt: {
      lines: [{ productId, sku: 'OFF-1', quantity: 1 }],
      paymentMethod: 'cash',
      subtotal: 10,
      total: 10,
    },
  };

  const req = mockReq('offline-device');
  const first = processMobileSale(db, req, input);
  assert.equal(first.status, 'created');

  const second = processMobileSale(db, req, input);
  assert.equal(second.status, 'duplicate');
  assert.equal(second.transaction.id, first.transaction.id);

  const stock = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId) as { stock: number };
  assert.equal(stock.stock, 4);

  closeDb();
});
