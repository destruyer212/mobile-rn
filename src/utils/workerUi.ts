import type { WorkerLocation } from '../domain/workerLocation';

export function isWorkerOnline(item: WorkerLocation): boolean {
  const seconds = (Date.now() - item.updatedAt.getTime()) / 1000;
  return item.isTracking && seconds <= 60;
}

export function displayWorkerName(worker: WorkerLocation, firstNameById: Record<string, string>): string {
  const fromProfile = firstNameById[worker.userId];
  if (fromProfile && fromProfile.length > 0) return fromProfile;
  const fallback = worker.email.split('@')[0]?.trim() ?? '';
  if (fallback.length > 0) return fallback;
  return 'Trabajador';
}
