import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';

import { requestLocationPermissionOnAppStart } from '@fleet/shared-core';

import { LoginScreen } from '../screens/LoginScreen';
import { WorkerDiagnosticsScreen } from '../screens/WorkerDiagnosticsScreen';
import { WorkerHomeScreen } from '../screens/WorkerHomeScreen';
import type { WorkerStackParamList } from './types';

const Stack = createNativeStackNavigator<WorkerStackParamList>();

export function WorkerRootNavigator() {
  useEffect(() => {
    void requestLocationPermissionOnAppStart();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="WorkerHome" component={WorkerHomeScreen} />
        <Stack.Screen
          name="WorkerDiagnostics"
          component={WorkerDiagnosticsScreen}
          options={{
            headerShown: true,
            title: 'Diagnostico de seguimiento',
            headerTintColor: '#E8ECF2',
            headerStyle: { backgroundColor: '#0A1628' },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
