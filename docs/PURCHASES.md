# Compras a proveedores y recepción asistida en almacén

Flujo compartido entre **app móvil** (registro de compras) y **web** (revisión del encargado y autorización de entrada al depósito). Contrato detallado de handoff: ver también el adjunto histórico `API_CONTRACT_PURCHASES_AND_WAREHOUSE.md` en el repo móvil.

## Resumen

```
Móvil: proveedor + compra (draft) ──sync──► API
Web:   pendiente revisión ──confirmar líneas──► entradas almacén (referenceType: purchase)
```

| Actor | Acción |
|-------|--------|
| Móvil / back-office | CRUD proveedores y compras (`catalog.edit`) |
| Encargado web | Revisión de coste ponderado, productos nuevos, enlace al catálogo (`warehouse.receive`) |
| Móvil (opcional) | Recepción directa si `X-Client-Kind: mobile` y líneas confirmadas |

## Estados de compra

| Estado | Editable | Significado |
|--------|----------|-------------|
| `draft` | Sí | Registrada, sin movimientos de almacén |
| `pending_review` | No (líneas) | En cola web para autorización |
| `posted` | No | Recepcionada en almacén (`warehousePostedAt` ms) |
| `cancelled` | No | Anulada |

## API — proveedores

Base: `/api/suppliers` · Permiso: `catalog.edit` · Cliente: web o móvil.

| Método | Ruta | Notas |
|--------|------|-------|
| GET | `/api/suppliers` | Orden por nombre |
| POST | `/api/suppliers` | Body: `id?`, `name`, `address?`, `phone?` |
| PATCH | `/api/suppliers/:id` | Parcial |
| DELETE | `/api/suppliers/:id` | `409 ERR_SUPPLIER_HAS_PURCHASES` si hay compras |

## API — compras

Base: `/api/purchases` · Permiso CRUD: `catalog.edit`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/purchases` | Filtros: `from`, `to`, `supplierId`, `status`, `q` |
| GET | `/api/purchases/:id` | Detalle con líneas |
| POST | `/api/purchases` | Crear (`draft`) |
| PUT | `/api/purchases/:id` | Reemplazo completo (solo `draft`) |
| DELETE | `/api/purchases/:id` | Solo `draft` |
| POST | `/api/purchases/:id/submit-for-review` | `draft` → `pending_review` |
| GET | `/api/purchases/:id/warehouse-review` | Análisis de líneas · `warehouse.receive` |
| POST | `/api/purchases/:id/receive-to-warehouse` | Entradas · `warehouse.receive` + `catalog.edit` |
| POST/GET/DELETE | `…/images` | Factura (base64, máx. 5 MB × 20) |

### Revisión asistida (`warehouse-review`)

Por cada línea la API devuelve:

- `needsReview` y `reviewReason`: `cost_ponderation` (ya hay stock en almacén), `new_product`, `unlinked`.
- Coste actual en almacén y **coste proyectado** tras la entrada (`projectedWarehouseUnitCost`).
- Resolución de producto: `linked_product`, `barcode_match`, `new_product`.

### Recepción (`receive-to-warehouse`)

Body:

```json
{
  "sectionId": "uuid-or-null",
  "defaultSalePrice": 0,
  "lines": [
    {
      "lineId": "…",
      "action": "receive",
      "productId": "…",
      "createProduct": true,
      "unitCost": 1.5,
      "confirmed": true
    }
  ]
}
```

Reglas:

- Solo estado **`pending_review`**. Si sigue en `draft`, la API responde `ERR_PURCHASE_REVIEW_REQUIRED`.
- **Móvil:** registra borradores y usa `submit-for-review`; **no** recibe en almacén.
- Líneas con `needsReview` exigen `confirmed: true`.
- Cada entrada llama a `receiveProductToWarehouse` con `referenceType: purchase`, `referenceId: purchaseOrderId`.
- Productos nuevos: auto-create por línea o `createProduct: true`; deduplicación opcional por barcode.

## UI web

Menú **Existencias → Compras**: tabla con detalle expandible por compra (productos, cantidades y costos), cola `pending_review`, modal de revisión línea a línea, gestión de proveedores.

## Relación con almacén

Ver [WAREHOUSE.md](./WAREHOUSE.md). Las entradas por compra **no** actualizan stock de tienda hasta la transferencia habitual.

## Backup

Desde `schemaVersion` **9** el JSON incluye `suppliers` y `purchaseOrders`. Detalle: [BACKUP_SCHEMA.md](./BACKUP_SCHEMA.md).

## OpenAPI

Rutas documentadas en [openapi-mobile-sync.yaml](./openapi-mobile-sync.yaml) (tag `purchases`).
