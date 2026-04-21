# Fleet Control - React Native (`mobile-rn`)

Estado actual: migracion avanzada de la app Flutter a React Native + Expo.

## Lo que ya replica de Flutter

- Login con rol (`admin` / `worker`) y validaciones.
- Panel admin con tabs: `Operaciones`, `Reportes`, `Gestion`, `Centro`.
- Operaciones en vivo con mapa, marcadores y geocerca de base operativa.
- Reportes operativos (resumen, actividad, equipo, alertas) + exportacion CSV.
- Gestion de trabajadores (alta, edicion, suspension, eliminacion) via Edge Function.
- Worker home con tracking y envio de ubicacion.
- Diagnostico worker de permisos/servicio.
- Notificaciones locales + eventos push a admins (`app_open`, `tracking_on`, `disconnect`, `stationary`).

## Variables y configuracion

En `app.json`:

- `android.package` debe coincidir con Google Cloud (`Apps para Android`).
- `android.config.googleMaps.apiKey` debe tener tu API key de Maps SDK for Android.

## Ejecutar en desarrollo

```bash
npm install
npm run prebuild:android
npm run run:android
```

## Si falla build local en Windows

Si tu ruta tiene espacios (por ejemplo `aplicacion movil con react`), CMake/Ninja puede fallar con:

- `build.ninja still dirty after 100 tries`

Soluciones:

1) Copiar proyecto a ruta sin espacios, por ejemplo:

`C:\SpringProjectsnew\mobile-rn`

2) O generar APK en nube con EAS (recomendado para avanzar rapido):

```bash
npx eas login
npm run build:apk
```

## Scripts utiles

- `npm run prebuild:android`
- `npm run run:android`
- `npm run build:apk` (EAS profile preview)
- `npm run build:aab` (EAS profile production)
