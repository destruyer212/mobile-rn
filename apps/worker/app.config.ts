import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Fleet Control Campo',
  slug: 'fleet-control-worker',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0A1628',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.fleetcontrol.worker',
  },
  android: {
    package: 'com.fleetcontrol.worker',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0A1628',
    },
    edgeToEdgeEnabled: true,
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
    ],
  },
  plugins: [
    [
      'expo-location',
      {
        isIosBackgroundLocationEnabled: true,
        locationAlwaysAndWhenInUsePermission:
          'Fleet Control Campo necesita tu ubicacion para el seguimiento en segundo plano.',
        locationWhenInUsePermission:
          'Fleet Control Campo usa tu ubicacion para compartirla con el administrador.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/adaptive-icon.png',
        color: '#00C2A8',
      },
    ],
  ],
  extra: {
    appVariant: 'worker',
    appRole: 'worker',
    eas: {
      projectId: '0f76822a-c9d7-47a4-9011-78f0d0821870',
    },
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/0f76822a-c9d7-47a4-9011-78f0d0821870',
  },
};

export default config;
