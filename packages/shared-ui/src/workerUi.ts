import type { WorkerLocation } from '@fleet/shared-domain';

export const WORKER_ONLINE_GRACE_SECONDS = 5 * 60;
export const WORKER_STALE_SECONDS = 10 * 60;
export const WORKER_CRITICAL_SECONDS = 30 * 60;

export function isWorkerOnline(item: WorkerLocation): boolean {
  const seconds = (Date.now() - item.updatedAt.getTime()) / 1000;
  return item.isTracking && seconds <= WORKER_ONLINE_GRACE_SECONDS;
}

export function displayWorkerName(worker: WorkerLocation, firstNameById: Record<string, string>): string {
  const fromProfile = firstNameById[worker.userId];
  if (fromProfile && fromProfile.length > 0) return fromProfile;
  const fallback = worker.email.split('@')[0]?.trim() ?? '';
  if (fallback.length > 0) return fallback;
  return 'Trabajador';
}
