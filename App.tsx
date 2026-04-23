import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initializePushNotifications } from './src/core/services/pushNotificationService';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  useEffect(() => {
    void initializePushNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" hidden translucent />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
