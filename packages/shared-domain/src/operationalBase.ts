export type OperationalBase = {
  name: string;
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  updatedAt: Date | null;
};

export function operationalBaseFromRow(m: Record<string, unknown>): OperationalBase {
  const rawName = String(m.name ?? '').trim();
  const rawUpdated = m.updated_at;
  let updatedAt: Date | null = null;
  if (rawUpdated != null) {
    const d = new Date(String(rawUpdated));
    updatedAt = Number.isNaN(d.getTime()) ? null : d;
  }
  return {
    name: rawName.length > 0 ? rawName : 'Base operativa',
    enabled: Boolean(m.enabled ?? false),
    latitude: m.latitude == null ? null : Number(m.latitude),
    longitude: m.longitude == null ? null : Number(m.longitude),
    radiusMeters: Number(m.radius_meters ?? 150),
    updatedAt,
  };
}

export function isOperationalBaseConfigured(b: OperationalBase): boolean {
  return Boolean(b.enabled && b.latitude != null && b.longitude != null && b.radiusMeters > 0);
}
