import * as Location from 'expo-location';

import { canUseSupabaseAuth } from '../lib/supabase';
import { LocationRepository } from '../data/locationRepository';
import { setBackgroundTaskPayload, BACKGROUND_LOCATION_TASK } from '../tasks/backgroundLocationTask';
import { UPDATE_INTERVAL_SECONDS } from '../constants/tracking';
import { setTrackingDesired } from './workerTrackingPrefs';

const repo = new LocationRepository();

let foregroundTimer: ReturnType<typeof setInterval> | null = null;

async function upsert(userId: string, email: string, lat: number, lng: number) {
  await repo.upsertMyLocation({
    userId,
    email,
    latitude: lat,
    longitude: lng,
    isTracking: true,
  });
}

export async function requestLocationPermissions(requireBackground: boolean): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) {
    return false;
  }
  if (requireBackground) {
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {
      /* iOS / algunas builds: seguimos con primer plano */
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

  setBackgroundTaskPayload({ userId: params.userId, email: params.email });
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
          notificationTitle: 'Seguimiento activo',
          notificationBody: `Compartiendo ubicacion cada ${UPDATE_INTERVAL_SECONDS} s`,
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
  setBackgroundTaskPayload(null);

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
