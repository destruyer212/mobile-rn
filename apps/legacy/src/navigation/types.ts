import type { UserRole } from '@fleet/shared-auth';

export type RootStackParamList = {
  Login: undefined;
  WorkerHome: { userId: string; username: string };
  WorkerDiagnostics: undefined;
  AdminHome: { username: string; role: UserRole };
};

