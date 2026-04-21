import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { AdminDashboard } from './admin/AdminDashboard';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminHome'>;

export function AdminHomeScreen({ route }: Props) {
  const { username } = route.params;
  return <AdminDashboard username={username} />;
}
