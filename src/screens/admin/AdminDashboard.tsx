import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';

import type { UserRole } from '../../auth/userRole';
import { registerAdminDeviceToken } from '../../core/services/pushNotificationService';
import { AdminCenterTab } from './AdminCenterTab';
import { AdminOperationsTab } from './AdminOperationsTab';
import { AdminReportsTab } from './AdminReportsTab';
import { AdminTeamTab } from './AdminTeamTab';

export type AdminTabParamList = {
  Operations: undefined;
  Reports: undefined;
  Team: undefined;
  Center: undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

export function AdminDashboard({ username, role }: { username: string; role: UserRole }) {
  const [focusWorkerId, setFocusWorkerId] = useState<string | null>(null);

  const consumeFocus = useCallback(() => setFocusWorkerId(null), []);

  const handleOpenWorkerOnMap = useCallback((userId: string) => {
    setFocusWorkerId(userId);
  }, []);

  useEffect(() => {
    void registerAdminDeviceToken();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void registerAdminDeviceToken();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00C2A8',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
          backgroundColor: '#FFFFFF',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
        },
      }}
    >
      <Tab.Screen
        name="Operations"
        options={{
          tabBarLabel: 'Operaciones',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>🗺️</Text>,
        }}
      >
        {() => (
          <AdminOperationsTab
            username={username}
            role={role}
            focusWorkerId={focusWorkerId}
            onConsumedFocus={consumeFocus}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Reports"
        options={{
          tabBarLabel: 'Reportes',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>📊</Text>,
        }}
      >
        {() => <AdminReportsTab username={username} role={role} onOpenWorkerOnMap={handleOpenWorkerOnMap} />}
      </Tab.Screen>
      <Tab.Screen
        name="Team"
        options={{
          tabBarLabel: 'Gestion',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>👥</Text>,
        }}
      >
        {() => <AdminTeamTab username={username} role={role} />}
      </Tab.Screen>
      <Tab.Screen
        name="Center"
        options={{
          tabBarLabel: 'Centro',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>🏢</Text>,
        }}
      >
        {() => <AdminCenterTab username={username} role={role} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
