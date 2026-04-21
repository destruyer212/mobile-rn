import { getSupabaseClient } from '../lib/supabase';
import type { OperationalBase } from '../domain/operationalBase';
import { operationalBaseFromRow } from '../domain/operationalBase';
import type { WorkerLocation } from '../domain/workerLocation';
import { workerLocationFromRow } from '../domain/workerLocation';

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
}
