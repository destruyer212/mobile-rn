# Fleet Control — Dos apps, un backend (plan de arquitectura)

**Contexto:** monolito actual `mobile-rn` (Expo 54 + React Native + Supabase).  
**Objetivo:** dos aplicaciones instalables por separado, mismo backend, sin API REST propia en fase 1.  
**Fecha de referencia:** planificación a partir del árbol `src/` existente.

---

## Decisiones cerradas

| Tema | Decisión |
|------|----------|
| Backend | **Un solo proyecto Supabase** (Auth + Postgres + RLS + Edge Functions) |
| API propia | **No** en fase 1; el cliente usa SDK Supabase |
| Repositorio | **Monorepo** npm workspaces |
| Seguridad | **RLS + metadata `role`**; las apps no confían solo en UI |
| Login | **Sin selector de rol**; cada app fija `admin` o `worker` en build |

---

## 1) Estructura de carpetas del monorepo

```text
fleet-control/                          # raíz del monorepo (hoy: mobile-rn → renombrar/migrar)
├── package.json                        # workspaces: ["apps/*", "packages/*"]
├── tsconfig.base.json
├── .env.example
├── README.md
├── docs/
│   └── ARCHITECTURE-two-apps.md        # este documento
│
├── apps/
│   ├── worker/                         # App A — solo trabajadores
│   │   ├── app.json                    # name: Fleet Control Campo
│   │   ├── app.config.ts               # APP_VARIANT=worker, package com.fleetcontrol.worker
│   │   ├── eas.json                    # perfiles worker-preview / worker-production
│   │   ├── index.ts                    # import backgroundLocationTask + App
│   │   ├── App.tsx
│   │   └── src/
│   │       ├── navigation/
│   │       │   ├── WorkerRootNavigator.tsx
│   │       │   └── types.ts
│   │       └── screens/
│   │           ├── LoginScreen.tsx     # rol fijo worker, sin segment admin/worker
│   │           ├── WorkerHomeScreen.tsx
│   │           └── WorkerDiagnosticsScreen.tsx
│   │
│   └── admin/                          # App B — solo administradores
│       ├── app.json                    # name: Fleet Control Admin
│       ├── app.config.ts               # APP_VARIANT=admin, package com.fleetcontrol.admin
│       ├── eas.json
│       ├── index.ts                    # sin backgroundLocationTask
│       ├── App.tsx
│       └── src/
│           ├── navigation/
│           │   ├── AdminRootNavigator.tsx
│           │   └── types.ts
│           └── screens/
│               ├── LoginScreen.tsx     # rol fijo admin
│               ├── AdminHomeScreen.tsx
│               └── admin/
│                   ├── AdminDashboard.tsx
│                   ├── AdminOperationsTab.tsx
│                   ├── AdminReportsTab.tsx
│                   ├── AdminTeamTab.tsx
│                   └── AdminCenterTab.tsx
│
├── packages/
│   ├── shared-config/                  # supabaseConfig, env, constants
│   │   └── src/
│   │       ├── supabaseConfig.ts
│   │       └── tracking.ts
│   ├── shared-domain/                  # tipos puros, sin React
│   │   └── src/
│   │       ├── workerLocation.ts
│   │       ├── managedWorker.ts
│   │       └── operationalBase.ts
│   ├── shared-data/                    # repositorios Supabase
│   │   └── src/
│   │       ├── locationRepository.ts
│   │       └── workerAdminRepository.ts
│   ├── shared-auth/                    # login, roles, credenciales, permisos
│   │   └── src/
│   │       ├── authRepository.ts
│   │       ├── authErrors.ts
│   │       ├── credentialsStorage.ts
│   │       ├── userRole.ts
│   │       └── permissions.ts
│   ├── shared-lib/                     # cliente Supabase
│   │   └── src/
│   │       └── supabase.ts
│   ├── shared-core/                    # permisos dispositivo, notificaciones (split opcional)
│   │   └── src/
│   │       ├── locationPermissionHelper.ts
│   │       ├── trackingSurvivalHelper.ts
│   │       ├── localNotificationService.ts
│   │       └── pushNotificationService.ts
│   ├── shared-services/                # lógica de negocio móvil
│   │   └── src/
│   │       ├── trackingService.ts
│   │       └── workerTrackingPrefs.ts
│   ├── shared-hooks/
│   │   └── src/
│   │       └── useWorkerLocations.ts
│   ├── shared-ui/                      # theme, componentes sin mapa
│   │   └── src/
│   │       ├── colors.ts
│   │       └── format.ts / workerUi.ts
│   ├── shared-tracking-worker/         # solo dependencia de apps/worker
│   │   └── src/
│   │       └── backgroundLocationTask.ts
│   └── shared-ui-admin/              # mapa, marcadores (solo admin)
│       └── src/
│           └── map/
│               └── TopDownMotoMarker.tsx
│
└── supabase/                           # opcional: SQL, RLS, functions versionadas
    ├── migrations/
    └── functions/
        └── admin-manage-workers/       # ya referenciada en código
```

### Identificadores de build

| App | `android.package` / iOS bundle | EAS profiles sugeridos |
|-----|-------------------------------|-------------------------|
| Worker | `com.fleetcontrol.worker` | `worker-preview` (apk), `worker-production` |
| Admin | `com.fleetcontrol.admin` | `admin-preview` (apk), `admin-production` (aab) |

### `app.config.ts` (patrón)

```ts
const variant = process.env.APP_VARIANT; // 'worker' | 'admin'
export default {
  expo: {
    name: variant === 'worker' ? 'Fleet Control Campo' : 'Fleet Control Admin',
    slug: variant === 'worker' ? 'fleet-worker' : 'fleet-admin',
    android: {
      package: variant === 'worker' ? 'com.fleetcontrol.worker' : 'com.fleetcontrol.admin',
      // googleMaps.apiKey solo en admin
    },
    extra: { appVariant: variant, fixedRole: variant === 'worker' ? 'worker' : 'admin' },
  },
};
```

---

## 2) Matriz: qué vive en cada app vs shared

Leyenda: **W** = apps/worker · **A** = apps/admin · **S** = packages/shared-*

| Módulo actual (`mobile-rn/src/...`) | Destino | W | A | S |
|-------------------------------------|---------|---|---|---|
| `config/supabaseConfig.ts` | `shared-config` | ✓ | ✓ | ✓ |
| `lib/supabase.ts` | `shared-lib` | ✓ | ✓ | ✓ |
| `domain/*` | `shared-domain` | ✓ | ✓ | ✓ |
| `data/locationRepository.ts` | `shared-data` (métodos usados por app) | parcial | ✓ | ✓ |
| `data/workerAdminRepository.ts` | `shared-data` | — | ✓ | ✓ |
| `auth/*` | `shared-auth` | ✓ | ✓ | ✓ |
| `hooks/useWorkerLocations.ts` | `shared-hooks` | — | ✓ | ✓ |
| `services/trackingService.ts` | `shared-services` | ✓ | — | ✓ |
| `services/workerTrackingPrefs.ts` | `shared-services` | ✓ | — | ✓ |
| `tasks/backgroundLocationTask.ts` | `shared-tracking-worker` | ✓ | — | ✓ |
| `core/permissions/locationPermissionHelper.ts` | `shared-core` | ✓ | ✓* | ✓ |
| `core/permissions/trackingSurvivalHelper.ts` | `shared-core` | ✓ | — | ✓ |
| `core/services/localNotificationService.ts` | `shared-core` | ✓ | ✓ | ✓ |
| `core/services/pushNotificationService.ts` | `shared-core` | ✓ | ✓ | ✓ |
| `theme/colors.ts`, `utils/*` | `shared-ui` | ✓ | ✓ | ✓ |
| `components/map/TopDownMotoMarker.tsx` | `shared-ui-admin` | — | ✓ | ✓ |
| `screens/LoginScreen.tsx` | **duplicar simplificado** en cada app | W | A | — |
| `screens/WorkerHomeScreen.tsx` | `apps/worker` | ✓ | — | — |
| `screens/WorkerDiagnosticsScreen.tsx` | `apps/worker` | ✓ | — | — |
| `screens/AdminHomeScreen.tsx` | `apps/admin` | — | ✓ | — |
| `screens/admin/*` | `apps/admin` | — | ✓ | — |
| `navigation/RootNavigator.tsx` | **reemplazar** por 2 navigators | W | A | — |
| `App.tsx` | cada app (worker init push; admin init push) | W | A | — |
| `index.ts` | worker importa task; admin no | W | A | — |
| `assets/moto-marker-*.png` | `apps/admin/assets` | — | ✓ | — |
| `assets/branding/*` | ambas apps (icon/splash por variante) | ✓ | ✓ | — |

\* Admin puede pedir ubicación solo al centrar mapa, no tracking continuo en background.

### Dependencias npm por app

| Paquete | Worker | Admin |
|---------|--------|-------|
| `expo-location`, `expo-task-manager` | ✓ | — |
| `react-native-maps` | — | ✓ |
| `expo-print`, `expo-sharing` | — | ✓ |
| `@react-navigation/bottom-tabs` | — | ✓ |
| `@react-navigation/native-stack` | ✓ | ✓ |

---

## 3) Cambios en auth (sin selector de rol por app)

### Hoy

- `LoginScreen` tiene segmento **Administrador / Trabajador** (`selectedRole`).
- `signInWithPassword` compara `selectedRole` con `user.user_metadata.role`.

### Objetivo

| App | UI login | `selectedRole` en código | Navegación post-login |
|-----|----------|--------------------------|------------------------|
| Worker | correo + contraseña | siempre `'worker'` | `WorkerHome` |
| Admin | correo + contraseña | siempre `'admin'` | `AdminHome` |

### Cambios concretos

1. **`packages/shared-auth`**
   - Mantener `signInWithPassword({ email, password, expectedRole })`.
   - Renombrar param `selectedRole` → `expectedRole` (más claro).
   - Exportar `APP_FIXED_ROLE` desde `expo-constants` (`extra.fixedRole`) o build-time `process.env.EXPO_PUBLIC_APP_ROLE`.

2. **`apps/worker/LoginScreen`**
   - Eliminar `segment` admin/worker.
   - Llamar `signInWithPassword(..., expectedRole: 'worker')`.
   - Textos: “Acceso personal en campo”.

3. **`apps/admin/LoginScreen`**
   - Igual con `expectedRole: 'admin'`.
   - Textos: “Acceso supervisión de flota”.

4. **`credentialsStorage`**
   - Guardar solo email/password; **no** guardar rol elegible (o guardar rol fijo para validación local).

5. **Modo sin Supabase** (dev)
   - Worker: solo `WorkerHome`.
   - Admin: solo `AdminHome`.
   - No permitir cruce de rutas.

6. **Supabase Auth metadata**
   - Cada usuario debe tener `user_metadata.role` = `admin` | `worker`.
   - Creación de trabajadores vía Edge Function `admin-manage-workers` debe fijar `role: worker`.

---

## 4) Plan de migración en 5 fases (desde `mobile-rn` actual)

### Fase 1 — Preparación (medio día)

- [x] Crear `docs/ARCHITECTURE-two-apps.md` (este archivo).
- [x] Añadir `package.json` workspaces en raíz.
- [x] `tsconfig.base.json` + paths `@fleet/shared-*`.
- [x] `.env.example` con `EXPO_PUBLIC_SUPABASE_*`, `APP_VARIANT`, `EXPO_PUBLIC_APP_ROLE`.
- [x] Stubs en `packages/*` y placeholders `apps/worker`, `apps/admin`.
- [x] No romper build actual: monolito sigue compilando (`npm start` en raíz).

### Fase 2 — Extraer packages (1 día)

- [x] Mover `domain`, `lib`, `config`, `auth`, `data`, `utils`, `theme`, `core`, `services`, `hooks`, `tasks` a `packages/shared-*`.
- [x] Ajustar imports en monolito (`src/screens`, `src/navigation`, `App.tsx`, `index.ts`) a `@fleet/*`.
- [x] `metro.config.js` con `watchFolders` en `packages/`.
- [x] `npm install` + `npm run typecheck` en raíz.
- [ ] Verificar `npx expo start` en dispositivo (manual).

### Fase 3 — App Worker (1 día)

- [x] Crear `apps/worker` copiando `WorkerHome`, `WorkerDiagnostics`, login simplificado (`LoginScreen` rol fijo `worker`).
- [x] `index.ts` importa `@fleet/shared-tracking-worker` (tarea en segundo plano).
- [x] `app.config.ts` → `com.fleetcontrol.worker`, permisos location + foreground service (sin Google Maps).
- [x] Quitar dependencias admin (maps, tabs, print) del `package.json` de worker.
- [x] `WorkerRootNavigator`, `metro.config.js`, `eas.json` (`worker-preview` / `worker-production`), `npm run start:worker`.
- [ ] Verificar en dispositivo: `cd apps/worker && npx expo start`.
- [ ] APK: `cd apps/worker && eas build -p android --profile worker-preview`.

### Fase 4 — App Admin (1 día)

- [x] Crear `apps/admin` con `AdminDashboard` y tabs (Operaciones, Reportes, Equipo, Centro).
- [x] Login solo admin; `AdminRootNavigator` → `Login` + `AdminHome` (sin worker ni diagnóstico campo).
- [x] Google Maps key en `app.config.ts` (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`).
- [x] Assets mapa (`moto-marker-on/off.png`) y branding en `apps/admin/assets`.
- [x] `eas.json` (`admin-preview` / `admin-production`), `npm run start:admin`.
- [ ] Verificar en dispositivo: `cd apps/admin && npx expo start`.
- [ ] APK: `cd apps/admin && eas build -p android --profile admin-preview`.

### Fase 5 — Endurecer y retirar monolito (medio día + backend)

- [x] SQL RLS de referencia en `supabase/migrations/20260528000000_rls_two_apps.sql` + `supabase/README.md`.
- [x] Checklist prueba manual: `docs/MANUAL-TEST-phase5.md`.
- [x] `storageKey` Supabase y prefijo credenciales por variante (`packages/shared-config/appVariant.ts`).
- [x] Monolito archivado en `apps/legacy` (aviso deprecación en login).
- [x] README raíz: comandos `start:worker`, `start:admin`, builds EAS por app.
- [ ] Ejecutar SQL RLS en tu proyecto Supabase (dashboard).
- [ ] Prueba manual worker → admin en dispositivo.
- [ ] (Opcional) Eliminar `apps/legacy` tras periodo de transición.

**Nota realista:** la migración de código en un solo día es viable con IA si Fase 2–4 se hacen en secuencia y se acepta deuda menor (tests manuales). La **validación RLS** en Supabase puede requerir acceso al dashboard el mismo día.

---

## 5) Checklist RLS y builds

### A. Supabase — tablas usadas por el código actual

| Tabla / recurso | Worker | Admin | Política RLS objetivo |
|-----------------|--------|-------|------------------------|
| `worker_locations` | INSERT/UPDATE **solo** `auth.uid() = user_id` | SELECT filas de su org/equipo | Crítico |
| `worker_location_history` | INSERT propio (si existe) | SELECT para replay | Recomendado |
| `profiles` | SELECT/UPDATE **solo** propio perfil | SELECT equipo; UPDATE según rol | Crítico |
| `operational_base` | — | SELECT; UPDATE si `base.edit` vía rol | Admin only |
| `admin_audit_log` | — | INSERT propio actor; SELECT admins | Admin only |
| Edge Function `admin-manage-workers` | **denegar** | **allow** si JWT role=admin | Crítico |

### B. SQL de referencia (borrador — adaptar en Supabase SQL Editor)

```sql
-- Ejemplo: worker solo escribe su ubicación
create policy "worker_upsert_own_location"
on worker_locations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Ejemplo: admin lee todas (ajustar si hay tenant_id / company_id)
create policy "admin_read_locations"
on worker_locations for select
using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
```

Verificar también:

- [ ] RLS **habilitado** en todas las tablas expuestas.
- [ ] `service_role` solo en Edge Functions, nunca en la app móvil.
- [ ] `user_metadata.role` asignado al crear usuario.
- [ ] Probar con cuenta worker en SQL: `select` de otras filas debe fallar.

### C. Auth JWT

- [ ] Claim `role` en `user_metadata` coherente con app instalada.
- [ ] Refresh token y `AsyncStorage` por app (dos apps = dos almacenes; no comparten sesión entre apps salvo mismo AsyncStorage key — usar **distinto** `storageKey` en `createClient` si se desea sesión independiente).

### D. Builds — checklist

**Worker**

- [ ] `APP_VARIANT=worker` en EAS env.
- [ ] `android.package` = `com.fleetcontrol.worker`.
- [ ] Permisos: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`.
- [ ] Sin `react-native-maps` en bundle.
- [ ] `assembleRelease` o EAS `worker-preview` → APK instala y envía GPS.

**Admin**

- [ ] `APP_VARIANT=admin`.
- [ ] `android.package` = `com.fleetcontrol.admin`.
- [ ] `googleMaps.apiKey` configurada y restringida por package.
- [ ] Sin registro de `backgroundLocationTask` en `index.ts`.
- [ ] Mapa muestra unidades; KPIs coherentes.

**Ambas**

- [ ] Mismas `EXPO_PUBLIC_SUPABASE_URL` y clave anon/publishable.
- [ ] Versiones alineadas de `packages/shared-*` (mismo commit).
- [ ] Iconos y nombres distintos en launcher.

### E. Prueba de integración manual (15 min)

1. Instalar **solo** app Worker → login trabajador → activar tracking → ver fila en Supabase `worker_locations`.
2. Instalar **solo** app Admin → login admin → mapa con marcador del paso 1.
3. Intentar login admin en app Worker → debe fallar (rol mismatch).
4. Desinstalar una app; la otra sigue funcionando.

---

## Qué NO hacer en fase 1

- No duplicar proyecto Supabase.
- No exponer `service_role` en móvil.
- No confiar en ocultar pantallas admin en worker sin RLS.
- No mantener selector de rol en login de ninguna de las dos apps.

---

## Siguiente paso inmediato (si se ejecuta hoy con IA)

1. Inicializar workspaces en `package.json` raíz.  
2. Crear `packages/shared-domain` + `shared-lib` + `shared-auth` moviendo 3 carpetas.  
3. Crear `apps/worker` mínimo compilable (login + WorkerHome).  
4. Dejar `apps/admin` como copia del monolito admin sin worker screens.  
5. Documentar en README los dos comandos EAS.

---

*Documento de planificación. La implementación física del monorepo puede seguir este archivo como única fuente de verdad.*
