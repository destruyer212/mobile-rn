import { useCallback, useEffect, useState } from 'react';

import { LocationRepository } from '@fleet/shared-data';
import { canUseSupabaseAuth, getSupabaseClient } from '@fleet/shared-lib';
import type { WorkerLocation } from '@fleet/shared-domain';

const repo = new LocationRepository();

export function useWorkerLocations(enabled: boolean) {
  const [workers, setWorkers] = useState<WorkerLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!canUseSupabaseAuth()) {
      setWorkers([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await repo.fetchWorkerLocations();
      setError(null);
      setWorkers(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !canUseSupabaseAuth()) return;

    void refresh();

    const client = getSupabaseClient();
    const channel = client
      .channel(`worker_locations_realtime_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'worker_locations' },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [enabled, refresh]);

  const isEmpty = !loading && !error && workers.length === 0;

  return { workers, error, loading, isEmpty, refresh };
}
