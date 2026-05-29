import { useEffect, useState } from 'react';

import { loadSavedCredentials, type SavedCredentials } from '@fleet/shared-auth';

/**
 * Carga credenciales desde AsyncStorage al montar (useEffect + useState).
 * Evidencia rúbrica: persistencia local integrada en el flujo de login.
 */
export function usePersistedCredentials() {
  const [credentials, setCredentials] = useState<SavedCredentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const saved = await loadSavedCredentials();
        if (active) {
          setCredentials(saved);
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { credentials, loading, error };
}
