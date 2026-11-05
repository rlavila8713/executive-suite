import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request } from 'express';
import { closeDb, getDb, initDb } from '../server/db.js';
import { migrateRbacSchema, createAppUser, updateRolePermissions, ROLE_SELLER } from '../server/rbac.js';
import {
  appendUserAdminAuditLog,
  listUserAdminAuditLogs,
  migrateUserAuditSchema,
} from '../server/userAuditLog.js';

function mockReq(overrides: Partial<{ deviceId: string; authorization: string }> = {}): Request {
  const headers = new Map<string, string>();
  if (overrides.deviceId) headers.set('X-Device-Id', overrides.deviceId);
  if (overrides.authorization) headers.set('Authorization', overrides.authorization);
  return {
    header(name: string) {
      return headers.get(name) ?? undefined;
    },
  } as Request;
}

test('user admin audit log stores and lists entries', async () => {
  await initDb();
  const db = getDb();
  migrateRbacSchema(db);
  migrateUserAuditSchema(db);

  appendUserAdminAuditLog(db, {
    action: 'user.created',
    req: mockReq({ deviceId: 'audit-test-device' }),
    details: { displayName: 'Test User', roleKey: ROLE_SELLER },
  });

  const rows = listUserAdminAuditLogs(db, { limit: 10 });
  assert.ok(rows.length >= 1);
  const created = rows.find((r) => r.action === 'user.created' && r.details.displayName === 'Test User');
  assert.ok(created);

  closeDb();
});

test('role permission update can be audited with diff', async () => {
  await initDb();
  const db = getDb();
  migrateRbacSchema(db);

  const user = createAppUser(db, { displayName: 'Audit Seller', roleKey: ROLE_SELLER });
  assert.ok(user.id);

  const before = updateRolePermissions(db, ROLE_SELLER, ['catalog.view', 'sales.checkout']);
  assert.ok(before.permissionKeys.includes('catalog.view'));

  appendUserAdminAuditLog(db, {
    action: 'role.permissions_updated',
    req: mockReq(),
    details: {
      roleKey: ROLE_SELLER,
      permissionKeysAdded: ['inventory.view'],
      permissionKeysRemoved: ['sales.checkout'],
    },
  });

  const rows = listUserAdminAuditLogs(db, { limit: 5 });
  assert.ok(rows.some((r) => r.action === 'role.permissions_updated'));

  closeDb();
});
