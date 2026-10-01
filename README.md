<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Executive Suite

Point-of-sale and inventory management for retail stores. The web app and mobile clients share data through a **local REST API** on your LAN (no public internet required).

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies: `npm install`
2. Start API + web UI: `npm run dev`
   - API: `http://localhost:4000`
   - Web: `http://localhost:3000`
3. API only: `npm run api`

### Electron (desktop + LAN API)

```bash
npm run dev          # in one terminal — web UI
npm run electron:start   # in another — starts API + desktop window
```

The Electron app stores SQLite data in the user data folder and exposes the API on `0.0.0.0:4000` for mobile devices on the same Wi‑Fi.

## Local REST API

Base URL: `http://<server-ip>:4000`

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Status, version, LAN URLs |
| `GET /api/products` | List products (`?includeImages=false` for mobile — use `imageUrl`) |
| `GET /api/products/:id/image` | Product image (JPEG/PNG/WebP/SVG) |
| `PATCH /api/products/:id/stock` | **Deprecated** — returns `409 ERR_STORE_STOCK_DIRECT_EDIT`. Use warehouse transfer instead. |
| Warehouse (entries, transfer) | See [docs/WAREHOUSE.md](docs/WAREHOUSE.md) — `POST /api/products/:id/receive`, `POST /api/warehouse/stock/:id/transfer-to-store` (web client only). |
| `POST /api/sales` | Checkout (creates transaction + deducts stock) |
| `GET /api/categories` | Product categories |
| `GET /api/transactions` | Sales history |
| `GET /api/expenses` | Expenses |
| `GET /api/settings` | Store settings |
| `GET /api/cash-sessions` | Cash drawer sessions |
| `GET /api/backup` | Export full JSON backup |
| `POST /api/backup/import` | Replace all data from backup JSON |

### Mobile app example

```http
GET http://192.168.1.10:4000/api/products?includeImages=false
GET http://192.168.1.10:4000/api/products/abc123/image
PATCH http://192.168.1.10:4000/api/products/abc123/stock
Content-Type: application/json

{ "stock": 25 }
```

CORS is enabled for all origins. Optional auth: set `API_KEY` env var and send header `X-Api-Key`.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API listen port |
| `DATA_DIR` | `./data` | SQLite file directory |
| `API_KEY` | _(none)_ | Require `X-Api-Key` header when set |

## Web client configuration

In **Settings → Servidor local (API)**, set the server URL (saved in browser `localStorage`). Default: `http://localhost:4000`.

Legacy IndexedDB data is migrated automatically to the API on first load if present.

## Integration tests

```bash
npm run test:integration
```

Tests spin up a temporary API + SQLite database and cover: health, device binding, settings, products, expenses, cash sessions (with anomalies), sales, license request/activation, backup export, and factory reset.

License activation tests require `license-private.pem` in the project root (run `npm run license:keygen` once).

## License system (licencias)

Executive Suite uses a **signed offline license** model. The client app generates a request code; you (the vendor) sign it on your machine and send back a license key. No payment gateway or internet connection is required at the client site.

### Plans and trial

| Plan | Price (CUP) | Duration |
|------|-------------|----------|
| Mensual (`monthly`) | 1,000 | 30 days |
| Trimestral (`quarterly`) | 2,800 | 90 days |
| Anual (`annual`) | 10,000 | 365 days |

- **Trial:** 15 days of free use from first install (for initial training).
- After the trial, **write operations** (sales, products, expenses, etc.) are blocked until a valid license is activated.
- **Read-only access** remains available so the client can still open Settings and activate a license.

### How it works (overview)

```
Cliente (app)                         Vendedor (tú)
     |                                      |
     |  1. Elige plan en Ajustes            |
     |     → Facturación y planes           |
     |                                      |
     |  2. Genera código ES-REQ1...         |
     |------------------------------------->|
     |                                      |  3. npm run license:generate
     |                                      |     → firma con clave privada
     |  4. Recibe clave ES-LIC1...          |
     |<-------------------------------------|
     |                                      |
     |  5. Pega clave → Activar licencia    |
     |     → gasto bloqueado + paid_until   |
```

Licenses are signed with **Ed25519**:

- **Public key** — embedded in `server/licenseCrypto.ts` (shipped with the app).
- **Private key** — `license-private.pem` in the project root on **your machine only**. Never commit, ship, or share with clients.

### One-time vendor setup

Generate the signing key pair once (or when rotating keys):

```bash
npm run license:keygen
```

This creates:

| File | Location | Action |
|------|----------|--------|
| `license-private.pem` | Project root | Keep secure; used only by `license:generate` |
| Public key (stdout) | — | Already embedded in `server/licenseCrypto.ts` |

If you rotate keys, update `LICENSE_PUBLIC_KEY_PEM` in `server/licenseCrypto.ts` and rebuild/redeploy the app. Old license keys signed with the previous private key will no longer validate.

### Step 1 — Client requests a license code

In the app: **Ajustes → Facturación y planes**

1. Choose a plan (Mensual, Trimestral, or Anual).
2. Click **Solicitar código** (Request code).
3. Copy the full request code starting with `ES-REQ1.` and send it to you (WhatsApp, email, etc.).

The request code is a base64-encoded payload containing:

- `deviceId` — UUID of the device that generated the request (must match on activation).
- `planId` — `monthly`, `quarterly`, or `annual`.
- `storeName` / `branch` — from store settings at request time.
- `requestedAt` — timestamp.

**API (optional):** `POST /api/license/request` with header `X-Device-Id` and body `{ "planId": "monthly" }`.

### Step 2 — Vendor generates the license key

From the project root (where `license-private.pem` exists):

```bash
# Inline request code
npm run license:generate -- --request "ES-REQ1.eyJ2IjoxLC..."

# Or from a text file (useful for long codes)
npm run license:generate -- --request-file ./request.txt

# Custom private key path (optional)
npm run license:generate -- --request "ES-REQ1...." --key /path/to/license-private.pem
```

Example output:

```
--- License generated ---
Store: Mi tienda
Branch: (sin sucursal)
Plan: Mensual (1000 CUP / 30 days)
Device: 764f2489-86e1-4dce-9f45-70cddf2e69c7

Send this license key to the client:

ES-LIC1.eyJ2IjoxLC...<signature>
```

Send the **entire** `ES-LIC1....` string to the client. Each generated key includes a unique `nonce` and can only be used **once**.

### Step 3 — Client activates the license

In the app: **Ajustes → Facturación y planes**

1. Scroll to **Activar licencia**.
2. Paste the full `ES-LIC1....` key.
3. Click **Activar**.

**API (optional):** `POST /api/license/activate` with header `X-Device-Id` and body `{ "licenseKey": "ES-LIC1...." }`.

### What happens on activation

The server (`server/license.ts` → `activateLicense`):

1. Verifies the Ed25519 signature against the embedded public key.
2. Confirms `deviceId` in the key matches the requesting device (`X-Device-Id`).
3. Confirms plan price and duration match the configured plans.
4. Rejects the key if its `nonce` was already redeemed (`license_redemptions` table).
5. Sets `paid_until` on `license_state` (extends from current `paid_until` if still active, otherwise from now).
6. Creates a **locked expense** — category `Licencia de uso`, amount = plan price — that cannot be edited or deleted.

### Renewals and plan changes

- **Renewal before expiry:** new days are added starting from the current `paid_until` date (no lost time).
- **Renewal after expiry:** days count from activation time.
- **Plan change:** client can use **Cambiar plan** in billing settings to request a code for a different plan; you generate a new key the same way.
- Each payment requires a **new** request code and a **new** license key (one nonce per key).

### License enforcement

When the trial has ended and no active paid period exists:

| Allowed | Blocked |
|---------|---------|
| `GET /api/license`, `/api/settings`, `/api/health` | `POST`, `PATCH`, `PUT`, `DELETE` on most routes |
| `POST /api/license/request`, `POST /api/license/activate` | Sales, products, expenses, cash sessions, etc. |

The license is **server-scoped** (per store / SQLite database), not per LAN client. Any device on the LAN can use the API while the store license is active.

### Troubleshooting

| Error / symptom | Likely cause | Fix |
|-----------------|--------------|-----|
| `ERR_LICENSE_INVALID` | Forged key, wrong signature, or tampered payload | Regenerate with `license:generate` using the correct private key |
| `ERR_LICENSE_DEVICE_MISMATCH` | Key activated from a different device than the one that requested it | Client must activate on the same PC/browser that generated the request code |
| `ERR_LICENSE_ALREADY_USED` | Same `ES-LIC1...` key pasted twice | Generate a **new** key from a **new** request code |
| `ERR_LICENSE_REQUEST_INVALID` | Truncated or corrupted `ES-REQ1...` code | Client copies the full code again |
| `Private key not found` (CLI) | Missing `license-private.pem` | Run `npm run license:keygen` on the vendor machine |
| App blocked after trial | No license activated | Complete the request → generate → activate flow |

To inspect license status: **Ajustes → Facturación y planes**, or `GET /api/license` with header `X-Device-Id`.

### Security checklist (vendor)

- [ ] `license-private.pem` is in `.gitignore` and never pushed to GitHub.
- [ ] Private key lives only on the vendor machine(s), not on client PCs.
- [ ] Each client payment gets a fresh request code and a fresh license key.
- [ ] Factory reset (`/api/admin/factory-reset` or Settings → Reset everything) clears license state for redeployment demos — generate a new license after reset if needed.

## Client deployment

The repo contains **two deliverables** in one codebase:

| Component | Role | Build output |
|-----------|------|----------------|
| **Web UI** (`src/`) | Browser / Electron window | `dist/` (static files) |
| **API** (`server/`) | SQLite + REST on LAN | `server/dist/index.cjs` |

At the client site you always run **both**: the API holds the data; the web UI talks to it over HTTP.

### Option A — Windows desktop installer (recommended for one PC)

Best when the client uses a **single Windows PC** (cashier + manager on the same machine).

```bash
npm install
npm run electron:build:win
```

Installer output: `release/Executive Suite-Setup.exe`

- Electron opens the UI and **starts the API automatically** in the background.
- SQLite data lives in the Windows user profile (`%APPDATA%/executive-suite/`).
- Phones on the same Wi‑Fi can use the LAN URL shown in **Settings → Servidor local**.

**Before delivery:** in the app go to **Settings → Backup & data → Reset everything** (or delete the dev `data/` folder) so the client starts blank. After payment, follow [License system](#license-system-licencias) to generate and deliver a license key.

### Option B — Browser + local server (PC sin Electron)

For a PC where you prefer Chrome/Edge and a simple folder install:

```bash
npm install
npm run client:build    # builds dist/ + server bundle
npm run client:start    # API :4000 + web UI :3000
```

Or copy the project to the client machine, run the same commands, and create a desktop shortcut to `http://localhost:3000`.

- Data directory: `./data` (override with `DATA_DIR=/path`)
- Optional: set `API_KEY` and configure clients to send `X-Api-Key`

### Option C — Static zip (web only, API separate)

```bash
npm run deploy:zip
```

Ship `executive-suite-release.zip` **together with** a running API (`npm run api` or the bundled `server/dist/index.cjs`). The zip alone is only the frontend; it cannot work without the API process.

### Delivery checklist

1. **Build** with `npm run electron:build:win` or `npm run client:build`
2. **Reset data** — factory reset in Settings or empty `DATA_DIR`
3. **Configure store** — name, currency (CUP), tax, manager profile
4. **License** — see [License system](#license-system-licencias): client sends `ES-REQ1...` from **Ajustes → Facturación y planes**; you run `npm run license:generate` and send the `ES-LIC1...` key
5. **LAN (optional)** — note the API URL from Settings for mobile/tablet on the same network
6. **Backup** — show the client how to export JSON backups periodically

### Environment variables (production)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API port |
| `WEB_PORT` | `3000` | Static UI port (`client:start` only) |
| `DATA_DIR` | `./data` | SQLite directory |
| `API_KEY` | _(none)_ | Optional API authentication |

