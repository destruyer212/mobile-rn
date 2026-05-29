import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { AdminStackParamList } from '../navigation/types';
import { AdminDashboard } from './admin/AdminDashboard';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminHome'>;

export function AdminHomeScreen({ route }: Props) {
  const { username, role } = route.params;
  return <AdminDashboard username={username} role={role} />;
}
