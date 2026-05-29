import type { UserRole } from '@fleet/shared-auth';

export type AdminStackParamList = {
  Login: undefined;
  AdminHome: { username: string; role: UserRole };
};
