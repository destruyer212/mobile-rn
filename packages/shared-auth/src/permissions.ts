import type { UserRole } from './userRole';

export type Permission =
  | 'reports.export.csv'
  | 'reports.export.pdf'
  | 'team.manage'
  | 'base.edit'
  | 'audit.view'
  | 'health.view';

const permissionMap: Record<UserRole, Permission[]> = {
  admin: [
    'reports.export.csv',
    'reports.export.pdf',
    'team.manage',
    'base.edit',
    'audit.view',
    'health.view',
  ],
  worker: [],
};

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return permissionMap[role]?.includes(permission) ?? false;
}
