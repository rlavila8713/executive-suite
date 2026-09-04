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
| `GET /api/products` | List products |
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
GET http://192.168.1.10:4000/api/products
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
