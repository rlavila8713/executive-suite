import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeDb, getDb, initDb } from '../server/db.js';
import {
  createAppUser,
  migrateRbacSchema,
  mobileModulesForPermissions,
  permissionKeysForUser,
  resolveDeviceAccessContext,
  setDeviceOperatorAssignment,
  ROLE_SELLER,
} from '../server/rbac.js';
import { touchConnectedDevice } from '../server/connectedDevices.js';

test('seller permissions expose expected mobile modules', () => {
  const modules = mobileModulesForPermissions([
    'sales.checkout',
    'catalog.view',
    'inventory.view',
    'cash.session',
  ]);
  assert.deepEqual(modules.sort(), ['cash', 'customers', 'inventory', 'pos'].sort());
});

test('device access resolves operator user and permissions', async () => {
  await initDb();
  const db = getDb();
  migrateRbacSchema(db);

  const seller = createAppUser(db, { displayName: 'Ana Vendedora', roleKey: ROLE_SELLER });
  const deviceId = 'rbac-test-device';
  touchConnectedDevice(db, deviceId, 'test', 'mobile');
  setDeviceOperatorAssignment(db, deviceId, { operatorId: seller.operatorId });

  const ctx = resolveDeviceAccessContext(db, deviceId);
  assert.equal(ctx.operator?.displayName, 'Ana Vendedora');
  assert.equal(ctx.user?.roleKey, ROLE_SELLER);
  assert.ok(ctx.permissions.includes('sales.checkout'));
  assert.ok(ctx.mobileModules.includes('pos'));
  assert.equal(permissionKeysForUser(db, seller.id).includes('admin.dangerous'), false);

  closeDb();
});
