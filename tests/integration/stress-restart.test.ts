import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import initSqlJs from 'sql.js';
import { closeDb, DB_PERSIST_DEBOUNCE_MS, getDbPath, initDb } from '../../server/db.js';
import {
  api,
  getTestDataDir,
  restartTestServer,
  setupTestServer,
  startTestServerHttp,
  stopTestServerHttp,
  teardownTestServer,
} from './helpers.js';

/** Same fan-out as `useAppState.refreshAll` (parallel API calls). */
const REFRESH_ENDPOINTS = [
  '/api/products?includeImages=false',
  '/api/transactions',
  '/api/expenses',
  '/api/settings',
  '/api/categories',
  '/api/subcategories',
  '/api/locations',
  '/api/customers',
  '/api/cash-sessions',
  '/api/license',
] as const;

function blockMainThreadMs(ms: number): void {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    // Simulates a frozen UI thread (heavy JSON parse, layout, etc.) while HTTP responses pile up.
  }
}

async function clientRefreshBurst(): Promise<void> {
  const results = await Promise.all(REFRESH_ENDPOINTS.map((path) => api(path)));
  for (const res of results) {
    assert.ok(res.ok, `refresh endpoint failed: ${res.status}`);
  }
}

async function readMarkerPriceFromDisk(markerSku: string): Promise<number | null> {
  const dbPath = getDbPath();
  assert.ok(fs.existsSync(dbPath), 'sqlite file must exist on disk');
  const SQL = await initSqlJs();
  const disk = new SQL.Database(fs.readFileSync(dbPath));
  try {
    const stmt = disk.prepare('SELECT price FROM products WHERE sku = ?');
    stmt.bind([markerSku]);
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as { price: number };
    return row.price;
  } finally {
    disk.close();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('invasive stress: UI freeze + API restart', () => {
  before(async () => {
    await setupTestServer();
  });

  after(async () => {
    await teardownTestServer();
  });

  it(
    'preserves catalog after refresh storm, main-thread block, image update, and service restart',
    async () => {
      const markerSku = `STRESS-MARKER-${Date.now()}`;
      const tinyPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      const cat = await api<{ id: string }>('/api/categories', {
        method: 'POST',
        body: { name: `StressCat-${markerSku}` },
      });
      assert.equal(cat.status, 201);

      let expectedPrice = 100;
      const created = await api<{ id: string; price: number; name: string }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Producto estrés',
          sku: markerSku,
          category: `StressCat-${markerSku}`,
          categoryId: cat.body.id,
          price: expectedPrice,
          cost: 40,
          stock: 0,
          image: '',
        },
      });
      assert.equal(created.status, 201);
      const productId = created.body.id;

      const stressRounds = 24;

      for (let round = 0; round < stressRounds; round++) {
        const refreshPromise = clientRefreshBurst();

        blockMainThreadMs(25);

        expectedPrice += 1;
        const priceRes = await api<{ price: number }>(`/api/products/${productId}`, {
          method: 'PATCH',
          body: { price: expectedPrice },
        });
        assert.equal(priceRes.status, 200);
        assert.equal(priceRes.body.price, expectedPrice);

        if (round % 6 === 0) {
          const imgRes = await api(`/api/products/${productId}`, {
            method: 'PATCH',
            body: { image: tinyPng },
          });
          assert.equal(imgRes.status, 200);
        }

        await refreshPromise;

        if (round % 4 === 0) {
          blockMainThreadMs(40);
          await clientRefreshBurst();
        }
      }

      const beforeRestart = await api<{ id: string; price: number }[]>(
        '/api/products?includeImages=false',
      );
      assert.equal(beforeRestart.status, 200);
      const markerLive = beforeRestart.body.find((p) => p.id === productId);
      assert.ok(markerLive);
      assert.equal(markerLive!.price, expectedPrice);

      await delay(DB_PERSIST_DEBOUNCE_MS + 80);
      const priceOnDisk = await readMarkerPriceFromDisk(markerSku);
      assert.equal(priceOnDisk, expectedPrice);

      await restartTestServer();

      const afterRestart = await api<{ id: string; price: number; name: string; sku: string }[]>(
        '/api/products?includeImages=false',
      );
      assert.equal(afterRestart.status, 200);
      const markerAfter = afterRestart.body.find((p) => p.sku === markerSku);
      assert.ok(markerAfter, 'marker product must survive API restart');
      assert.equal(markerAfter!.price, expectedPrice);
      assert.equal(markerAfter!.name, 'Producto estrés');

      const productCount = afterRestart.body.length;
      assert.ok(productCount >= 1);
      assert.ok(fs.existsSync(path.join(getTestDataDir(), 'executive-suite.sqlite')));
    },
    { timeout: 180_000 },
  );

  it(
    'preserves data after debounced flush even when DB close skips final flush (simulated hard kill after write)',
    async () => {
      const markerSku = `STRESS-HARD-${Date.now()}`;
      const markerPrice = 4242;
      const created = await api<{ id: string }>('/api/products', {
        method: 'POST',
        body: {
          name: 'Hard restart marker',
          sku: markerSku,
          category: 'General',
          price: markerPrice,
          cost: 1,
          stock: 0,
          image: '',
        },
      });
      assert.equal(created.status, 201);

      await delay(DB_PERSIST_DEBOUNCE_MS + 100);
      assert.equal(await readMarkerPriceFromDisk(markerSku), markerPrice);

      await stopTestServerHttp();
      closeDb({ skipFlush: true });
      await initDb();
      await startTestServerHttp();

      const list = await api<{ sku: string; price: number }[]>('/api/products?includeImages=false');
      const row = list.body.find((p) => p.sku === markerSku);
      assert.ok(row);
      assert.equal(row!.price, markerPrice);
    },
    { timeout: 60_000 },
  );
});
