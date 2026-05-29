import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initializePushNotifications } from '@fleet/shared-core';

import { WorkerRootNavigator } from './src/navigation/WorkerRootNavigator';

export default function App() {
  useEffect(() => {
    void initializePushNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" hidden translucent />
      <WorkerRootNavigator />
    </SafeAreaProvider>
  );
}
