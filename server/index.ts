import { startServer } from './app.js';
import { initDb } from './db.js';

async function main() {
  await initDb();
  startServer();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
