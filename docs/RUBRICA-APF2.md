# Rúbrica APF2 — Proyecto Final 02 (Fleet Control)

Documento de **autoevaluación y evidencias** para alcanzar nivel **Excelente** en cada criterio.  
Proyecto: monorepo `mobile-rn` · Expo 54 · React Native · **API Supabase** (REST + Realtime + Auth).

---

## 1. Integración de hooks y lógica de componentes funcionales

### Criterio Excelente
Uso correcto y consistente de hooks, lógica clara, actualización adecuada del estado y efectos bien implementados.

### Evidencia en el proyecto

| Patrón | Dónde | Qué demuestra |
|--------|-------|----------------|
| `useState` | `apps/worker/src/screens/WorkerHomeScreen.tsx` | Estado de tracking, GPS, cola offline, sync servidor |
| `useEffect` + cleanup | `WorkerHomeScreen` (línea sync API con `cancelled`) | Ciclo de vida: cancelar petición al desmontar |
| `useEffect` + intervalo | `WorkerHomeScreen` (`setInterval` 12s) | Efecto periódico con `clearInterval` en cleanup |
| `useEffect` + listener | `WorkerRootNavigator`, `AdminDashboard` | Permisos / push al montar; `AppState` |
| `useCallback` | `WorkerHomeScreen` (`refreshBackgroundStatus`, `trySendAppOpenPush`) | Funciones estables para dependencias de efectos |
| `useRef` | `WorkerHomeScreen` (sesión, ancla estacionario) | Valores sin re-render innecesario |
| Hook personalizado | `packages/shared-hooks/src/useWorkerLocations.ts` | `useState` + `useEffect` + suscripción Realtime Supabase |
| Hook genérico | `packages/shared-hooks/src/useAsyncData.ts` | Plantilla reutilizable async + loading/error/empty |
| Hook persistencia | `packages/shared-hooks/src/usePersistedCredentials.ts` | `useEffect` carga AsyncStorage al montar |
| Login | `apps/worker/src/screens/LoginScreen.tsx` | Integra `usePersistedCredentials` |

### Capturas sugeridas para el informe
1. Código de `useWorkerLocations` (efecto + cleanup `removeChannel`).
2. Código de `WorkerHomeScreen` con `useEffect` y `cancelled`.
3. Pantalla Login mostrando “Recuperando credenciales guardadas…”.

---

## 2. Consumo de API y renderizado de datos

**Documentación interactiva Swagger:** `npm run docs:api` → **http://localhost:8888** · [docs/api/README.md](./api/README.md)

### Criterio Excelente
Consumo correcto de API, manejo de peticiones, renderizado claro y útil, retroalimentación visual.

### API utilizada
**Supabase** (API pública del cliente móvil):
- Auth: `signInWithPassword` → `packages/shared-auth/src/authRepository.ts`
- Datos: `LocationRepository` → `packages/shared-data/src/locationRepository.ts`
- Tablas: `worker_locations`, `profiles`, `operational_base`, `admin_audit_log`
- Realtime: canal Postgres en `useWorkerLocations`

### Flujo Worker (consumo + escritura)
1. Login → API Auth Supabase.
2. `WorkerHomeScreen` → **GET** `fetchWorkerLocations()` al montar (lee fila del trabajador).
3. Botón “Enviar ubicación” → **UPSERT** `upsertMyLocation()`.
4. Segundo plano → `backgroundLocationTask` envía GPS a la API.

### Flujo Admin (consumo + visualización)
1. Login → API Auth.
2. `useWorkerLocations(true)` → lista ubicaciones + Realtime.
3. `AdminOperationsTab` → mapa `react-native-maps`, marcadores, KPIs, lista.
4. `AdminTeamTab` → Edge Function `admin-manage-workers`.
5. `AdminCenterTab` → base operativa, salud, auditoría.

### Archivos clave
| Acción | Archivo |
|--------|---------|
| Cliente HTTP/SDK | `packages/shared-lib/src/supabase.ts` |
| Repositorio | `packages/shared-data/src/locationRepository.ts` |
| Hook lista en vivo | `packages/shared-hooks/src/useWorkerLocations.ts` |
| Render mapa | `apps/admin/src/screens/admin/AdminOperationsTab.tsx` |
| Render posición worker | `apps/worker/src/screens/WorkerHomeScreen.tsx` |

### Capturas sugeridas
1. Mapa admin con unidades.
2. Worker “Última posición (servidor)” con lat/lng.
3. Supabase Table Editor con fila en `worker_locations`.

---

## 3. Manejo de estados de carga, error y experiencia de usuario

### Criterio Excelente
Loading, error y estados vacíos correctos; experiencia clara.

### Componentes reutilizables
`packages/shared-ui/src/AsyncStateViews.tsx`:
- `LoadingBlock` — spinner + mensaje
- `ErrorBanner` — error visible
- `EmptyState` — sin datos

### Por pantalla

| Pantalla | Loading | Error | Vacío |
|----------|---------|-------|-------|
| Login worker/admin | `LoadingBlock` credenciales | `ErrorBanner` AsyncStorage | — |
| Login submit | `ActivityIndicator` en botón | `banner` mensaje auth | — |
| WorkerHome | sync servidor `LoadingBlock` | `ErrorBanner` + `statusMessage` | texto “Aún no hay ubicación…” |
| WorkerDiagnostics | `ActivityIndicator` refresh | — | — |
| Admin Operaciones | `useWorkerLocations.loading` | `ErrorBanner` API | `EmptyState` mapa/lista |
| Admin Centro | `RefreshControl` + `loading` | `error` texto | — |
| Admin Equipo | `ActivityIndicator` lista/modal | catch en `load` | lista vacía |

### Hook `useWorkerLocations`
Retorna: `{ workers, error, loading, isEmpty, refresh }`.

### Capturas sugeridas
1. Login con “Recuperando credenciales…”.
2. Admin con “Cargando ubicaciones desde Supabase…”.
3. Admin con `EmptyState` “Sin unidades en el mapa”.
4. Worker con banner de error de red (modo avión).

---

## 4. Persistencia local con AsyncStorage

### Criterio Excelente
Datos guardados y recuperados de forma consistente, uso pertinente en el flujo.

### Usos implementados

| Dato | Clave / módulo | Flujo |
|------|----------------|-------|
| Email, contraseña, rol, recordar | `packages/shared-auth/src/credentialsStorage.ts` | Login autocompleta al abrir app |
| Sesión Supabase JWT | `getAuthStorageKey()` en `shared-config/appVariant.ts` + `supabase.ts` | Sesión por app (worker/admin separadas) |
| Preferencia tracking ON/OFF | `packages/shared-services/src/workerTrackingPrefs.ts` | Worker reanuda seguimiento |
| Cola GPS offline | `packages/shared-tracking-worker/backgroundLocationTask.ts` | Reenvío al reconectar |
| Payload tarea background | mismo archivo | Supervivencia del task |

### Documentación de claves
`packages/shared-auth/src/asyncStorageKeys.ts` — constantes exportadas para informe.

### Capturas sugeridas
1. Switch “Recordar usuario y contraseña” activado.
2. Cerrar app, reabrir → campos autocompletados.
3. (Opcional) React Native Debugger / log de claves (sin mostrar contraseña en informe).

---

## 5. Integración funcional del avance y documentación técnica

### Criterio Excelente
Integración sólida APF2, flujo funcional, documentación clara.

### Integración end-to-end
```text
Login (AsyncStorage + Supabase Auth)
  → Worker: GPS → API worker_locations
  → Admin: useWorkerLocations → Mapa + lista Realtime
```

### Documentación del repositorio

| Documento | Contenido |
|-----------|-----------|
| `README.md` | Objetivo, stack, estructura, ejecución, builds, **tabla rúbrica** |
| `docs/ARCHITECTURE-two-apps.md` | Arquitectura monorepo 5 fases |
| `docs/MANUAL-TEST-phase5.md` | Prueba integración worker + admin |
| `docs/RUBRICA-APF2.md` | Este archivo |
| `apps/worker/README.md` / `apps/admin/README.md` | Apps individuales |
| `supabase/README.md` | RLS SQL |

### Cómo ejecutar (para el evaluador)

```bash
cd mobile-rn
npm install
npm run start:worker   # App campo
npm run start:admin    # App supervisión (otra terminal)
npm run typecheck      # Verificación TypeScript
```

### Matriz autoevaluación (objetivo Excelente)

| Criterio APF2 | Nivel objetivo | Estado en repo |
|---------------|----------------|----------------|
| Hooks | Excelente | ✅ Múltiples pantallas + hooks en `packages/shared-hooks` |
| API y renderizado | Excelente | ✅ Supabase + mapa/lista/GPS |
| Loading / error / vacío | Excelente | ✅ `AsyncStateViews` + hooks con `loading` |
| AsyncStorage | Excelente | ✅ Credenciales, sesión, tracking, cola offline |
| Integración + README | Excelente | ✅ Monorepo documentado + este archivo |

---

## 6. Checklist de entrega (copiar al informe PDF/Word)

- [ ] Captura: estructura carpetas `apps/`, `packages/`
- [ ] Captura: `npm run start:worker` y app en teléfono
- [ ] Captura: `npm run start:admin` y mapa con datos
- [ ] Captura: fragmento código `useWorkerLocations` o `useEffect` con cleanup
- [ ] Captura: `LoadingBlock` / `ErrorBanner` / `EmptyState` en UI
- [ ] Captura: login con credenciales recordadas
- [ ] Captura: tabla Supabase `worker_locations` con datos
- [ ] Enlace repo GitHub: `https://github.com/destruyer212/mobile-rn`

---

*Fleet Control — evidencia rúbrica APF2 alineada al código en `master`.*
