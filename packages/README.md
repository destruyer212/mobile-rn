# Packages compartidos (`@fleet/*`)

Código migrado desde el monolito (Fase 2). Importar desde la app con:

```ts
import { signInWithPassword } from '@fleet/shared-auth';
import { LocationRepository } from '@fleet/shared-data';
import { AppColors } from '@fleet/shared-ui';
```

| Paquete | Contenido |
|---------|-----------|
| `shared-config` | `supabaseConfig`, `tracking` (constantes) |
| `shared-domain` | `WorkerLocation`, `ManagedWorker`, `OperationalBase` |
| `shared-data` | `LocationRepository`, `WorkerAdminRepository` |
| `shared-auth` | Login, roles, permisos, credenciales |
| `shared-lib` | Cliente Supabase |
| `shared-core` | Permisos, notificaciones |
| `shared-services` | `trackingService`, prefs |
| `shared-hooks` | `useWorkerLocations` |
| `shared-ui` | `AppColors`, `format`, `workerUi` |
| `shared-tracking-worker` | Tarea GPS background (importar en `index.ts`) |
| `shared-ui-admin` | `TopDownMotoMarker` (mapa) |

Dependencias internas usan `file:../...` entre paquetes.
