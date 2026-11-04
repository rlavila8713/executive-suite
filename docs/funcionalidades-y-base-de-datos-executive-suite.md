# Executive Suite — Funcionalidades y diseño de base de datos

**Proyecto:** Executive Suite  
**Descripción:** Punto de venta, inventario y finanzas para retail; API REST local en LAN.  
**Fecha del documento:** 2 de noviembre de 2026

---

## Resumen

Sistema de **punto de venta (POS)**, **catálogo**, **almacén → tienda**, **caja**, **finanzas** y **administración**, con **API REST local** (LAN) para clientes web, Electron y app móvil Flutter. Los datos viven en un único archivo **SQLite** (`data/executive-suite.sqlite`) gestionado con **sql.js**.

---

## 1. Funcionalidades por módulo

### 1.1 Visión general (Dashboard)

- Resumen de ventas del día y gráfico de los últimos 7 días.
- KPIs: ingresos netos, gastos, margen aproximado, ventas pendientes de cobro (deuda).
- Estado de **caja abierta/cerrada** y acceso rápido a abrir caja.
- **Ventas recientes**: pestañas completadas vs. revertidas; ver ticket, revertir venta (con reglas de negocio).
- Filtros por operador y búsqueda global.
- Enlaces rápidos a POS, productos, gastos, etc.

### 1.2 Ventas — TPV (POS)

- Catálogo con búsqueda, filtros por categoría/subcategoría y miniaturas de producto.
- Carrito: cantidades, líneas, impuesto configurable por tienda.
- **Formas de pago**: efectivo (vuelto), tarjeta (QR), transferencia (QR/datos bancarios), **pago mixto** (efectivo + transferencia o efectivo + deuda).
- Venta **a crédito / fiado** (cuenta por cobrar) total o parcial; enlace opcional a **cliente** del directorio.
- Requiere **sesión de caja abierta** y licencia activa (fuera de trial).
- Genera **recibo** (`receipt_json`) con líneas, costes snapshot, operador y dispositivo.
- Impresión / vista de ticket desde la UI.

### 1.3 Caja (Cash)

- **Abrir sesión** con efectivo inicial.
- **Cerrar sesión** con arqueo (efectivo contado vs. esperado).
- Totales por canal: efectivo, tarjeta, transferencia, otros, **ventas a crédito** (sin efectivo en caja).
- **Detección de anomalías** al cierre (faltante, sobrante, variación de caja, ventas a deuda).
- Corrección post-cierre (`correct-close`) para ajustar cierre registrado.
- Regla: ventas y reversiones sensibles exigen caja del **día actual** abierta.

### 1.4 Conciliación contable (Reconciliation)

- Para un rango de fechas, comprueba **integridad de tickets**: recibo presente, líneas vs. subtotal, subtotal + impuesto vs. total, coherencia con `amount`.
- Indica si el periodo **cuadra** o lista incidencias por venta.

### 1.5 Catálogo maestro

#### Productos

- CRUD: nombre, SKU (generación automática de siguiente SKU), categoría/subcategoría, ubicación, código de barras, unidad, estado activo/inactivo, imagen.
- Política de precios: **precio y costes no se editan libremente** en PATCH de producto; entran vía almacén/importación/transferencia.
- **No** se permite editar stock de tienda directo (`PATCH …/stock` → 409); solo vía almacén.

#### Categorías y subcategorías

- Categorías con código; subcategorías por categoría (p. ej. “General” al migrar).

#### Ubicaciones (Locations)

- Ubicaciones físicas asignables a productos.

#### Clientes

- Directorio: nombre, apellido, dirección, teléfono, notas.
- Uso en POS y en **cuentas por cobrar**.

#### Importar (CSV)

- Plantilla CSV: validación previa y carga masiva.
- Crea/actualiza catálogo y registra **entradas al almacén** (no stock de tienda directo).
- Política: stock de tienda en import debe ser 0; stock va al depósito.

### 1.6 Existencias

#### Almacén (Warehouse)

- Depósitos, secciones, stock por producto y **coste unitario en almacén**.
- **Entrada** de mercancía (cantidad, coste, precio de venta opcional).
- **Enviar a tienda**: transfiere cantidad al stock de tienda, pondera **coste de tienda** y fija **precio de venta** (PVP).
- Cambio de sección sin alterar cantidad total.
- Resumen/reporte de almacén vía API.
- Solo cliente **web** (`X-Client-Kind: web`) para movimientos de almacén.

#### Inventario (tienda)

- Vista del stock en **punto de venta**, valoración a coste y a precio retail.
- Sin entradas ni transferencias (están en Almacén).

#### Movimientos de stock

- Historial de movimientos de **almacén** y perspectiva **tienda**.
- Filtros por fecha, búsqueda, solo reversiones, consumo de inventario.
- **Revertir entradas** y otras operaciones reversibles según tipo.

**Tipos de movimiento en almacén:** `ENTRY`, `TRANSFER_TO_STORE`, `ADJUSTMENT`, `SECTION_REASSIGN`, `REVERSAL`, `EXPENSE_STORE`, `EXPENSE_WAREHOUSE`.

### 1.7 Finanzas

#### Gastos

- CRUD con categorías personalizables.
- Categorías de sistema (consumo de inventario, licencia bloqueada).
- Gastos **bloqueados** (licencia activada no editable/eliminable).
- **Consumo de inventario**: baja stock y genera gasto automático.

#### Cuentas por cobrar (Receivables)

- Ventas fiadas (`sold_as_debt`, `debt_status`: pending/collected).
- Cobro con efectivo, tarjeta o transferencia (QR).
- Registrar cliente desde venta anónima; ver ticket.

#### Cuentas por pagar (Payables)

- Obligaciones al cliente al **revertir** ventas mixtas efectivo + transferencia.
- Marcar como pagada o anular.

#### Reportes

- Pestañas: ventas, productos, inventario, caja.
- Rango de fechas, comparación con periodo anterior.
- Ventas netas, desglose por método de pago, top productos, rotación lenta, margen bruto, gastos, valoración inventario, **incentivos de venta**, distribución por operador.
- Desde reportes de caja: abrir/cerrar sesión.

### 1.8 Sistema

#### Usuarios y roles (RBAC)

- Roles (Encargado, Vendedor + personalizables), permisos granulares.
- Usuarios con contraseña (scrypt), bloqueo tras intentos fallidos.
- **Operadores** vinculados a usuarios; asignación por **dispositivo**.
- Auditoría: creación/edición de usuarios, permisos de rol, cambio de contraseña.

#### Autenticación

- Modo opcional **login obligatorio**.
- Sesiones Bearer (hash SHA-256, TTL ~12 h).
- Permisos efectivos por dispositivo + operador asignado.

#### Dispositivos conectados

- Registro por `X-Device-Id` (web/móvil).
- Listado paginado, estado online (~90 s), revocación, asignación de operador.

#### Ajustes (Settings)

- General: nombre tienda, sucursal, logo.
- Pagos: QR tarjeta, datos transferencia.
- Perfil del encargado, notificaciones (stock bajo), tema oscuro.
- Regional: moneda, idioma, formato de fechas.
- **Incentivos de venta**: % y base (neto/bruto).
- **Facturación / licencias**: trial 15 días, planes mensual/trimestral/anual, solicitar código, activar clave firmada (Ed25519).
- **Datos**: export/import backup JSON (v8 = estado completo del servidor), reset de fábrica (preserva licencia/trial del dispositivo).
- **Servidor local**: URL del API; diagnóstico y QR para conectar móvil.

#### Ayuda

- Pantalla de ayuda integrada.

### 1.9 API e integraciones

| Área | Capacidad |
|------|-----------|
| Health | Estado, versión, URLs LAN |
| Backup | Export/import JSON v8 (estado completo) + imágenes |
| Licencia | Consulta, solicitud, activación; bloqueo de escritura si trial vencido |
| Ventas móvil | `POST /api/sales` con `clientSaleId` idempotente |
| Sync offline | `GET /api/sync/offline-pack`, `POST /api/sync/sales` (solo móvil) |
| Admin | Diagnósticos, migración imágenes a disco, factory reset |
| OpenAPI | Contrato draft en `docs/openapi-mobile-sync.yaml` |

### 1.10 Electron (escritorio)

- Ventana embebida + API en `0.0.0.0:4000`; datos en carpeta de usuario del SO.

### 1.11 Migración legacy

- IndexedDB (Dexie) en navegador → API en primera carga si había datos locales.

---

## 2. Diseño de la base de datos

**Motor:** SQLite (un archivo).  
**IDs:** texto (UUID o generados).  
**Persistencia:** escritura atómica con debounce (~400 ms) salvo transacciones explícitas.

### 2.1 Diagrama entidad-relación (lógico)

```
                    ┌─────────────────┐
                    │  app_settings   │
                    └────────┬────────┘
                             │ 1:1
                    ┌────────▼────────┐
                    │ license_state   │──► license_redemptions (nonces)
                    └─────────────────┘

  categories ──► subcategories
      │
      └──────────► products ◄── locations
            │            │
            │            ├──► warehouse_stock ◄── warehouse_sections ◄── warehouses
            │            │
            │            └──► warehouse_movements
            │
  customers ──► transactions (customer_id, source_sale_id self-ref)
            │
  cash_sessions (vinculación lógica en ventas)

  expense_categories ──► expenses

  permissions ◄── role_permissions ──► roles ◄── user_roles ──► users
                                                      │
                                                      ├──► operators ◄── connected_devices
                                                      ├──► auth_sessions
                                                      └──► user_admin_audit_log
```

### 2.2 Catálogo de tablas

| Tabla | Propósito | Campos clave |
|-------|-----------|--------------|
| **app_settings** | Configuración única (`id=main`) | tienda, sucursal, moneda, impuesto, QR/transferencia, logo, locale, incentivos venta, `auth_login_required` |
| **products** | Artículos vendibles | SKU, precio venta, cost tienda, cost almacén, stock tienda, imagen, categoría/subcategoría/ubicación, barcode, estado |
| **categories** | Categorías | `name` único, `code` |
| **subcategories** | Subcategorías | FK `category_id`, `code` |
| **locations** | Ubicaciones en tienda | `name` único |
| **customers** | Clientes | nombres, contacto, `created_at` |
| **transactions** | Ventas, devoluciones, pagarés | `type`: sale / return / payable; `status`; `receipt_json`; deuda y pagarés; trazabilidad operador/dispositivo; `client_sale_id` único |
| **cash_sessions** | Turnos de caja | apertura/cierre, totales por método, anomalías, deuda en sesión |
| **expenses** | Gastos operativos | título, monto, categoría, fecha, `locked` |
| **expense_categories** | Categorías de gasto | `code` único, `is_system` |
| **warehouses** | Depósitos | `is_default` |
| **warehouse_sections** | Secciones del almacén | único por `(warehouse_id, name)` |
| **warehouse_stock** | Stock en depósito | único `(warehouse_id, product_id)`, `quantity`, `unit_cost` |
| **warehouse_movements** | Auditoría de movimientos | tipos ENTRY, TRANSFER_TO_STORE, etc.; reversión |
| **license_state** | Trial y suscripción | `trial_started_at`, `paid_until`, `plan_id`, dispositivo |
| **license_redemptions** | Claves ya canjeadas | `nonce` PK |
| **connected_devices** | Dispositivos LAN | `client_kind`, revocación, `operator_id` |
| **roles** | Roles RBAC | `key`, `system` |
| **permissions** | Permisos atómicos | `key`, `scope` web/mobile/both |
| **role_permissions** | N:M rol ↔ permiso | |
| **users** | Cuentas de login | `password_hash`, intentos fallidos, bloqueo |
| **user_roles** | Rol del usuario | |
| **operators** | Identidad en TPV | 1:1 con `users` |
| **auth_sessions** | Tokens de sesión | `token_hash`, expiración |
| **user_admin_audit_log** | Auditoría admin | `action`, `details_json` |

### 2.3 Tabla `products` (detalle)

| Columna | Tipo | Notas |
|---------|------|--------|
| id | TEXT PK | |
| name | TEXT | |
| sku | TEXT | indexado |
| category | TEXT | nombre legacy / display |
| price | REAL | PVP en tienda |
| cost | REAL | coste medio ponderado en tienda |
| warehouse_cost | REAL | coste en almacén |
| stock | INTEGER | stock en punto de venta |
| image | TEXT | ruta o data URL |
| category_id, subcategory_id | TEXT | FK lógicas |
| subcategory, status, unit_of_measure | TEXT | |
| location_id, barcode | TEXT | opcionales |

### 2.4 Tabla `transactions` (detalle)

| Columna | Tipo | Notas |
|---------|------|--------|
| id | TEXT PK | |
| order_number | TEXT | |
| customer | TEXT | nombre en ticket |
| amount | REAL | |
| status | TEXT | completed, pending, reversed, refunded |
| timestamp | TEXT | |
| type | TEXT | sale, return, payable |
| created_at | INTEGER | orden cronológico |
| payment_method | TEXT | |
| receipt_json | TEXT | ticket completo |
| source_sale_id | TEXT | venta origen (reversión/pagaré) |
| sold_as_debt, debt_status, collected_at | | cuentas por cobrar |
| sold_as_payable, payable_status | | cuentas por pagar |
| customer_id | TEXT | FK cliente |
| operator_name, operator_id | TEXT | |
| source_device_id | TEXT | |
| client_sale_id | TEXT | UNIQUE; idempotencia móvil |
| client_created_at, offline_origin | | sync offline |

### 2.5 Tabla `warehouse_movements` (detalle)

| Columna | Tipo | Notas |
|---------|------|--------|
| id | TEXT PK | |
| warehouse_id, product_id | TEXT | |
| section_id | TEXT | opcional |
| type | TEXT | ENTRY, TRANSFER_TO_STORE, … |
| quantity_delta | INTEGER | |
| unit_cost | REAL | |
| balance_after | INTEGER | |
| reference_type, reference_id | TEXT | |
| notes, created_by | TEXT | |
| created_at | INTEGER | |
| reversed_at, reverses_movement_id | | cadena de reversión |

### 2.6 Flujos de datos importantes

1. **Stock en tienda:** almacén → movimiento `TRANSFER_TO_STORE` → incrementa `products.stock` y pondera `products.cost` / `products.price`.
2. **Venta:** insert en `transactions` + decrementa `products.stock` + totales de `cash_sessions` abiertas.
3. **Fiado:** `sold_as_debt=1`, `debt_status=pending` → cobro → `collected`.
4. **Reversión:** fila `type=return`, restaura stock; mixtas con transferencia pueden crear `type=payable`.
5. **Licencia:** activación extiende `paid_until` e inserta gasto bloqueado “Licencia de uso”.

### 2.7 Índices relevantes

- **products:** SKU, categoría  
- **transactions:** `created_at`, `source_sale_id`, `debt_status`, `payable_status`, `customer_id`, `client_sale_id` (UNIQUE)  
- **cash_sessions:** `opened_at`  
- **warehouse_movements:** producto + fecha, almacén + fecha  
- **customers:** nombre  
- **connected_devices:** `last_seen_at`  
- **auth_sessions:** usuario, expiración  

---

## 3. Permisos RBAC (referencia)

| Clave | Descripción | Alcance |
|-------|-------------|---------|
| sales.checkout | Crear ventas | web + móvil |
| sales.reverse | Revertir ventas | web + móvil |
| cash.session | Abrir/cerrar caja | web + móvil |
| inventory.view | Ver inventario tienda | web + móvil |
| warehouse.receive | Entradas al almacén | web + móvil |
| warehouse.transfer | Transferir a tienda | web + móvil |
| catalog.view | Ver catálogo/clientes | web + móvil |
| catalog.edit | Editar catálogo | solo web |
| reports.view | Reportes | solo web |
| users.manage | Usuarios y roles | solo web |
| devices.manage | Dispositivos y operadores | solo web |
| settings.manage | Ajustes y licencia | solo web |
| admin.dangerous | Reset y diagnósticos | solo web |

---

*Documento generado a partir del análisis del repositorio executive-suite.*
