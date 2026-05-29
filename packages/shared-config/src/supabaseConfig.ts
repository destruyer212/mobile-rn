/**
 * Credenciales Supabase (misma lógica que `mobile/lib/core/config/supabase_config.dart`).
 * En desarrollo puedes sobreescribir con variables `EXPO_PUBLIC_*` en `.env` o en `app.config`.
 */
const _defaultUrl = 'https://whmezumhemyqezfokhlv.supabase.co';
const _defaultPublishableKey =
  'sb_publishable_d766UxM1QB5nHg6J021BLQ_bOQJCuZn';

function trimEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

export const supabaseUrl = trimEnv(process.env.EXPO_PUBLIC_SUPABASE_URL) || _defaultUrl;

const anonKey = trimEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const publishableKey =
  trimEnv(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) || _defaultPublishableKey;

export function getClientKey(): string {
  if (publishableKey.length > 0) return publishableKey;
  if (anonKey.length > 0) return anonKey;
  return _defaultPublishableKey;
}

export function getEffectiveUrl(): string {
  const u = supabaseUrl.trim();
  try {
    const parsed = new URL(u);
    if (parsed.protocol && parsed.host) return u;
  } catch {
    /* ignore */
  }
  return _defaultUrl;
}

export function isSupabaseConfigured(): boolean {
  const u = getEffectiveUrl();
  try {
    const parsed = new URL(u);
    const hostOk = Boolean(parsed.protocol && parsed.host);
    const keyOk = getClientKey().trim().length > 0;
    return hostOk && keyOk;
  } catch {
    return false;
  }
}
