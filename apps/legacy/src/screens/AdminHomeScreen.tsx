import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { AdminDashboard } from './admin/AdminDashboard';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminHome'>;

export function AdminHomeScreen({ route }: Props) {
  const { username, role } = route.params;
  return <AdminDashboard username={username} role={role} />;
}
