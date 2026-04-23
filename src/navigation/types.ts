import type { UserRole } from '../auth/userRole';

export type RootStackParamList = {
  Login: undefined;
  WorkerHome: { userId: string; username: string };
  WorkerDiagnostics: undefined;
  AdminHome: { username: string; role: UserRole };
};
