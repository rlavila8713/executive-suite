#!/usr/bin/env node
/**
 * Rough benchmark: sql.js export/write time vs number of embedded product images.
 * Usage: node scripts/benchmark-image-db.mjs
 */
import initSqlJs from 'sql.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function bench(label, imageCount) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE products (id TEXT PRIMARY KEY, image TEXT NOT NULL)`);
  for (let i = 0; i < imageCount; i++) {
    db.run('INSERT INTO products VALUES (?, ?)', [`p${i}`, tinyPng]);
  }
  const t0 = Date.now();
  const data = db.export();
  const exportMs = Date.now() - t0;
  const tmp = path.join(os.tmpdir(), `bench-${imageCount}.sqlite`);
  const t1 = Date.now();
  fs.writeFileSync(tmp, Buffer.from(data));
  const writeMs = Date.now() - t1;
  const size = data.byteLength;
  fs.unlinkSync(tmp);
  console.log(JSON.stringify({ label, imageCount, exportMs, writeMs, sizeBytes: size }));
}

await bench('no-images', 0);
await bench('100-images', 100);
await bench('600-images', 600);
