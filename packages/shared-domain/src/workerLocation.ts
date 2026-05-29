export type WorkerLocation = {
  userId: string;
  email: string;
  latitude: number;
  longitude: number;
  isTracking: boolean;
  updatedAt: Date;
};

function parseCoordinate(value: unknown): number {
  if (value == null) return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function workerLocationFromRow(row: Record<string, unknown>): WorkerLocation {
  return {
    userId: String(row.user_id ?? ''),
    email: String(row.email ?? 'sin-correo'),
    latitude: parseCoordinate(row.latitude),
    longitude: parseCoordinate(row.longitude),
    isTracking: Boolean(row.is_tracking ?? false),
    updatedAt: new Date(String(row.updated_at ?? Date.now())),
  };
}
