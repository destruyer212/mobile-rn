export type WorkerLocation = {
  userId: string;
  email: string;
  latitude: number;
  longitude: number;
  isTracking: boolean;
  updatedAt: Date;
};

export function workerLocationFromRow(row: Record<string, unknown>): WorkerLocation {
  return {
    userId: String(row.user_id ?? ''),
    email: String(row.email ?? 'sin-correo'),
    latitude: Number(row.latitude ?? 0),
    longitude: Number(row.longitude ?? 0),
    isTracking: Boolean(row.is_tracking ?? false),
    updatedAt: new Date(String(row.updated_at ?? Date.now())),
  };
}
