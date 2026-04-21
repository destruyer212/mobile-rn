import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { canUseSupabaseAuth, getSupabaseClient } from '../../lib/supabase';
import { initializeLocalNotifications } from './localNotificationService';

export type NotifyAdminsOutcome =
  | 'success'
  | 'noAdminTokens'
  | 'fcmAllFailed'
  | 'requestFailed';

let initialized = false;

export async function initializePushNotifications(): Promise<void> {
  if (initialized) return;
  await initializeLocalNotifications();
  await Notifications.requestPermissionsAsync();
  initialized = true;
}

export async function registerAdminDeviceToken(): Promise<void> {
  if (!canUseSupabaseAuth()) return;
  await initializePushNotifications();

  const user = getSupabaseClient().auth.getUser
    ? (await getSupabaseClient().auth.getUser()).data.user
    : null;
  if (!user) return;

  let token: string | null = null;

  try {
    const native = await Notifications.getDevicePushTokenAsync();
    token = String(native.data ?? '');
  } catch {
    token = null;
  }

  if (!token) {
    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      const expoToken = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      token = expoToken.data;
    } catch {
      token = null;
    }
  }

  if (!token) return;

  await getSupabaseClient().from('admin_device_tokens').upsert(
    {
      user_id: user.id,
      fcm_token: token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: 'fcm_token' },
  );
}

export async function notifyAdminsWorkerEvent(params: {
  workerName: string;
  event: 'disconnect' | 'app_open' | 'tracking_on' | 'stationary';
}): Promise<NotifyAdminsOutcome> {
  if (!canUseSupabaseAuth()) return 'requestFailed';

  try {
    const { data, error } = await getSupabaseClient().functions.invoke(
      'notify-admin-disconnect',
      {
        body: {
          worker_name: params.workerName,
          event: params.event,
        },
      },
    );

    if (error) return 'requestFailed';
    if (!data || typeof data !== 'object') return 'requestFailed';

    const map = data as Record<string, unknown>;
    const err = map.error;
    if (err != null && String(err).trim().length > 0) return 'requestFailed';

    const sent = typeof map.sent === 'number' ? map.sent : 0;
    if (sent > 0) return 'success';

    const total = typeof map.total_tokens === 'number' ? map.total_tokens : 0;
    if (total > 0) return 'fcmAllFailed';
    return 'noAdminTokens';
  } catch {
    return 'requestFailed';
  }
}

export async function notifyAdminsWorkerDisconnected(workerName: string): Promise<void> {
  await notifyAdminsWorkerEvent({
    workerName,
    event: 'disconnect',
  });
}

export async function notifyAdminsWorkerStationary(workerName: string): Promise<void> {
  await notifyAdminsWorkerEvent({
    workerName,
    event: 'stationary',
  });
}
