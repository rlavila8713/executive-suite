import { startServer } from './app.js';
import { initDb, getDataDir, getDbPath } from './db.js';

async function main() {
  await initDb();
  console.info(
    JSON.stringify({
      event: 'SERVER_DATA_DIR',
      dataDir: getDataDir(),
      sqlitePath: getDbPath(),
    }),
  );
  startServer();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
