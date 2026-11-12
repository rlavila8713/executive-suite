/**
 * JSON backup format version (`GET /api/backup` → `schemaVersion`).
 * Bump when export shape or import semantics change; keep client `src/lib/backup.ts` in sync.
 */
export const BACKUP_SCHEMA_VERSION = 9;

export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type SupportedBackupSchemaVersion = (typeof SUPPORTED_BACKUP_SCHEMA_VERSIONS)[number];

export function isSupportedBackupSchemaVersion(version: unknown): version is SupportedBackupSchemaVersion {
  return (
    typeof version === 'number' &&
    (SUPPORTED_BACKUP_SCHEMA_VERSIONS as readonly number[]).includes(version)
  );
}

/** Human-readable changelog for docs and diagnostics. */
export const BACKUP_SCHEMA_CHANGELOG: Record<number, string> = {
  1: 'Productos, transacciones, gastos, ajustes.',
  2: 'Categorías explícitas y campos catálogo v2 en productos.',
  3: 'Sesiones de caja.',
  4: 'Subcategorías y ubicaciones.',
  5: 'Clientes en export.',
  6: 'Módulo almacén completo (warehouses, stock, movimientos).',
  7: 'Control de acceso RBAC (accessControl).',
  8: 'Categorías de gasto, auditoría admin, licencia.',
  9: 'Proveedores y órdenes de compra (sin binarios de fotos de factura).',
};
