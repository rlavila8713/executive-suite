import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import initSqlJs from 'sql.js';
import { closeDb, getDbPath, initDb } from '../server/db.js';
import { persistDatabaseAtomic } from '../server/persistDb.js';

describe('persistDatabaseAtomic', () => {
  let dataDir = '';

  before(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'es-persist-'));
    process.env.DATA_DIR = dataDir;
    closeDb();
    await initDb();
  });

  after(() => {
    closeDb();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes main file and leaves no stale tmp on success', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE t (id INTEGER)');
    db.run('INSERT INTO t VALUES (1)');
    persistDatabaseAtomic(db);
    const main = getDbPath();
    assert.ok(fs.existsSync(main));
    assert.ok(!fs.existsSync(`${main}.tmp`));
    assert.ok(fs.statSync(main).size > 0);
  });

  it('does not replace main file when export would fail', () => {
    const main = getDbPath();
    const before = fs.readFileSync(main);
    const bad = { export: () => { throw new Error('export failed'); } };
    try {
      persistDatabaseAtomic(bad as never);
      assert.fail('expected throw');
    } catch {
      const after = fs.readFileSync(main);
      assert.equal(after.compare(before), 0);
    }
  });
});
