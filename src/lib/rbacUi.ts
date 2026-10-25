import type { AppPermission, AppRoleKey } from '../types';

export type PermissionGroupId =
  | 'sales'
  | 'cash'
  | 'inventory'
  | 'warehouse'
  | 'catalog'
  | 'reports'
  | 'administration';

export const PERMISSION_GROUP_ORDER: PermissionGroupId[] = [
  'sales',
  'cash',
  'inventory',
  'warehouse',
  'catalog',
  'reports',
  'administration',
];

/** Maps permission keys to mobile module ids (mirrors server MOBILE_MODULES). */
export function mobileModulesForPermissionKeys(permissionKeys: string[]): string[] {
  const set = new Set(permissionKeys);
  const modules: string[] = [];
  if (set.has('sales.checkout')) modules.push('pos');
  if (set.has('cash.session')) modules.push('cash');
  if (set.has('inventory.view')) modules.push('inventory');
  if (set.has('warehouse.receive') || set.has('warehouse.transfer')) modules.push('warehouse');
  if (set.has('catalog.view')) modules.push('customers');
  return modules;
}

export function permissionsByGroup(
  catalog: AppPermission[],
): Map<PermissionGroupId, AppPermission[]> {
  const map = new Map<PermissionGroupId, AppPermission[]>();
  for (const id of PERMISSION_GROUP_ORDER) {
    map.set(id, []);
  }
  for (const perm of catalog) {
    const list = map.get(perm.group) ?? [];
    list.push(perm);
    map.set(perm.group, list);
  }
  for (const id of PERMISSION_GROUP_ORDER) {
    map.get(id)?.sort((a, b) => a.key.localeCompare(b.key));
  }
  return map;
}

export function rolePermissionDraft(
  roles: { key: AppRoleKey; permissionKeys: string[] }[],
  roleKey: AppRoleKey,
): Set<string> {
  const role = roles.find((r) => r.key === roleKey);
  return new Set(role?.permissionKeys ?? []);
}
