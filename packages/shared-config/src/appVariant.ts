import Constants from 'expo-constants';

export type AppVariant = 'worker' | 'admin' | 'legacy';

function normalizeVariant(raw: string | undefined): AppVariant | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'worker' || v === 'admin' || v === 'legacy') return v;
  return null;
}

function variantFromExpoExtra(): AppVariant | null {
  const extra = Constants.expoConfig?.extra as { appVariant?: string; appRole?: string } | undefined;
  return normalizeVariant(extra?.appVariant) ?? normalizeVariant(extra?.appRole);
}

/** Variante de build: env, EAS o `extra.appVariant` en app.config. */
export function getAppVariant(): AppVariant {
  return (
    normalizeVariant(process.env.APP_VARIANT) ??
    normalizeVariant(process.env.EXPO_PUBLIC_APP_ROLE) ??
    variantFromExpoExtra() ??
    'legacy'
  );
}

/** Clave de sesión Supabase distinta por app instalada (AsyncStorage). */
export function getAuthStorageKey(): string {
  return `fleet-control-auth-${getAppVariant()}`;
}

/** Prefijo para credenciales guardadas en AsyncStorage. */
export function getCredentialsKeyPrefix(): string {
  return `fleet-control-creds-${getAppVariant()}`;
}
