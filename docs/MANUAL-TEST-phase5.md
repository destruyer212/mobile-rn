# Prueba manual — Fase 5 (integración dos apps)

Tiempo estimado: **15–20 minutos**. Necesitas dos dispositivos o emuladores, Supabase configurado y RLS aplicado ([`supabase/README.md`](../supabase/README.md)).

## Preparación

- [ ] `.env` en raíz (o en cada app) con `EXPO_PUBLIC_SUPABASE_URL` y clave anon/publishable.
- [ ] App admin: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` definida.
- [ ] Usuario **worker** y usuario **admin** en Supabase con `user_metadata.role` correcto.
- [ ] SQL RLS ejecutado (`supabase/migrations/20260528000000_rls_two_apps.sql`).

## 1. App Worker (`com.fleetcontrol.worker`)

```bash
npm run start:worker
```

- [ ] Login solo con cuenta **worker** → entra a pantalla de seguimiento.
- [ ] Activar tracking → en Supabase tabla `worker_locations` aparece/actualiza fila con tu `user_id`.
- [ ] Intentar login **admin** en esta app → debe fallar (rol no coincide).

Build APK (opcional):

```bash
cd apps/worker
eas build -p android --profile worker-preview
```

## 2. App Admin (`com.fleetcontrol.admin`)

```bash
npm run start:admin
```

- [ ] Login solo con cuenta **admin** → tabs Operaciones / Reportes / Equipo / Centro.
- [ ] Mapa en Operaciones muestra marcador del worker del paso 1.
- [ ] KPIs / lista coherentes con datos en Supabase.
- [ ] Intentar login **worker** en esta app → debe fallar.

Build APK (opcional):

```bash
cd apps/admin
eas build -p android --profile admin-preview
```

## 3. Aislamiento

- [ ] Las dos apps pueden instalarse a la vez (package names distintos).
- [ ] Desinstalar una no afecta la otra.
- [ ] Sesión Supabase no se mezcla entre apps (cada una tiene su `storageKey`).

## 4. Monolito legacy (opcional)

```bash
npm run start:legacy
```

- [ ] Pantalla de aviso de deprecación visible.
- [ ] Solo para comparar; producción debe usar worker + admin.

## Registro de resultados

| Paso | OK | Notas |
|------|----|-------|
| Worker GPS en Supabase | | |
| Admin ve marcador | | |
| Rol cruzado rechazado | | |
| RLS verificado | | |
