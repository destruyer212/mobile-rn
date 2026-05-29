# Fleet Control Admin (`apps/admin`)

App **solo administradores**: mapa en vivo, reportes, equipo y centro. Sin seguimiento GPS en segundo plano ni pantallas de trabajador.

| Campo | Valor |
|-------|--------|
| Package Android | `com.fleetcontrol.admin` |
| Rol fijo en login | `admin` |
| Google Maps | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` en `.env` (también en `app.config.ts` vía EAS) |

## Desarrollo

```bash
npm install
npm run start:admin
```

O:

```bash
cd apps/admin
npx expo start
```

## Build Android

```bash
cd apps/admin
eas build -p android --profile admin-preview
```

Producción: perfil `admin-production` (AAB).
