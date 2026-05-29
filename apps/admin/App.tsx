import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initializePushNotifications } from '@fleet/shared-core';

import { AdminRootNavigator } from './src/navigation/AdminRootNavigator';

export default function App() {
  useEffect(() => {
    void initializePushNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" hidden translucent />
      <AdminRootNavigator />
    </SafeAreaProvider>
  );
}
