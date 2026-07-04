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
import { isTrackingDesired, setTrackingDesired } from './workerTrackingPrefs';

const repo = new LocationRepository();

let foregroundTimer: ReturnType<typeof setInterval> | null = null;

function backgroundLocationOptions(accuracy: Location.Accuracy): Location.LocationTaskOptions {
  return {
    accuracy,
    mayShowUserSettingsDialog: true,
    timeInterval: UPDATE_INTERVAL_SECONDS * 1000,
    distanceInterval: 0,
    deferredUpdatesDistance: 0,
    deferredUpdatesInterval: 0,
    deferredUpdatesTimeout: 0,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Fleet Control activo',
      notificationBody: `Compartiendo ubicacion cada ${UPDATE_INTERVAL_SECONDS}s. No cierres esta notificacion.`,
      notificationColor: '#00C2A8',
      killServiceOnDestroy: false,
    },
  };
}

async function upsert(userId: string, email: string, lat: number, lng: number) {
  await upsertWithOfflineQueue({
    userId,
    email,
    latitude: lat,
    longitude: lng,
    capturedAtIso: new Date().toISOString(),
  });
}

function startForegroundHeartbeat(params: { userId: string; email: string }): void {
  if (foregroundTimer) {
    clearInterval(foregroundTimer);
    foregroundTimer = null;
  }

  foregroundTimer = setInterval(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      await upsert(params.userId, params.email, pos.coords.latitude, pos.coords.longitude);
    } catch {
      /* background/offline queue handles the next valid point */
    }
  }, Math.max(UPDATE_INTERVAL_SECONDS * 1000, 15_000));
}

async function startOrRestartBackgroundTask(): Promise<boolean> {
  const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (already) {
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
      /* continue and try to start again */
    }
  }

  try {
    await Location.startLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
      backgroundLocationOptions(Location.Accuracy.High),
    );
    return true;
  } catch {
    try {
      await Location.startLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK,
        backgroundLocationOptions(Location.Accuracy.Balanced),
      );
      return true;
    } catch {
      return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  }
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

  const bgOk = await startOrRestartBackgroundTask();
  startForegroundHeartbeat(params);

  return {
    ok: true,
    message: bgOk
      ? 'Seguimiento robusto activo en segundo plano.'
      : 'Seguimiento activo mientras la app este abierta. Revisa permisos de segundo plano.',
  };
}

export async function repairTrackingIfNeeded(params: { userId: string; email: string }): Promise<boolean> {
  const desired = await isTrackingDesired(params.userId);
  if (!desired) return false;
  const serviceEnabled = await Location.hasServicesEnabledAsync();
  if (!serviceEnabled) return false;
  const allowed = await requestLocationPermissions(true);
  if (!allowed) return false;
  await setBackgroundTaskPayload({ userId: params.userId, email: params.email });
  await startOrRestartBackgroundTask();
  startForegroundHeartbeat(params);
  return true;
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
