export type UserRole = 'admin' | 'worker';

export function userRoleLabel(role: UserRole): string {
  return role === 'admin' ? 'Administrador' : 'Trabajador';
}

export function userRoleFromString(value: string | null | undefined): UserRole | null {
  switch (value?.toLowerCase()) {
    case 'admin':
    case 'administrador':
      return 'admin';
    case 'worker':
    case 'trabajador':
      return 'worker';
    default:
      return null;
  }
}
