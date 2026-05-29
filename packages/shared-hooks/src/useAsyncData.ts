import { useCallback, useEffect, useState } from 'react';

/**
 * Hook genérico: useState + useEffect + ciclo de vida con cancelación al desmontar.
 * Patrón de referencia para la rúbrica APF2 (consumo de API / datos async).
 */
export function useAsyncData<T>(params: {
  enabled: boolean;
  fetcher: () => Promise<T>;
  initialData?: T;
}) {
  const { enabled, fetcher, initialData } = params;
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled, fetcher]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcher();
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, fetcher]);

  const isEmpty =
    !loading &&
    !error &&
    (data === undefined ||
      data === null ||
      (Array.isArray(data) && data.length === 0));

  return { data, loading, error, isEmpty, reload };
}
