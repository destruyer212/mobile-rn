import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LocationRepository } from '@fleet/shared-data';

export const BACKGROUND_LOCATION_TASK = 'fleet-control-bg-location';

const repo = new LocationRepository();
const TASK_PAYLOAD_KEY = 'tracking_task_payload_v1';
const OFFLINE_QUEUE_KEY = 'tracking_offline_queue_v1';
const MAX_QUEUE_SIZE = 240;

type TaskPayload = {
  userId: string;
  email: string;
};

type OfflineQueuedPoint = {
  userId: string;
  email: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
};

let taskPayload: TaskPayload | null = null;

async function readQueue(): Promise<OfflineQueuedPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueuedPoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: OfflineQueuedPoint[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
}

async function enqueueOfflinePoint(point: OfflineQueuedPoint): Promise<void> {
  const queue = await readQueue();
  const last = queue[queue.length - 1];
  if (last) {
    const isSamePosition =
      Math.abs(last.latitude - point.latitude) < 0.00001 &&
      Math.abs(last.longitude - point.longitude) < 0.00001;
    const withinSeconds =
      Math.abs(new Date(point.capturedAt).getTime() - new Date(last.capturedAt).getTime()) < 20_000;
    if (isSamePosition && withinSeconds) return;
  }
  queue.push(point);
  await writeQueue(queue);
}

async function flushOfflineQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const remaining: OfflineQueuedPoint[] = [];
  for (const point of queue) {
    try {
      await repo.upsertMyLocation({
        userId: point.userId,
        email: point.email,
        latitude: point.latitude,
        longitude: point.longitude,
        isTracking: true,
      });
    } catch {
      remaining.push(point);
    }
  }

  await writeQueue(remaining);
}

async function readStoredPayload(): Promise<TaskPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(TASK_PAYLOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaskPayload;
    if (!parsed?.userId || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setBackgroundTaskPayload(next: TaskPayload | null): Promise<void> {
  taskPayload = next;
  if (!next) {
    await AsyncStorage.removeItem(TASK_PAYLOAD_KEY);
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    return;
  }
  await AsyncStorage.setItem(TASK_PAYLOAD_KEY, JSON.stringify(next));
}

export async function getPendingUploadCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function upsertWithOfflineQueue(params: {
  userId: string;
  email: string;
  latitude: number;
  longitude: number;
  capturedAtIso?: string;
}): Promise<void> {
  try {
    await flushOfflineQueue();
    await repo.upsertMyLocation({
      userId: params.userId,
      email: params.email,
      latitude: params.latitude,
      longitude: params.longitude,
      isTracking: true,
    });
  } catch {
    await enqueueOfflinePoint({
      userId: params.userId,
      email: params.email,
      latitude: params.latitude,
      longitude: params.longitude,
      capturedAt: params.capturedAtIso ?? new Date().toISOString(),
    });
    throw new Error('queued_offline');
  }
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }
  const loc = (data as { locations?: Location.LocationObject[] } | undefined)?.locations?.[0];
  if (!taskPayload) {
    taskPayload = await readStoredPayload();
  }
  const p = taskPayload;
  if (!loc || !p?.userId) {
    return;
  }

  try {
    await upsertWithOfflineQueue({
      userId: p.userId,
      email: p.email,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      capturedAtIso: new Date(loc.timestamp ?? Date.now()).toISOString(),
    });
  } catch {
    // En modo background dejamos la cola local para reintentos automaticos.
  }
});
