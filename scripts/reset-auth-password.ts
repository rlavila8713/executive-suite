/**
 * Emergency local password reset (no sign-in required).
 * Stop the API / Executive Suite first. A running server keeps SQLite in memory and
 * can overwrite this change on disk when it shuts down (you would still see the old password).
 *
 * Usage:
 *   DATA_DIR="/path/to/data" npx tsx scripts/reset-auth-password.ts --username admin --password 'NewPass123'
 *   DATA_DIR="..." npx tsx scripts/reset-auth-password.ts --password 'NewPass123'   # first manager user
 */
import { initDb, getDb, closeDb } from '../server/db.js';
import { setUserPassword } from '../server/auth.js';
import { issueNewRecoveryCode } from '../server/authRecovery.js';
import { ROLE_MANAGER } from '../server/rbac.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const port = process.env.PORT?.trim() || '4000';
try {
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  if (res.ok) {
    console.warn(
      `Warning: API is running on port ${port}. Stop it before resetting or the old password may be written back to disk.`,
    );
  }
} catch {
  /* server not up — good */
}

const username = arg('--username')?.trim();
const password = arg('--password');
if (!password?.trim()) {
  console.error('Missing --password (min 8 chars for manager).');
  process.exit(1);
}

await initDb();
const db = getDb();

let userId: string | undefined;
if (username) {
  const row = db
    .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?) AND active = 1 LIMIT 1`)
    .get(username) as { id: string } | undefined;
  if (!row) {
    console.error(`No active user with username "${username}".`);
    closeDb();
    process.exit(1);
  }
  userId = row.id;
} else {
  const row = db
    .prepare(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.key = ?
       ORDER BY u.created_at ASC LIMIT 1`,
    )
    .get(ROLE_MANAGER) as { id: string } | undefined;
  if (!row) {
    console.error('No manager user in database.');
    closeDb();
    process.exit(1);
  }
  userId = row.id;
}

setUserPassword(db, userId, password.trim(), true);
const recoveryCode = issueNewRecoveryCode(db);
closeDb();

console.log('Password updated.');
console.log('New recovery code (save it):', recoveryCode);
