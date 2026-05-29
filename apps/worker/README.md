# Fleet Control Campo (`apps/worker`)

App **solo trabajadores**: login sin selector de rol, seguimiento GPS y diagnostico. Sin mapa admin ni tabs.

| Campo | Valor |
|-------|--------|
| Package Android | `com.fleetcontrol.worker` |
| Rol fijo en login | `worker` |
| Dependencias | `@fleet/shared-*` (sin `shared-ui-admin`, maps, tabs, print) |

## Desarrollo

Desde la raíz del monorepo (recomendado):

```bash
npm install
npm run start:worker
```

O desde esta carpeta:

```bash
cd apps/worker
npx expo start
```

Copia `.env` del monorepo (raíz) o define `EXPO_PUBLIC_SUPABASE_*` aquí. Para builds EAS, `APP_VARIANT=worker` y `EXPO_PUBLIC_APP_ROLE=worker` van en `eas.json`.

## Build Android

```bash
cd apps/worker
eas build -p android --profile worker-preview
```

APK interno; producción: perfil `worker-production` (AAB).
