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
| `PATCH /api/products/:id/stock` | Update stock `{ "stock": 42 }` |
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

**Before delivery:** in the app go to **Settings → Backup & data → Reset everything** (or delete the dev `data/` folder) so the client starts blank. Generate and deliver a license key after payment.

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
4. **License** — client sends request code from **Settings → Facturación**; you run `npm run license:generate` and send the `ES-LIC1...` key
5. **LAN (optional)** — note the API URL from Settings for mobile/tablet on the same network
6. **Backup** — show the client how to export JSON backups periodically

### Environment variables (production)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API port |
| `WEB_PORT` | `3000` | Static UI port (`client:start` only) |
| `DATA_DIR` | `./data` | SQLite directory |
| `API_KEY` | _(none)_ | Optional API authentication |

