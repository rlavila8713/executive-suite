# Mobile offline mode (Phase 1)

Mobile clients (Flutter) cache store data locally and queue sales when the LAN link to the API is down. The server provides the **offline pack**, **idempotent checkout**, and **batch sync** endpoints.

**OpenAPI (draft):** [openapi-mobile-sync.yaml](./openapi-mobile-sync.yaml) — machine-readable spec for sync routes and mobile `POST /api/sales`. Schemas align with `src/types.ts`; request/response **examples** reference payloads from `tests/integration/api.test.ts` (`components/examples/Integration*`).

**Mobile app guide:** [executive-suite-mobile/README.md](../../executive-suite-mobile/README.md) — operator scenarios and prerequisites.

## Typical flow

1. Open the cash session on **web** or **mobile** (`POST /api/cash-sessions`) when the device has `cash.session` permission.
2. **Mobile** online: `GET /api/sync/offline-pack` (also triggered when loading products) → persist JSON in local SQLite (`OfflineStore`).
3. LAN lost: sell from cache; each sale goes to `sale_outbox` with a new `clientSaleId` (UUID).
4. API reachable again: `POST /api/sync/sales` (banner, pull-to-refresh, or ~1 min poll).

If the pack was saved while **no** cash session was open, `cashSession` is `null` — offline checkout is blocked until a new pack is downloaded with an open session.

## Mobile request headers

| Header | Required | Notes |
|--------|----------|--------|
| `X-Device-Id` | Yes | Stable device id (same as rest of API). |
| `X-Client-Kind` | Yes | Must be `mobile` for `/api/sync/*`. |
| `User-Agent` | Recommended | Used with `X-Client-Kind` for client detection. |
| `Authorization` | When login enabled | `Bearer` session token, same as other `/api/*` routes. |

Sync and offline-pack routes return **403** `ERR_SYNC_MOBILE_ONLY` for non-mobile clients.

## GET `/api/sync/offline-pack`

Returns a snapshot for local cache:

| Field | Description |
|-------|-------------|
| `generatedAt` | Server timestamp (ms). |
| `catalogRevision` | Opaque string (currently product count) for future delta sync. |
| `cashSession` | Open session object, or **`null`** if drawer is closed. |
| `access` | Device access context (operator, permissions, `mobileModules`). |
| `settings` | `storeName`, `taxRate`, `currency`. |
| `products` | Full catalog (`includeImages` false; use `imageUrl` on product). |
| `customers` | Customer list for POS. |

Persist `cashSession.id` on every queued sale as `cashSessionId`.

## POST `/api/sales` (mobile checkout online)

Same handler as web checkout; mobile clients send receipt lines and optional idempotency key.

| Field | Required | Notes |
|-------|----------|--------|
| `receipt` | Yes | Must include `lines[]` with `sku` and/or `productId`, `quantity`. |
| `customerName` | For debt | |
| `amount` | Optional | Defaults from receipt total. |
| `isDebt` / `isPartialDebt` | Optional | Debt rules same as web. |
| `clientSaleId` | Optional | UUID; **duplicate** request returns **200** with existing transaction (same as sync). |

**201** created, **200** duplicate. Requires open cash session for live sales (`ERR_CASH_SESSION_REQUIRED`). Mobile requires assigned operator (`ERR_OPERATOR_REQUIRED`) and `sales.checkout` on device.

Live sales do **not** set `syncOffline`; timestamp is server `Date.now()`.

## POST `/api/sync/sales`

Batch replay of queued offline sales (max **100** per request).

Body: `{ "sales": [ MobileSaleInput, ... ] }`

Each item should include:

| Field | Required | Notes |
|-------|----------|--------|
| `clientSaleId` | Yes | UUID generated on device when sale was queued. |
| `clientCreatedAt` | Yes | Ms when sale occurred offline. |
| `cashSessionId` | Yes | From pack at queue time. |
| `syncOffline` | Yes | Must be `true` (also forced server-side in batch). |
| `operatorId` / `operatorName` | Yes | Frozen from pack access at sale time. |
| `receipt` | Yes | Full receipt JSON (store, lines, tax, payment). |
| `customerName` / `amount` | Optional | Same as live checkout. |

Response: `{ "syncedAt": number, "results": [ { "clientSaleId", "status", "transactionId?", "code?", "error?" } ] }`

Per-item `status`: `created` | `duplicate` | `rejected`. Rejected items keep `code` (e.g. `ERR_INSUFFICIENT_STOCK|…`, `ERR_CASH_SESSION_CLOSED_OFFLINE_SYNC`).

## POST `/api/sync/sales/{clientSaleId}/replay`

Single-sale replay with body = one `MobileSaleInput`. **201** / **200** same as batch item success.

## Offline receipt (queued payload)

The mobile app stores the same `receipt` object sent to sync, plus top-level sync fields. Receipt should match live checkout shape (`SaleReceipt` in web types): `storeName`, `lines`, `subtotal`, `tax`, `total`, `paymentMethod`, optional `payments`, etc. Server may stamp `operatorName`, `offlineOrigin`, `clientCreatedAt` on persist when `syncOffline` is true.

## Error codes (sync & mobile sales)

| Code | Typical cause |
|------|----------------|
| `ERR_SYNC_MOBILE_ONLY` | Client is not mobile. |
| `ERR_SYNC_SALES_EMPTY` | Missing `sales` array. |
| `ERR_SYNC_SALES_BATCH_TOO_LARGE` | More than 100 sales. |
| `ERR_CLIENT_SALE_ID_REQUIRED` | Batch item without `clientSaleId`. |
| `ERR_CASH_SESSION_REQUIRED` | No open session (live sale). |
| `ERR_CASH_SESSION_NOT_FOUND` | Bad `cashSessionId`. |
| `ERR_CASH_SESSION_CLOSED_OFFLINE_SYNC` | Sale time outside closed session window. |
| `ERR_CASH_SESSION_DAILY_CLOSE_REQUIRED` | Session day mismatch. |
| `ERR_CASH_CLOCK_ROLLBACK` | Device clock before session or last movement. |
| `ERR_OPERATOR_REQUIRED` | No operator on device. |
| `ERR_INVALID_OPERATOR` | Frozen operator invalid on sync. |
| `ERR_INSUFFICIENT_STOCK` | Stock check failed (may include `\|sku\|name`). |
| `ERR_DEBT_CUSTOMER_REQUIRED` | Debt sale without customer. |
| `ERR_SYNC_SALE_FAILED` | Non-ApiError failure in batch item. |

Mobile-local only (before queue): `ERR_OFFLINE_PACK_MISSING`, `ERR_OFFLINE_DEBT_NOT_SUPPORTED`.

## Tests

- Unit: `tests/mobileOffline.test.ts`
- Integration: `tests/integration/api.test.ts` — “serves mobile offline pack and syncs sales with clientSaleId idempotency”
- Flutter: `executive-suite-mobile/test/offline_store_test.dart`

Validate the OpenAPI draft after edits:

```bash
npm run lint:openapi
```

(From repo root; requires `npm install` — `@redocly/cli` is a devDependency. Optional git hook: see root [README.md](../README.md) → *Lint (TypeScript + OpenAPI)*.)
