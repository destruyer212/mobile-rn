import type { ExpoConfig } from 'expo/config';

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'AIzaSyBuOlWC1hTgs3tlqjn-aROvPhfg21e9iNY';

const config: ExpoConfig = {
  name: 'Fleet Control (legacy)',
  slug: 'mobile-rn',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.fleetcontrol.mobile',
  },
  android: {
    package: 'com.fleetcontrol.mobile',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    config: {
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
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
          'Fleet Control necesita tu ubicacion para el seguimiento en segundo plano.',
        locationWhenInUsePermission: 'Fleet Control usa tu ubicacion para compartirla con el administrador.',
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
    appVariant: 'legacy',
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
