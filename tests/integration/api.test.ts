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

    it('binds first device and rejects a second device', async () => {
      const first = await api('/api/settings');
      assert.equal(first.status, 200);

      const second = await api('/api/products', { deviceId: 'other-device-xyz' });
      assert.equal(second.status, 403);
      const err = second.body as { code: string };
      assert.equal(err.code, 'ERR_DEVICE_MISMATCH');
    });
  });

  describe('settings', () => {
    it('GET and PATCH app settings', async () => {
      const get0 = await api<{ storeName: string }>('/api/settings');
      assert.equal(get0.status, 200);
      assert.equal(get0.body.storeName, 'Mi tienda');

      const patch = await api('/api/settings', {
        method: 'PATCH',
        body: { storeName: 'Tienda Test', branch: 'Centro' },
      });
      assert.equal(patch.status, 200);
      const patched = patch.body as { storeName: string; branch: string };
      assert.equal(patched.storeName, 'Tienda Test');
      assert.equal(patched.branch, 'Centro');
    });
  });

  describe('products & categories', () => {
    it('creates category and product, updates stock', async () => {
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
          stock: 10,
        },
      });
      assert.equal(product.status, 201);
      assert.equal(product.body.stock, 10);

      const stock = await api<{ stock: number }>(`/api/products/${product.body.id}/stock`, {
        method: 'PATCH',
        body: { stock: 7 },
      });
      assert.equal(stock.status, 200);
      assert.equal(stock.body.stock, 7);

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
          stock: 5,
        },
      });
      assert.equal(product.status, 201);

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

    it('completes sale and deducts stock', async () => {
      const product = await api<{ id: string; sku: string; stock: number }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Refresco',
          sku: 'REF-01',
          category: 'Bebidas',
          price: 25,
          cost: 10,
          stock: 8,
        },
      });
      assert.equal(product.status, 201);

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

      const expenses = await api<{ title: string; locked: boolean; category: string }[]>('/api/expenses');
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

    it('factory reset clears operational data', async () => {
      await api('/api/products', {
        method: 'POST',
        body: { name: 'Temp', sku: 'TMP-1', category: 'X', price: 1, cost: 1, stock: 1 },
      });

      const reset = await api('/api/admin/factory-reset', { method: 'POST' });
      assert.equal(reset.status, 200);

      const products = await api<unknown[]>('/api/products?includeImages=false');
      assert.equal(products.status, 200);
      assert.equal(products.body.length, 0);

      const settings = await api<{ storeName: string }>('/api/settings');
      assert.equal(settings.body.storeName, 'Mi tienda');
    });
  });
});
