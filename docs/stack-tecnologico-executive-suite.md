# Executive Suite — Stack tecnológico

**Proyecto:** Executive Suite  
**Descripción:** Punto de venta e inventario para retail; API REST local en LAN.  
**Fecha del documento:** 2 de noviembre de 2026

---

## Plataforma y lenguaje

| Tecnología | Uso |
|------------|-----|
| Node.js 20+ | Runtime del API, scripts, tests y empaquetado |
| TypeScript ~5.8 | Frontend, backend y tests |
| ES modules | `"type": "module"` en el proyecto |

---

## Frontend (web)

| Tecnología | Uso |
|------------|-----|
| React 19 | UI (POS, inventario, reportes, ajustes, etc.) |
| Vite 6 | Dev server, build y proxy al API |
| Tailwind CSS 4 | Estilos (`@tailwindcss/vite`) |
| Motion | Animaciones |
| Lucide React | Iconos |
| Recharts | Gráficos / reportes |
| clsx + tailwind-merge | Clases CSS condicionales |
| Dexie 4 (+ hooks) | IndexedDB legacy y migración al API |
| qrcode | QR (pagos / tarjetas) |
| Google Fonts (Material Symbols Outlined) | Iconografía en la app web |
| i18n propio | Diccionarios y contexto en `src/i18n/` |

---

## Backend (API local)

| Tecnología | Uso |
|------------|-----|
| Express 4 | REST API en LAN (puerto 4000 por defecto) |
| CORS | Clientes web y móviles en la red local |
| dotenv | Variables de entorno |
| sql.js | SQLite en archivo (`data/executive-suite.sqlite`) |
| Node.js crypto | Sesiones, contraseñas (scrypt), licencias (Ed25519), hashes |

---

## Escritorio

| Tecnología | Uso |
|------------|-----|
| Electron 41 | App de escritorio + API embebida |
| electron-builder | Empaquetado |
| NSIS | Instalador Windows |

---

## Build, desarrollo y despliegue

| Tecnología | Uso |
|------------|-----|
| tsx | API en watch, scripts de licencia, tests |
| esbuild | Bundle del servidor Node |
| concurrently | `npm run dev` (API + Vite en paralelo) |
| serve | Servir build estático (`dist`) |
| Scripts deploy/ | Build y serve (.sh / .cmd) |
| Git + `.githooks/` | Pre-commit opcional (lint OpenAPI) |

---

## Calidad y contratos

| Tecnología | Uso |
|------------|-----|
| Node test runner (`tsx --test`) | Tests unitarios e integración |
| OpenAPI 3 | `docs/openapi-mobile-sync.yaml` |
| Redocly CLI | Lint del OpenAPI |
| tsc --noEmit | Verificación de tipos |

---

## Integraciones y clientes relacionados

| Tecnología | Uso |
|------------|-----|
| Cliente móvil Flutter | Repo aparte (`executive-suite-mobile`); consume el mismo API |
| @google/genai (Gemini) | Dependencia declarada; no usada en el código fuente actual |

---

## Seguridad y licencias

| Tecnología | Uso |
|------------|-----|
| Ed25519 | Firmas de licencias offline (ES-REQ1 / ES-LIC1) |
| API key opcional | Header `X-Api-Key` vía variable `API_KEY` |
| Auth por sesión Bearer | RBAC, operadores, permisos por módulo |

---

## Arquitectura (resumen)

```
┌─────────────────────────────────────────────────────────┐
│  Clientes                                               │
│  • Web: React + Vite + Tailwind                         │
│  • Escritorio: Electron                                 │
│  • Móvil: Flutter (repositorio externo)                 │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP REST (LAN)
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Servidor local                                         │
│  • Express + CORS                                       │
│  • SQLite (sql.js)                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Conclusión

Monorepo **Node.js / TypeScript**: SPA **React** con **Vite**, **API Express** con **SQLite (sql.js)**, empaquetado opcional con **Electron** para operación en LAN, e integración con app **Flutter** vía REST/OpenAPI.

*Generado a partir del análisis del repositorio executive-suite.*
