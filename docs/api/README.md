# Fleet Control — Swagger / OpenAPI

Documentación interactiva de la **API Supabase** usada por las apps worker y admin.

| Archivo | Descripción |
|---------|-------------|
| [openapi.yaml](./openapi.yaml) | Especificación OpenAPI 3.0 |
| [index.html](./index.html) | Swagger UI (abrir en navegador vía servidor local) |

## Abrir Swagger (enlace local)

Desde la raíz del monorepo:

```bash
npm run docs:api
```

Luego abre en el navegador:

**http://localhost:8888**

(o **http://localhost:8888/index.html**)

> No abras `index.html` con doble clic (`file://`): el navegador bloquea la carga de `openapi.yaml`. Usa siempre `npm run docs:api`.

## Qué documenta

- **Auth** — login JWT (`/auth/v1/token`)
- **Tablas REST** — `worker_locations`, `profiles`, `operational_base`, `admin_audit_log`, etc.
- **Edge Functions** — `admin-manage-workers`, `notify-admin-disconnect`
- **Realtime** — canal WebSocket sobre `worker_locations`

Código cliente: `packages/shared-data`, `packages/shared-auth`, `packages/shared-core`.
