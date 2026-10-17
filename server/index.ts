import { startServer } from './app.js';
import { getDb, initDb, getDataDir, getDbPath } from './db.js';

async function main() {
  await initDb();
  const db = getDb();
  const products = (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c;
  console.info(
    JSON.stringify({
      event: 'SERVER_DATA_DIR',
      dataDir: getDataDir(),
      sqlitePath: getDbPath(),
      products,
    }),
  );
  startServer();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
