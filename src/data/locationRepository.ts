import { getSupabaseClient } from '../lib/supabase';
import type { OperationalBase } from '../domain/operationalBase';
import { operationalBaseFromRow } from '../domain/operationalBase';
import type { WorkerLocation } from '../domain/workerLocation';
import { workerLocationFromRow } from '../domain/workerLocation';

export type WorkerRoutePoint = {
  latitude: number;
  longitude: number;
  updatedAt: Date;
};

export type AdminHealthSnapshot = {
  workerLocationsOnline: number;
  workerLocationsTotal: number;
  staleWorkers: number;
  baseConfigured: boolean;
  checkedAt: Date;
};

export type AdminAuditEntry = {
  actorEmail: string;
  action: string;
  createdAt: Date;
};

export class LocationRepository {
  async fetchProfileFirstNamesByUserIds(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('id,full_name')
      .in('id', userIds);
    if (error) throw error;
    const result: Record<string, string> = {};
    for (const raw of data ?? []) {
      const row = raw as Record<string, unknown>;
      const id = String(row.id ?? '');
      const fullName = String(row.full_name ?? '').trim();
      if (!id || !fullName) continue;
      const firstName = fullName.split(/\s+/)[0]?.trim() ?? '';
      if (firstName.length > 0) result[id] = firstName;
    }
    return result;
  }

  async fetchProfilePhonesByUserIds(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('id,phone')
      .in('id', userIds);
    if (error) throw error;
    const result: Record<string, string> = {};
    for (const raw of data ?? []) {
      const row = raw as Record<string, unknown>;
      const id = String(row.id ?? '');
      const phone = String(row.phone ?? '').trim();
      if (!id || !phone) continue;
      result[id] = phone;
    }
    return result;
  }

  async fetchWorkerLocations(): Promise<WorkerLocation[]> {
    const { data, error } = await getSupabaseClient()
      .from('worker_locations')
      .select('user_id,email,latitude,longitude,is_tracking,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => workerLocationFromRow(row as Record<string, unknown>));
  }

  async fetchWorkerRouteHistory(params: {
    userId: string;
    limit?: number;
  }): Promise<WorkerRoutePoint[]> {
    const { userId, limit = 80 } = params;
    const client = getSupabaseClient();
    // Best-effort: some deployments may not have this table yet.
    const { data, error } = await client
      .from('worker_location_history')
      .select('latitude,longitude,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (error) {
      // Graceful fallback to current location record if history table is unavailable.
      const { data: currentRows, error: currentErr } = await client
        .from('worker_locations')
        .select('latitude,longitude,updated_at')
        .eq('user_id', userId)
        .limit(1);
      if (currentErr) throw currentErr;
      return (currentRows ?? []).map((row) => ({
        latitude: Number((row as Record<string, unknown>).latitude ?? 0),
        longitude: Number((row as Record<string, unknown>).longitude ?? 0),
        updatedAt: new Date(String((row as Record<string, unknown>).updated_at ?? Date.now())),
      }));
    }

    return (data ?? []).map((row) => ({
      latitude: Number((row as Record<string, unknown>).latitude ?? 0),
      longitude: Number((row as Record<string, unknown>).longitude ?? 0),
      updatedAt: new Date(String((row as Record<string, unknown>).updated_at ?? Date.now())),
    }));
  }

  async upsertMyLocation(params: {
    userId: string;
    email: string;
    latitude: number;
    longitude: number;
    isTracking: boolean;
  }): Promise<void> {
    const row = {
      user_id: params.userId,
      email: params.email,
      latitude: params.latitude,
      longitude: params.longitude,
      is_tracking: params.isTracking,
      updated_at: new Date().toISOString(),
    };
    const { error } = await getSupabaseClient().from('worker_locations').upsert(row as never, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async setTrackingDisabled(userId: string): Promise<void> {
    const row = {
      user_id: userId,
      is_tracking: false,
      updated_at: new Date().toISOString(),
    };
    const { error } = await getSupabaseClient().from('worker_locations').upsert(row as never, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async fetchOperationalBase(): Promise<OperationalBase | null> {
    const { data, error } = await getSupabaseClient()
      .from('operational_base')
      .select()
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return operationalBaseFromRow(data as Record<string, unknown>);
  }

  async upsertOperationalBase(params: {
    name: string;
    enabled: boolean;
    latitude: number | null | undefined;
    longitude: number | null | undefined;
    radiusMeters: number;
  }): Promise<void> {
    const row = {
      id: 1,
      name: params.name,
      enabled: params.enabled,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      radius_meters: params.radiusMeters,
      updated_at: new Date().toISOString(),
    };
    const { error } = await getSupabaseClient().from('operational_base').upsert(row as never, { onConflict: 'id' });
    if (error) throw error;
  }

  async logAdminAction(params: {
    actorEmail: string;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const row = {
      actor_email: params.actorEmail,
      action: params.action,
      metadata: params.metadata ?? {},
      created_at: new Date().toISOString(),
    };
    const { error } = await getSupabaseClient().from('admin_audit_log').insert(row as never);
    // In environments without this table, we avoid crashing app flows.
    if (error) return;
  }

  async fetchAdminHealthSnapshot(): Promise<AdminHealthSnapshot> {
    const workers = await this.fetchWorkerLocations();
    const onlineMs = 60 * 1000;
    const now = Date.now();
    const online = workers.filter((w) => now - w.updatedAt.getTime() <= onlineMs).length;
    const staleWorkers = workers.filter((w) => now - w.updatedAt.getTime() > 10 * 60 * 1000).length;
    const base = await this.fetchOperationalBase();
    const baseConfigured = Boolean(
      base && base.enabled && base.latitude != null && base.longitude != null && base.radiusMeters > 0,
    );
    return {
      workerLocationsOnline: online,
      workerLocationsTotal: workers.length,
      staleWorkers,
      baseConfigured,
      checkedAt: new Date(),
    };
  }

  async fetchRecentAdminAuditLogs(limit = 8): Promise<AdminAuditEntry[]> {
    const { data, error } = await getSupabaseClient()
      .from('admin_audit_log')
      .select('actor_email,action,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []).map((row) => ({
      actorEmail: String((row as Record<string, unknown>).actor_email ?? 'sistema'),
      action: String((row as Record<string, unknown>).action ?? 'unknown'),
      createdAt: new Date(String((row as Record<string, unknown>).created_at ?? Date.now())),
    }));
  }
}
