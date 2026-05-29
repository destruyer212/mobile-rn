import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { canUseSupabaseAuth } from '@fleet/shared-lib';
import { LocationRepository } from '@fleet/shared-data';
import {
  setBackgroundTaskPayload,
  BACKGROUND_LOCATION_TASK,
  upsertWithOfflineQueue,
  getPendingUploadCount,
} from '@fleet/shared-tracking-worker';
import { UPDATE_INTERVAL_SECONDS } from '@fleet/shared-config';
import { setTrackingDesired } from './workerTrackingPrefs';

const repo = new LocationRepository();

let foregroundTimer: ReturnType<typeof setInterval> | null = null;

async function upsert(userId: string, email: string, lat: number, lng: number) {
  await upsertWithOfflineQueue({
    userId,
    email,
    latitude: lat,
    longitude: lng,
    capturedAtIso: new Date().toISOString(),
  });
}

export async function requestLocationPermissions(requireBackground: boolean): Promise<boolean> {
  const fgCurrent = await Location.getForegroundPermissionsAsync();
  const fg =
    fgCurrent.status === Location.PermissionStatus.GRANTED
      ? fgCurrent
      : await Location.requestForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) {
    return false;
  }

  if (requireBackground) {
    const bgCurrent = await Location.getBackgroundPermissionsAsync();
    if (bgCurrent.status === Location.PermissionStatus.GRANTED) {
      return true;
    }
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== Location.PermissionStatus.GRANTED && Platform.OS === 'android') {
        return false;
      }
    } catch {
      if (Platform.OS === 'android') {
        return false;
      }
    }
  }
  return true;
}

export async function startTracking(params: { userId: string; email: string }): Promise<{ ok: boolean; message?: string }> {
  if (!canUseSupabaseAuth()) {
    return { ok: false, message: 'Supabase no configurado. Activalo para enviar GPS real.' };
  }

  const serviceEnabled = await Location.hasServicesEnabledAsync();
  if (!serviceEnabled) {
    return { ok: false, message: 'Activa el GPS (ubicacion) del telefono en ajustes.' };
  }

  const allowed = await requestLocationPermissions(true);
  if (!allowed) {
    return { ok: false, message: 'Sin permiso de ubicacion no podemos compartir tu posicion.' };
  }

  await setBackgroundTaskPayload({ userId: params.userId, email: params.email });
  await setTrackingDesired(params.userId, true);

  let bgOk = false;
  const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (!already) {
    try {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: UPDATE_INTERVAL_SECONDS * 1000,
        distanceInterval: 0,
        foregroundService: {
          notificationTitle: 'Segundo plano activo',
          notificationBody: `Seguimiento GPS ejecutandose cada ${UPDATE_INTERVAL_SECONDS}s`,
          notificationColor: '#00C2A8',
        },
      });
      bgOk = true;
    } catch {
      bgOk = false;
    }
  } else {
    bgOk = true;
  }

  if (foregroundTimer) {
    clearInterval(foregroundTimer);
    foregroundTimer = null;
  }

  if (!bgOk) {
    foregroundTimer = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await upsert(params.userId, params.email, pos.coords.latitude, pos.coords.longitude);
      } catch {
        /* ignore */
      }
    }, UPDATE_INTERVAL_SECONDS * 1000);
  }

  return { ok: true };
}

export async function stopTracking(userId: string): Promise<void> {
  await setTrackingDesired(userId, false);
  await setBackgroundTaskPayload(null);

  if (foregroundTimer) {
    clearInterval(foregroundTimer);
    foregroundTimer = null;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }

  if (canUseSupabaseAuth()) {
    try {
      await repo.setTrackingDisabled(userId);
    } catch {
      /* ignore */
    }
  }
}

export function isForegroundTimerRunning(): boolean {
  return foregroundTimer != null;
}

export async function getPendingTrackingQueueCount(): Promise<number> {
  return await getPendingUploadCount();
}
