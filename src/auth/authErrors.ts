import type { UserRole } from './userRole';

export class RoleMismatchError extends Error {
  constructor(
    public readonly expectedSelection: UserRole,
    public readonly actualRole: UserRole,
  ) {
    super(roleMismatchMessage(expectedSelection, actualRole));
    this.name = 'RoleMismatchError';
  }
}

function roleMismatchMessage(expected: UserRole, actual: UserRole): string {
  if (expected === 'admin' && actual === 'worker') {
    return 'Este usuario es trabajador. Selecciona Trabajador o usa una cuenta de administrador.';
  }
  if (expected === 'worker' && actual === 'admin') {
    return 'Este usuario es administrador. Selecciona Administrador o usa una cuenta de trabajador.';
  }
  return 'El rol seleccionado no coincide con tu cuenta.';
}

/** Convierte errores técnicos en mensajes claros (paridad con Flutter `friendlyAuthErrorMessage`). */
export function friendlyAuthErrorMessage(error: unknown): string {
  const raw = String(error);
  const s = raw.toLowerCase();

  if (s.includes('no host specified') || s.includes('invalid argument(s): no host')) {
    return (
      'La app no tiene bien configurada la URL del servidor. ' +
      'Reinstala el APK actualizado o compila con EXPO_PUBLIC_SUPABASE_URL.'
    );
  }

  if (
    s.includes('socketfailed') ||
    s.includes('failed host lookup') ||
    s.includes('host lookup') ||
    s.includes('no address associated') ||
    s.includes('network is unreachable') ||
    s.includes('connection refused') ||
    s.includes('connection timed out') ||
    s.includes('connection reset') ||
    s.includes('errno = 7') ||
    s.includes('errno = 101') ||
    s.includes('no internet')
  ) {
    return (
      'Sin conexion a Internet o el telefono no puede contactar al servidor ' +
      '(DNS o red bloqueada). Activa datos moviles o Wi-Fi, prueba otra red e intenta de nuevo.'
    );
  }

  if (s.includes('invalid login credentials') || s.includes('invalid_credentials')) {
    return 'Correo o contrasena incorrectos.';
  }

  const cleaned = raw.replace(/^Error:\s*/i, '').replace(/^exception:\s*/i, '');
  if (cleaned.length > 200) {
    return `${cleaned.substring(0, 197)}...`;
  }
  return cleaned;
}
