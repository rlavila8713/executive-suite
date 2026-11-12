# Backup JSON — versionado (`schemaVersion`)

Exportación: `GET /api/backup`  
Importación: `POST /api/backup/import` (sustituye datos operativos; respeta licencia en reset de fábrica).

La constante canónica del servidor está en `server/backupSchema.ts` (`BACKUP_SCHEMA_VERSION`). La web usa el mismo número en `src/lib/backup.ts` → `BACKUP_SCHEMA_VERSION`.

## Versión actual: **9**

| Versión | Contenido principal |
|--------:|---------------------|
| 1 | Productos, ventas, gastos, ajustes |
| 2 | `productCategories` + campos catálogo v2 en productos |
| 3 | `cashSessions` |
| 4 | `productSubcategories`, `productLocations` |
| 5 | `customers` |
| 6 | `warehouses`, `warehouseSections`, `warehouseStock`, `warehouseMovements` |
| 7 | `accessControl` (usuarios, roles, dispositivos) |
| 8 | `expenseCategories`, `userAdminAudit`, `license` |
| **9** | **`suppliers`**, **`purchaseOrders`** (líneas embebidas) |

### v9 — compras a proveedores

Nuevos arrays en el JSON:

- `suppliers[]` — mismo wire que `GET /api/suppliers`.
- `purchaseOrders[]` — mismo wire que `GET /api/purchases/:id` (incluye `lines`, `totalCost`, estados).

**Limitación v9:** las fotos de factura viven en disco (`DATA_DIR/purchase-images/…`). El backup **no** incluye los binarios; solo se restauran órdenes y líneas. Tras importar, las URLs `…/images/:id` quedarán vacías hasta volver a subir desde el móvil.

Copias v1–v8 siguen importándose: `suppliers` y `purchaseOrders` se omiten (tablas vacías).

## Diagnóstico

`GET /api/diagnostics/summary` expone `database.backupSchemaVersion` (versión de export JSON) y `database.catalogSchemaVersion` (migraciones internas de catálogo SQLite — distinto concepto).

## Checklist al subir versión

1. Incrementar `BACKUP_SCHEMA_VERSION` en `server/backupSchema.ts` y `src/lib/backup.ts`.
2. Ampliar `applyBackupImport` en `server/backupImport.ts`.
3. Ampliar `GET /api/backup` en `server/routes.ts`.
4. Actualizar este documento y tests (`tests/integration/api.test.ts`, `tests/backup-parse.test.ts`).
5. Si el cambio afecta móvil, actualizar `docs/openapi-mobile-sync.yaml`.
