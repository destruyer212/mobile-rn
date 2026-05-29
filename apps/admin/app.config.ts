import type { ExpoConfig } from 'expo/config';

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'AIzaSyBuOlWC1hTgs3tlqjn-aROvPhfg21e9iNY';

const config: ExpoConfig = {
  name: 'Fleet Control Admin',
  slug: 'fleet-control-admin',
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
    supportsTablet: true,
    bundleIdentifier: 'com.fleetcontrol.admin',
  },
  android: {
    package: 'com.fleetcontrol.admin',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0A1628',
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
    ],
  },
  plugins: [
    [
      'expo-notifications',
      {
        icon: './assets/adaptive-icon.png',
        color: '#00C2A8',
      },
    ],
  ],
  extra: {
    appVariant: 'admin',
    appRole: 'admin',
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
