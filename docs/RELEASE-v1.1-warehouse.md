# Executive Suite v1.1 — Gestión de almacén

Esta rama (`feature/warehouse-v1.1`) separa temporalmente el producto con **módulo de almacén** respecto a `develop` / v1.0 (catálogo e inventario de tienda sin flujo de depósito).

## Línea base

| Versión | Rama de referencia | Alcance |
|--------|---------------------|---------|
| **v1.0** | `develop` (sin esta rama) | Productos, inventario de tienda directo, POS, caja, informes |
| **v1.1** | `feature/warehouse-v1.1` | v1.0 + almacén, costes separados, importación al depósito, backup schema 6 |

No se fusiona a `develop` hasta decisión de producto; conviven como líneas paralelas.

## Flujo operativo v1.1

1. **Catálogo (Productos)** — Solo datos maestros; sin cantidades ni precios al crear.
2. **Almacén** — Entrada de mercancía, secciones, envío a tienda (cantidad + PVP), movimientos.
3. **Inventario** — Stock y valorización en tienda (solo lectura operativa).
4. **Importar CSV** — Entradas al almacén; `stock_tienda` debe ser 0.
5. **POS** — Consume `products.stock` y `price` tras transferencia desde almacén.

## Modelo de costes

- `products.warehouse_cost` — Ponderación en almacén (entradas / import).
- `products.cost` — Ponderación en tienda (solo al transferir desde almacén).
- `products.price` — PVP en entrada al almacén o al enviar a tienda.

## API y restricciones (web)

- `POST /api/products/:id/receive` — Entrada al almacén.
- `POST /api/warehouse/stock/:id/transfer-to-store` — Transferencia a tienda (`quantity`, `price`).
- `PATCH /api/products/:id/stock` — Bloqueado (`ERR_STORE_STOCK_DIRECT_EDIT`).
- `PATCH /api/products/:id` — No permite editar `price` / `cost` / `warehouseCost` (`ERR_PRODUCT_PRICING_READONLY`).

## Copia de seguridad (schema 6)

Incluye: productos (`warehouseCost`), almacén (warehouses, sections, stock, movements) y **clientes** (`customers`).

Detalle técnico: [WAREHOUSE.md](./WAREHOUSE.md).

## Pruebas

```bash
npm run build
npm run test:integration
```

Incluye round-trip de backup, flujo receive → transfer, métricas de informes con devoluciones y parseo de backup v6 en cliente.
