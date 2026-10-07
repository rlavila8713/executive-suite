# Módulo Almacén

Este documento describe el flujo de existencias entre **almacén** (depósito) e **inventario de tienda** (POS), y cómo se gestionan los costes ponderados.

## Resumen del flujo

1. **Catálogo (Productos)** — Solo datos maestros: nombre, SKU, categoría, imagen, etc. Sin cantidades ni precios al crear.
2. **Almacén** — Entrada de mercancía (`Entrada`), secciones, envío a tienda (`Enviar a tienda`), movimientos.
3. **Inventario** — Vista del stock en tienda y coste de tienda; no modifica almacén.
4. **Importar** — Crea/actualiza catálogo y registra entradas al almacén (no stock de tienda directo).

```
Proveedor / CSV  →  Almacén (entrada)  →  Enviar a tienda  →  Inventario / TPV
```

## Dos costes por producto

| Campo | Tabla / API | Actualizado cuando |
|-------|-------------|-------------------|
| Coste almacén | `products.warehouse_cost`, `warehouse_stock.unit_cost` | Entrada al almacén, importación al almacén |
| Coste tienda | `products.cost` | Transferencia almacén → tienda (y ventas COGS usan este valor) |
| Precio venta | `products.price` | Entrada al almacén (opcional) o importación |

**Ponderación separada:** una compra en almacén **no** altera el coste medio en tienda hasta que se transfiere cantidad a inventario. Al transferir, el coste unitario del lote en almacén se pondera con el stock y coste actuales en tienda.

Producto nuevo (sin stock en ningún área): ambos costes en `0` hasta la primera entrada; la primera transferencia define el coste en tienda según el coste de almacén del lote movido.

## Operaciones en la UI (web)

### Almacén → Existencias (por producto)

- **Entrada** — Cantidad, coste unitario de la compra, precio de venta opcional. Actualiza cantidad y coste en almacén; opcionalmente `price`.
- **Enviar a tienda** — Cantidad entera (1…stock en almacén) y **precio de venta** obligatorio (&gt; 0). Reduce almacén, aumenta `products.stock`, pondera `products.cost` y actualiza `products.price` (PVP en TPV).
- **Cambiar sección** — Reasigna ubicación física dentro del almacén (sin cambiar cantidad total).

### Inventario

- Consulta, filtros, valorización a coste de **tienda**.
- No incluye entrada al almacén ni transferencia (movido a Almacén).

## API relevante

Solo cliente **web** (`X-Client-Kind: web`) para movimientos de almacén.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/products/:id/receive` | Entrada al almacén (`quantity`, `unitCost`, `price?`) |
| `POST` | `/api/warehouse/stock/:productId/transfer-to-store` | Transferencia a tienda (`quantity`, `price` &gt; 0) |
| `PATCH` | `/api/products/:id/stock` | **Bloqueado** (`ERR_STORE_STOCK_DIRECT_EDIT`) |
| `POST` | `/api/products` | Crea producto con `price=0`, `cost=0`, `warehouse_cost=0`, `stock=0` |
| `PATCH` | `/api/products/:id` | No permite cambiar `price`, `cost`, `warehouseCost` (`ERR_PRODUCT_PRICING_READONLY`) |

## Importación CSV

- Stock va al **almacén** (`stock` / `warehouseStock` en plantilla).
- `stock_tienda` / `storeStock` debe ser `0` (política de revisión si no).
- Coste de la fila alimenta el coste ponderado de **almacén**, no el de tienda.

## Navegación

En el menú lateral:

- **Catálogo maestro** — Productos, Importar, Categorías, Subcategorías, Ubicaciones, Clientes.
- **Existencias** — Almacén, Inventario.

## Respaldo

Los backups (`schemaVersion: 6`) incluyen `warehouseCost` en productos, tablas de almacén (`warehouses`, `warehouse_sections`, `warehouse_stock`, `warehouse_movements`) y el directorio de **clientes** (`customers`).

## Móvil / POS

El POS consume `products.stock` y `products.price`. El stock de tienda debe existir vía transferencia desde la app web. Evitar `PATCH …/stock` en clientes móviles (409).
