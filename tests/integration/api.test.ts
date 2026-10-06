import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { signLicense } from '../../server/licenseCrypto.js';
import { getDb } from '../../server/db.js';
import { LICENSE_PLANS } from '../../server/license.js';
import {
  api,
  getTestBaseUrl,
  setupTestServer,
  teardownTestServer,
  TEST_DEVICE_ID,
  fillStoreStockFromWarehouse,
} from './helpers.js';

function readPrivateKey(): string | null {
  const keyPath = path.join(process.cwd(), 'license-private.pem');
  if (!fs.existsSync(keyPath)) return null;
  return fs.readFileSync(keyPath, 'utf8');
}

function makeLicenseKey(deviceId: string, planId: 'monthly' | 'quarterly' | 'annual', privateKeyPem: string): string {
  const plan = LICENSE_PLANS[planId];
  return signLicense(
    {
      v: 1,
      deviceId,
      planId,
      issuedAt: Date.now(),
      days: plan.days,
      price: plan.price,
      nonce: randomBytes(8).toString('hex'),
    },
    privateKeyPem,
  );
}

describe('Executive Suite API integration', () => {
  before(async () => {
    await setupTestServer();
  });

  after(async () => {
    await teardownTestServer();
  });

  describe('health', () => {
    it('GET /health returns ok without device header', async () => {
      const res = await fetch(`${getTestBaseUrl()}/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { status: string };
      assert.equal(body.status, 'ok');
    });
  });

  describe('device binding', () => {
    it('rejects API calls without X-Device-Id', async () => {
      const res = await fetch(`${getTestBaseUrl()}/api/settings`);
      assert.equal(res.status, 403);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, 'ERR_DEVICE_REQUIRED');
    });

    it('allows multiple API clients on the same store server', async () => {
      const first = await api('/api/settings');
      assert.equal(first.status, 200);

      const second = await api('/api/products', { deviceId: 'other-device-xyz' });
      assert.equal(second.status, 200);
    });
  });

  describe('connected devices', () => {
    it('lists devices seen on the API and marks the current one', async () => {
      await api('/api/settings', {
        deviceId: 'mobile-client-1',
        headers: { 'User-Agent': 'Dart/3.0 (flutter)', 'X-Client-Kind': 'mobile' },
      });

      const list = await api<{
        items: {
          deviceId: string;
          clientKind: string;
          online: boolean;
          isCurrent: boolean;
        }[];
        total: number;
        page: number;
        pageSize: number;
      }>('/api/devices');
      assert.equal(list.status, 200);

      const mobile = list.body.items.find((d) => d.deviceId === 'mobile-client-1');
      assert.ok(mobile);
      assert.equal(mobile.clientKind, 'mobile');
      assert.equal(mobile.online, true);

      const current = list.body.items.find((d) => d.isCurrent);
      assert.ok(current);
      assert.equal(current.deviceId, TEST_DEVICE_ID);
    });

    it('paginates and filters devices by operator name or id', async () => {
      const ids = Array.from({ length: 12 }, (_, i) => `paginate-device-${i}`);
      for (const id of ids) {
        await api('/api/settings', { deviceId: id });
      }

      await api(`/api/devices/${ids[0]}/operator`, {
        method: 'PATCH',
        body: { operatorName: 'Maria Lopez' },
      });
      await api(`/api/devices/${ids[1]}/operator`, {
        method: 'PATCH',
        body: { operatorName: 'Carlos Ruiz' },
      });

      const page1 = await api<{ items: { deviceId: string }[]; total: number; page: number; pageSize: number }>(
        '/api/devices?page=1&pageSize=10',
      );
      assert.equal(page1.status, 200);
      assert.equal(page1.body.page, 1);
      assert.equal(page1.body.pageSize, 10);
      assert.equal(page1.body.items.length, 10);
      assert.ok(page1.body.total >= 12);

      const page2 = await api<{ items: { deviceId: string }[]; total: number }>('/api/devices?page=2&pageSize=10');
      assert.equal(page2.status, 200);
      assert.ok(page2.body.items.length >= 2);

      const byOperator = await api<{ items: { deviceId: string; operatorName: string }[]; total: number }>(
        '/api/devices?q=maria',
      );
      assert.equal(byOperator.status, 200);
      assert.equal(byOperator.body.total, 1);
      assert.equal(byOperator.body.items[0]?.deviceId, ids[0]);
      assert.equal(byOperator.body.items[0]?.operatorName, 'Maria Lopez');

      const byId = await api<{ items: { deviceId: string }[]; total: number }>(
        `/api/devices?q=${encodeURIComponent('paginate-device-5')}`,
      );
      assert.equal(byId.status, 200);
      assert.equal(byId.body.total, 1);
      assert.equal(byId.body.items[0]?.deviceId, ids[5]);
    });

    it('revokes a device and blocks further API access', async () => {
      const victim = 'revoke-me-device';
      await api('/api/settings', { deviceId: victim });

      const revoke = await api('/api/devices/revoke-me-device/revoke', { method: 'POST' });
      assert.equal(revoke.status, 200);

      const blocked = await api('/api/settings', { deviceId: victim });
      assert.equal(blocked.status, 403);
      const body = blocked.body as { code: string };
      assert.equal(body.code, 'ERR_DEVICE_REVOKED');
    });

    it('cannot revoke the current device', async () => {
      const res = await api(`/api/devices/${TEST_DEVICE_ID}/revoke`, { method: 'POST' });
      assert.equal(res.status, 400);
      const body = res.body as { code: string };
      assert.equal(body.code, 'ERR_DEVICE_REVOKE_SELF');
    });
  });

  describe('settings', () => {
    it('GET and PATCH app settings', async () => {
      const get0 = await api<{ storeName: string }>('/api/settings');
      assert.equal(get0.status, 200);
      assert.equal(get0.body.storeName, 'Mi tienda');

      const patch = await api('/api/settings', {
        method: 'PATCH',
        body: { storeName: 'Tienda Test', branch: 'Centro', transferBank: 'BANDEC', transferAccountNumber: '123', transferPhoneNumber: '+53 5 123 4567' },
      });
      assert.equal(patch.status, 200);
      const patched = patch.body as { storeName: string; branch: string; transferBank: string; transferAccountNumber: string; transferPhoneNumber: string };
      assert.equal(patched.storeName, 'Tienda Test');
      assert.equal(patched.branch, 'Centro');
      assert.equal(patched.transferBank, 'BANDEC');
      assert.equal(patched.transferAccountNumber, '123');
      assert.equal(patched.transferPhoneNumber, '51234567');
    });

    it('saves store logo and serves it via /settings/logo', async () => {
      const tinyPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const patch = await api<{ storeLogoUrl: string | null }>('/api/settings', {
        method: 'PATCH',
        body: { storeLogo: tinyPng },
      });
      assert.equal(patch.status, 200);
      assert.ok(patch.body.storeLogoUrl?.includes('/api/settings/logo'));

      const logo = await api<string>(patch.body.storeLogoUrl!, { headers: {} });
      assert.equal(logo.status, 200);
      assert.ok(typeof logo.body === 'string' || logo.body);
    });
  });

  describe('warehouse', () => {
    it('seeds default warehouse stock without changing store stock on migration', async () => {
      const product = await api<{ id: string; stock: number }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Tornillo',
          sku: 'TOR-001',
          category: 'Ferretería',
          price: 5,
          cost: 2,
          stock: 0,
        },
      });
      assert.equal(product.status, 201);
      assert.equal(product.body.stock, 0);

      const stock = await api<{ productId: string; quantity: number }[]>('/api/warehouse/stock');
      assert.equal(stock.status, 200);
      const row = stock.body.find((r) => r.productId === product.body.id);
      assert.ok(row);
      assert.equal(row!.quantity, 0);
    });

    it('receives to warehouse and transfers to store', async () => {
      const product = await api<{ id: string; stock: number }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Clavo',
          sku: 'CLA-001',
          category: 'Ferretería',
          price: 3,
          cost: 1,
          stock: 0,
        },
      });
      assert.equal(product.status, 201);

      const receive = await api<{ newWarehouseQty: number; product: { stock: number } }>(
        `/api/products/${product.body.id}/receive`,
        { method: 'POST', body: { quantity: 10, unitCost: 1, price: 3 } },
      );
      assert.equal(receive.status, 200);
      assert.equal(receive.body.newWarehouseQty, 10);
      assert.equal(receive.body.product.stock, 0);
      assert.equal(receive.body.product.cost, 0);
      assert.equal(receive.body.product.warehouseCost, 1);
      assert.equal(receive.body.product.price, 3);

      const transfer = await api<{ product: { stock: number; cost: number; price: number }; warehouseStock: { quantity: number } }>(
        `/api/warehouse/stock/${product.body.id}/transfer-to-store`,
        { method: 'POST', body: { quantity: 4, price: 3 } },
      );
      assert.equal(transfer.status, 200);
      assert.equal(transfer.body.product.stock, 4);
      assert.equal(transfer.body.product.cost, 1);
      assert.equal(transfer.body.warehouseStock.quantity, 6);
    });
  });

  describe('products & categories', () => {
    it('creates category and product; blocks direct store stock edits', async () => {
      const cat = await api<{ id: string; name: string }>('/api/categories', {
        method: 'POST',
        body: { name: 'Bebidas' },
      });
      assert.equal(cat.status, 201);

      const product = await api<{ id: string; stock: number }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Agua 500ml',
          sku: 'AGU-001',
          category: 'Bebidas',
          categoryId: cat.body.id,
          price: 50,
          cost: 20,
          stock: 0,
        },
      });
      assert.equal(product.status, 201);
      assert.equal(product.body.stock, 0);

      await fillStoreStockFromWarehouse(product.body.id, 10, 20, 50);
      const refreshed = await api<{ stock: number }>(`/api/products/${product.body.id}`);
      assert.equal(refreshed.body.stock, 10);

      const stock = await api<{ code?: string }>(`/api/products/${product.body.id}/stock`, {
        method: 'PATCH',
        body: { stock: 7 },
      });
      assert.equal(stock.status, 409);
      assert.equal(stock.body.code, 'ERR_STORE_STOCK_DIRECT_EDIT');

      const list = await api<{ id: string }[]>('/api/products?includeImages=false');
      assert.equal(list.status, 200);
      assert.ok(list.body.some((p) => p.id === product.body.id));
    });
  });

  describe('expenses', () => {
    it('creates, updates and deletes a normal expense', async () => {
      const created = await api<{ id: string; title: string; locked?: boolean }>('/api/expenses', {
        method: 'POST',
        body: { title: 'Luz', amount: 100, category: 'Operaciones', date: '2026-01-15' },
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.locked, false);

      const updated = await api(`/api/expenses/${created.body.id}`, {
        method: 'PATCH',
        body: { amount: 120 },
      });
      assert.equal(updated.status, 200);

      const deleted = await api(`/api/expenses/${created.body.id}`, { method: 'DELETE' });
      assert.equal(deleted.status, 204);
    });
  });

  describe('cash sessions', () => {
    it('opens session, blocks duplicate open, closes with anomaly detection', async () => {
      const open = await api<{ id: string }>('/api/cash-sessions', {
        method: 'POST',
        body: { openingCash: 100 },
      });
      assert.equal(open.status, 201);

      const dup = await api('/api/cash-sessions', { method: 'POST', body: { openingCash: 50 } });
      assert.equal(dup.status, 409);
      const dupErr = dup.body as { code: string };
      assert.equal(dupErr.code, 'ERR_CASH_SESSION_OPEN');

      const closed = await api<{
        id: string;
        closingCash: number;
        totalCashSales: number;
        anomalies: { kind: string }[];
      }>(`/api/cash-sessions/${open.body.id}/close`, {
        method: 'POST',
        body: { closingCash: 150 },
      });
      assert.equal(closed.status, 200);
      assert.equal(closed.body.closingCash, 150);
      // No cash sales but closing > opening — may flag surplus
      assert.ok(Array.isArray(closed.body.anomalies));

      const corrected = await api<{ closingCash: number; anomalies: { kind: string }[] }>(
        `/api/cash-sessions/${open.body.id}/correct-close`,
        { method: 'POST', body: { closingCash: 100 } },
      );
      assert.equal(corrected.status, 200);
      assert.equal(corrected.body.closingCash, 100);
      assert.ok(Array.isArray(corrected.body.anomalies));
    });

    it('requires closing yesterday’s session before allowing a new sale', async () => {
      const opened = await api<{ id: string }>('/api/cash-sessions', {
        method: 'POST',
        body: { openingCash: 0 },
      });
      assert.equal(opened.status, 201);

      const db = getDb();
      db.prepare('UPDATE cash_sessions SET opened_at = ? WHERE id = ?').run(
        Date.now() - 24 * 60 * 60 * 1000,
        opened.body.id,
      );
      const blocked = await api('/api/sales', {
        method: 'POST',
        body: {
          customerName: 'Cliente', amount: 10,
          receipt: { lines: [{ sku: 'NO-STOCK', quantity: 1 }], total: 10, paymentMethod: 'cash' },
        },
      });
      assert.equal(blocked.status, 409);
      assert.equal((blocked.body as { code: string }).code, 'ERR_CASH_SESSION_DAILY_CLOSE_REQUIRED');

      const closed = await api(`/api/cash-sessions/${opened.body.id}/close`, {
        method: 'POST', body: { closingCash: 0 },
      });
      assert.equal(closed.status, 200);
    });

    it('refuses to open a session when the system clock predates recorded cash activity', async () => {
      const db = getDb();
      const future = Date.now() + 24 * 60 * 60 * 1000;
      db.prepare(
        `INSERT INTO cash_sessions (id, opened_at, closed_at, opening_cash, closing_cash, total_cash_sales, total_card_sales, total_transfer_sales, total_other_sales)
         VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0)`,
      ).run('future-cash-session', future, future);

      const blocked = await api('/api/cash-sessions', { method: 'POST', body: { openingCash: 0 } });
      assert.equal(blocked.status, 409);
      assert.equal((blocked.body as { code: string }).code, 'ERR_CASH_CLOCK_ROLLBACK');

      db.prepare('DELETE FROM cash_sessions WHERE id = ?').run('future-cash-session');
    });

    it('rejects a clock rollback within an open session after a cash movement', async () => {
      const opened = await api<{ id: string }>('/api/cash-sessions', {
        method: 'POST', body: { openingCash: 0 },
      });
      assert.equal(opened.status, 201);
      const sale = await api<{ id: string }>('/api/sales', {
        method: 'POST',
        body: {
          customerName: 'Cliente', amount: 10,
          receipt: { lines: [{ sku: 'NO-STOCK', quantity: 1 }], total: 10, paymentMethod: 'cash' },
        },
      });
      assert.equal(sale.status, 201);

      const db = getDb();
      db.prepare('UPDATE transactions SET created_at = ? WHERE id = ?').run(Date.now() + 60_000, sale.body.id);
      const blocked = await api('/api/sales', {
        method: 'POST',
        body: {
          customerName: 'Cliente', amount: 10,
          receipt: { lines: [{ sku: 'NO-STOCK', quantity: 1 }], total: 10, paymentMethod: 'cash' },
        },
      });
      assert.equal(blocked.status, 409);
      assert.equal((blocked.body as { code: string }).code, 'ERR_CASH_CLOCK_ROLLBACK');

      db.prepare('UPDATE transactions SET created_at = ? WHERE id = ?').run(Date.now(), sale.body.id);
      const closed = await api(`/api/cash-sessions/${opened.body.id}/close`, {
        method: 'POST', body: { closingCash: 10 },
      });
      assert.equal(closed.status, 200);
    });
  });

  describe('sales', () => {
    it('requires open cash session', async () => {
      const product = await api<{ id: string; sku: string }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Pan',
          sku: 'PAN-01',
          category: 'Alimentos',
          price: 10,
          cost: 4,
          stock: 0,
        },
      });
      assert.equal(product.status, 201);
      await fillStoreStockFromWarehouse(product.body.id, 5, 4, 10);

      const sale = await api('/api/sales', {
        method: 'POST',
        body: {
          customerName: 'Cliente',
          amount: 10,
          receipt: {
            lines: [{ productId: product.body.id, sku: product.body.sku, quantity: 1 }],
            total: 10,
            paymentMethod: 'cash',
          },
        },
      });
      assert.equal(sale.status, 409);
      const err = sale.body as { code: string };
      assert.equal(err.code, 'ERR_CASH_SESSION_REQUIRED');
    });

    it('completes a sale and records its reversal as a new immutable return', async () => {
      const product = await api<{ id: string; sku: string; stock: number }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Refresco',
          sku: 'REF-01',
          category: 'Bebidas',
          price: 25,
          cost: 10,
          stock: 0,
        },
      });
      assert.equal(product.status, 201);
      await fillStoreStockFromWarehouse(product.body.id, 8, 10, 25);

      const session = await api<{ id: string }>('/api/cash-sessions', {
        method: 'POST',
        body: { openingCash: 0 },
      });
      assert.equal(session.status, 201);

      const sale = await api<{ id: string; amount: number }>('/api/sales', {
        method: 'POST',
        body: {
          customerName: 'Ana',
          amount: 25,
          receipt: {
            lines: [{ productId: product.body.id, sku: product.body.sku, quantity: 1 }],
            total: 25,
            paymentMethod: 'cash',
          },
        },
      });
      assert.equal(sale.status, 201);
      assert.equal(sale.body.amount, 25);

      const refreshed = await api<{ stock: number }>(`/api/products/${product.body.id}`);
      assert.equal(refreshed.status, 200);
      assert.equal(refreshed.body.stock, 7);

      const reversal = await api<{
        id: string;
        amount: number;
        type: string;
        status: string;
        sourceSaleId?: string;
      }>(`/api/transactions/${sale.body.id}/reverse`, { method: 'POST' });
      assert.equal(reversal.status, 200);
      assert.equal(reversal.body.amount, -25);
      assert.equal(reversal.body.type, 'return');
      assert.equal(reversal.body.status, 'refunded');
      assert.equal(reversal.body.sourceSaleId, sale.body.id);

      const restored = await api<{ stock: number }>(`/api/products/${product.body.id}`);
      assert.equal(restored.body.stock, 8);
      const transactions = await api<{ id: string; status: string }[]>('/api/transactions');
      assert.equal(transactions.body.find((tx) => tx.id === sale.body.id)?.status, 'completed');

      const duplicate = await api(`/api/transactions/${sale.body.id}/reverse`, { method: 'POST' });
      assert.equal(duplicate.status, 409);
      assert.equal((duplicate.body as { code: string }).code, 'ERR_SALE_ALREADY_REVERSED');

      const closed = await api<{ totalCashSales: number }>(`/api/cash-sessions/${session.body.id}/close`, {
        method: 'POST',
        body: { closingCash: 0 },
      });
      assert.equal(closed.status, 200);
      assert.equal(closed.body.totalCashSales, 0);
    });

    it('accepts mixed cash + transfer on web and rejects on mobile', async () => {
      const product = await api<{ id: string; sku: string }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Combo',
          sku: 'COM-01',
          category: 'General',
          price: 100,
          cost: 40,
          stock: 0,
        },
      });
      assert.equal(product.status, 201);
      await fillStoreStockFromWarehouse(product.body.id, 5, 40, 100);

      await api('/api/settings', { method: 'PATCH', body: { taxRate: 10 } });

      const session = await api<{ id: string }>('/api/cash-sessions', {
        method: 'POST',
        body: { openingCash: 0 },
      });
      assert.equal(session.status, 201);

      const mobileBlocked = await api('/api/sales', {
        method: 'POST',
        headers: { 'X-Client-Kind': 'mobile', 'User-Agent': 'Dart/3.0 (flutter)' },
        body: {
          customerName: 'Cliente',
          amount: 105,
          receipt: {
            subtotal: 100,
            tax: 5,
            taxRatePercent: 10,
            total: 105,
            paymentMethod: 'mixed',
            payments: [{ method: 'cash', amount: 50 }, { method: 'transfer', amount: 55 }],
            lines: [{ productId: product.body.id, sku: product.body.sku, quantity: 1 }],
          },
        },
      });
      assert.equal(mobileBlocked.status, 403);
      assert.equal((mobileBlocked.body as { code: string }).code, 'ERR_MIXED_WEB_ONLY');

      const mixed = await api<{ amount: number; receipt: { total: number; payments: { method: string; amount: number }[] } }>(
        '/api/sales',
        {
          method: 'POST',
          body: {
            customerName: 'Cliente',
            amount: 105,
            receipt: {
              subtotal: 100,
              tax: 5,
              taxRatePercent: 10,
              total: 105,
              paymentMethod: 'mixed',
              payments: [{ method: 'cash', amount: 50 }, { method: 'transfer', amount: 55 }],
              lines: [{ productId: product.body.id, sku: product.body.sku, quantity: 1 }],
            },
          },
        },
      );
      assert.equal(mixed.status, 201);
      assert.equal(mixed.body.amount, 105);
      assert.equal(mixed.body.receipt.payments.length, 2);

      const closed = await api<{ totalCashSales: number; totalTransferSales: number }>(
        `/api/cash-sessions/${session.body.id}/close`,
        { method: 'POST', body: { closingCash: 50 } },
      );
      assert.equal(closed.status, 200);
      assert.equal(closed.body.totalCashSales, 50);
      assert.equal(closed.body.totalTransferSales, 55);
    });

    it('rejects selling more units than available stock', async () => {
      const product = await api<{ id: string; sku: string }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Agua',
          sku: 'AGU-01',
          category: 'Bebidas',
          price: 5,
          cost: 1,
          stock: 0,
        },
      });
      assert.equal(product.status, 201);
      await fillStoreStockFromWarehouse(product.body.id, 1, 1, 5);

      const session = await api<{ id: string }>('/api/cash-sessions', {
        method: 'POST',
        body: { openingCash: 0 },
      });
      assert.equal(session.status, 201);

      const blocked = await api('/api/sales', {
        method: 'POST',
        body: {
          customerName: 'Ana',
          amount: 10,
          receipt: {
            lines: [{ productId: product.body.id, sku: product.body.sku, quantity: 2, name: 'Agua' }],
            total: 10,
            paymentMethod: 'cash',
          },
        },
      });
      assert.equal(blocked.status, 409);
      assert.ok(String((blocked.body as { code: string }).code).startsWith('ERR_INSUFFICIENT_STOCK'));

      await api(`/api/cash-sessions/${session.body.id}/close`, { method: 'POST', body: { closingCash: 0 } });
    });
  });

  describe('operators', () => {
    it('stamps the assigned operator on mobile sales and ignores client-supplied names', async () => {
      const mobileId = 'mobile-seller-1';
      await api('/api/settings', {
        deviceId: mobileId,
        headers: { 'X-Client-Kind': 'mobile', 'User-Agent': 'Dart/3.0 (flutter)' },
      });

      const assigned = await api<{ operatorName: string }>(`/api/devices/${mobileId}/operator`, {
        method: 'PATCH',
        body: { operatorName: 'María' },
      });
      assert.equal(assigned.status, 200);
      assert.equal(assigned.body.operatorName, 'María');

      const product = await api<{ id: string; sku: string }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Jugo',
          sku: 'JUG-01',
          category: 'Bebidas',
          price: 12,
          cost: 4,
          stock: 0,
        },
      });
      assert.equal(product.status, 201);
      await fillStoreStockFromWarehouse(product.body.id, 3, 4, 12);

      const session = await api<{ id: string }>('/api/cash-sessions', {
        method: 'POST',
        body: { openingCash: 0 },
      });
      assert.equal(session.status, 201);

      const sale = await api<{ operatorName?: string; receipt?: { operatorName?: string } }>('/api/sales', {
        method: 'POST',
        deviceId: mobileId,
        headers: { 'X-Client-Kind': 'mobile', 'User-Agent': 'Dart/3.0 (flutter)' },
        body: {
          customerName: 'Luis',
          amount: 12,
          receipt: {
            lines: [{ productId: product.body.id, sku: product.body.sku, quantity: 1 }],
            total: 12,
            paymentMethod: 'cash',
            operatorName: 'Hacker',
          },
        },
      });
      assert.equal(sale.status, 201);
      assert.equal(sale.body.operatorName, 'María');
      assert.equal(sale.body.receipt?.operatorName, 'María');

      await api(`/api/cash-sessions/${session.body.id}/close`, { method: 'POST', body: { closingCash: 12 } });
    });

    it('blocks mobile sales until an operator is assigned', async () => {
      const mobileId = 'mobile-no-operator';
      await api('/api/settings', {
        deviceId: mobileId,
        headers: { 'X-Client-Kind': 'mobile', 'User-Agent': 'Dart/3.0 (flutter)' },
      });

      const session = await api<{ id: string }>('/api/cash-sessions', {
        method: 'POST',
        body: { openingCash: 0 },
      });
      assert.equal(session.status, 201);

      const blocked = await api('/api/sales', {
        method: 'POST',
        deviceId: mobileId,
        headers: { 'X-Client-Kind': 'mobile', 'User-Agent': 'Dart/3.0 (flutter)' },
        body: {
          customerName: 'Luis',
          amount: 5,
          receipt: {
            lines: [{ sku: 'NO-STOCK', quantity: 1 }],
            total: 5,
            paymentMethod: 'cash',
          },
        },
      });
      assert.equal(blocked.status, 409);
      assert.equal((blocked.body as { code: string }).code, 'ERR_OPERATOR_REQUIRED');

      await api(`/api/cash-sessions/${session.body.id}/close`, { method: 'POST', body: { closingCash: 0 } });
    });

    it('rejects operator assignment from a mobile client', async () => {
      const mobileId = 'mobile-cannot-assign';
      await api('/api/settings', {
        deviceId: mobileId,
        headers: { 'X-Client-Kind': 'mobile', 'User-Agent': 'Dart/3.0 (flutter)' },
      });
      const res = await api(`/api/devices/${mobileId}/operator`, {
        method: 'PATCH',
        deviceId: mobileId,
        headers: { 'X-Client-Kind': 'mobile', 'User-Agent': 'Dart/3.0 (flutter)' },
        body: { operatorName: 'Yo mismo' },
      });
      assert.equal(res.status, 403);
      assert.equal((res.body as { code: string }).code, 'ERR_OPERATOR_ASSIGN_FORBIDDEN');
    });
  });

  describe('license', () => {
    it('starts in trial and generates request code', async () => {
      const lic = await api<{
        status: string;
        trialDaysRemaining: number;
        deviceId: string;
      }>('/api/license');
      assert.equal(lic.status, 200);
      assert.equal(lic.body.status, 'trial');
      assert.ok(lic.body.trialDaysRemaining > 0);

      const req = await api<{ requestCode: string; payload: { planId: string; deviceId: string } }>(
        '/api/license/request',
        { method: 'POST', body: { planId: 'monthly' } },
      );
      assert.equal(req.status, 200);
      assert.ok(req.body.requestCode.startsWith('ES-REQ1.'));
      assert.equal(req.body.payload.planId, 'monthly');
      assert.equal(req.body.payload.deviceId, TEST_DEVICE_ID);
    });

    it('activates signed license and creates locked expense', async () => {
      const privateKey = readPrivateKey();
      if (!privateKey) {
        console.warn('Skipping license activation test: license-private.pem not found');
        return;
      }

      const licenseKey = makeLicenseKey(TEST_DEVICE_ID, 'monthly', privateKey);
      const activated = await api<{
        license: { status: string; planId: string };
        paidUntil: number;
      }>('/api/license/activate', {
        method: 'POST',
        body: { licenseKey },
      });
      assert.equal(activated.status, 201);
      assert.equal(activated.body.license.status, 'active');
      assert.equal(activated.body.license.planId, 'monthly');
      assert.ok(activated.body.paidUntil > Date.now());

      const expenses = await api<{ id: string; title: string; locked: boolean; category: string }[]>('/api/expenses');
      assert.equal(expenses.status, 200);
      const licenseExpense = expenses.body.find((e) => e.category === 'Licencia de uso');
      assert.ok(licenseExpense);
      assert.equal(licenseExpense!.locked, true);

      const patchExpense = await api(`/api/expenses/${(expenses.body.find((e) => e.locked)!).id}`, {
        method: 'PATCH',
        body: { amount: 1 },
      });
      assert.equal(patchExpense.status, 403);

      const reuse = await api('/api/license/activate', {
        method: 'POST',
        body: { licenseKey },
      });
      assert.equal(reuse.status, 400);
      const reuseErr = reuse.body as { code: string };
      assert.equal(reuseErr.code, 'ERR_LICENSE_ALREADY_USED');

      const renewalKey = makeLicenseKey(TEST_DEVICE_ID, 'quarterly', privateKey);
      const renewal = await api('/api/license/activate', { method: 'POST', body: { licenseKey: renewalKey } });
      assert.equal(renewal.status, 201);

      // A prior key remains redeemed even after a later plan activation.
      const reusedAfterRenewal = await api('/api/license/activate', {
        method: 'POST',
        body: { licenseKey },
      });
      assert.equal(reusedAfterRenewal.status, 400);
      assert.equal((reusedAfterRenewal.body as { code: string }).code, 'ERR_LICENSE_ALREADY_USED');
    });

    it('rejects license for wrong device', async () => {
      const privateKey = readPrivateKey();
      if (!privateKey) return;

      const licenseKey = makeLicenseKey('wrong-device-id', 'monthly', privateKey);
      const res = await api('/api/license/activate', {
        method: 'POST',
        body: { licenseKey },
      });
      assert.equal(res.status, 400);
      const err = res.body as { code: string };
      assert.equal(err.code, 'ERR_LICENSE_DEVICE_MISMATCH');
    });

    it('blocks mutations when trial expired', async () => {
      const db = getDb();
      db.prepare('UPDATE license_state SET trial_started_at = ?, paid_until = NULL').run(
        Date.now() - 20 * 24 * 60 * 60 * 1000,
      );

      const lic = await api<{ status: string }>('/api/license');
      assert.equal(lic.body.status, 'expired');

      const blocked = await api('/api/categories', { method: 'POST', body: { name: 'X' } });
      assert.equal(blocked.status, 403);
      const err = blocked.body as { code: string };
      assert.equal(err.code, 'ERR_LICENSE_EXPIRED');

      const resetBlocked = await api('/api/admin/factory-reset', { method: 'POST' });
      assert.equal(resetBlocked.status, 403);
      assert.equal((resetBlocked.body as { code: string }).code, 'ERR_LICENSE_EXPIRED');

      // License activate still allowed when expired
      const privateKey = readPrivateKey();
      if (privateKey) {
        const key = makeLicenseKey(TEST_DEVICE_ID, 'monthly', privateKey);
        const act = await api('/api/license/activate', { method: 'POST', body: { licenseKey: key } });
        assert.equal(act.status, 201);
      }
    });
  });

  describe('backup & factory reset', () => {
    it('exports backup JSON', async () => {
      const backup = await api<{ app: string; products: unknown[] }>('/api/backup');
      assert.equal(backup.status, 200);
      assert.equal(backup.body.app, 'executive-suite');
      assert.ok(Array.isArray(backup.body.products));
    });

    it('round-trips backup including warehouse_cost and warehouse stock', async () => {
      const created = await api<{ id: string }>('/api/products', {
        method: 'POST',
        body: { name: 'Backup SKU', sku: 'BKP-99', category: 'Test', stock: 0 },
      });
      assert.equal(created.status, 201);
      const productId = created.body.id;

      await api(`/api/products/${productId}/receive`, {
        method: 'POST',
        body: { quantity: 12, unitCost: 3.5, price: 9 },
      });
      await api(`/api/warehouse/stock/${productId}/transfer-to-store`, {
        method: 'POST',
        body: { quantity: 4, price: 9 },
      });

      const customer = await api<{ id: string }>('/api/customers', {
        method: 'POST',
        body: { firstName: 'María', lastName: 'López', phone: '555-0100' },
      });
      assert.equal(customer.status, 201);

      const backup = await api<{
        schemaVersion: number;
        products: { id: string; warehouseCost: number; stock: number; cost: number }[];
        warehouseStock: { productId: string; quantity: number }[];
        warehouses: unknown[];
        customers: { id: string; firstName: string }[];
      }>('/api/backup');
      assert.equal(backup.status, 200);
      assert.equal(backup.body.schemaVersion, 6);
      const snap = backup.body.products.find((p) => p.id === productId);
      assert.ok(snap);
      assert.equal(snap!.warehouseCost, 3.5);
      assert.equal(snap!.stock, 4);
      assert.equal(snap!.cost, 3.5);
      assert.ok(backup.body.warehouses.length >= 1);
      assert.ok(backup.body.customers.some((c) => c.id === customer.body.id));
      const whRow = backup.body.warehouseStock.find((r) => r.productId === productId);
      assert.ok(whRow);
      assert.equal(whRow!.quantity, 8);

      const reset = await api('/api/admin/factory-reset', { method: 'POST' });
      assert.equal(reset.status, 200);

      const imported = await api('/api/backup/import', { method: 'POST', body: backup.body });
      assert.equal(imported.status, 200);

      const after = await api<{ id: string; warehouseCost: number; stock: number }[]>(
        '/api/products?includeImages=false',
      );
      const restored = after.body.find((p) => p.id === productId);
      assert.ok(restored);
      assert.equal(restored!.warehouseCost, 3.5);
      assert.equal(restored!.stock, 4);

      const wh = await api<{ productId: string; quantity: number }[]>('/api/warehouse/stock');
      const restoredWh = wh.body.find((r) => r.productId === productId);
      assert.ok(restoredWh);
      assert.equal(restoredWh!.quantity, 8);

      const customers = await api<{ id: string; firstName: string }[]>('/api/customers');
      assert.ok(customers.body.some((c) => c.id === customer.body.id && c.firstName === 'María'));
    });

    it('factory reset clears operational data without restarting the trial', async () => {
      const db = getDb();
      const trialStartedAt = Date.now() - 3 * 24 * 60 * 60 * 1000;
      db.prepare('UPDATE license_state SET trial_started_at = ?, paid_until = NULL').run(trialStartedAt);

      await api('/api/products', {
        method: 'POST',
        body: { name: 'Temp', sku: 'TMP-1', category: 'X', price: 1, cost: 1, stock: 0 },
      });

      const reset = await api('/api/admin/factory-reset', { method: 'POST' });
      assert.equal(reset.status, 200);

      const products = await api<unknown[]>('/api/products?includeImages=false');
      assert.equal(products.status, 200);
      assert.equal(products.body.length, 0);

      const settings = await api<{ storeName: string }>('/api/settings');
      assert.equal(settings.body.storeName, 'Mi tienda');

      const license = await api<{ status: string; trialStartedAt: number }>('/api/license');
      assert.equal(license.body.status, 'trial');
      assert.equal(license.body.trialStartedAt, trialStartedAt);
    });
  });
});
