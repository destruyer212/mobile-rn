import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { LocationRepository } from '../data/locationRepository';

export const BACKGROUND_LOCATION_TASK = 'fleet-control-bg-location';

const repo = new LocationRepository();

type TaskPayload = {
  userId: string;
  email: string;
};

let taskPayload: TaskPayload | null = null;

export function setBackgroundTaskPayload(next: TaskPayload | null) {
  taskPayload = next;
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }
  const loc = (data as { locations?: Location.LocationObject[] } | undefined)?.locations?.[0];
  const p = taskPayload;
  if (!loc || !p?.userId) {
    return;
  }
  try {
    await repo.upsertMyLocation({
      userId: p.userId,
      email: p.email,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      isTracking: true,
    });
  } catch {
    /* ignore */
  }
});
