import { getCredentialsKeyPrefix } from '@fleet/shared-config';

/** Claves AsyncStorage usadas por la app (documentación / rúbrica APF2). */
export const ASYNC_STORAGE_KEYS = {
  credentialsRemember: `${getCredentialsKeyPrefix()}-remember`,
  credentialsEmail: `${getCredentialsKeyPrefix()}-email`,
  credentialsPassword: `${getCredentialsKeyPrefix()}-password`,
  credentialsRole: `${getCredentialsKeyPrefix()}-role`,
  /** Sesión Supabase — ver getAuthStorageKey() en shared-config */
  supabaseSessionPrefix: 'fleet-control-auth-',
  trackingDesiredPrefix: 'tracking_desired_',
  offlineGpsQueue: 'fleet_offline_location_queue',
  backgroundTaskPayload: 'fleet_bg_task_payload',
} as const;
