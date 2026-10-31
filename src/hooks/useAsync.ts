import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { toErrorMessage } from '../lib/errors';
import { BACK_ONLINE_EVENT } from '../lib/networkActivity';

/** Charge une donnée asynchrone avec états de chargement / erreur et rechargement. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (id === requestId.current) setData(result);
    } catch (err) {
      if (id === requestId.current) setError(toErrorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Connexion revenue : une donnée qui n'avait pas pu se charger est rechargée automatiquement
  const errorRef = useRef(error);
  errorRef.current = error;
  useEffect(() => {
    const onBackOnline = () => {
      if (errorRef.current) void reload();
    };
    window.addEventListener(BACK_ONLINE_EVENT, onBackOnline);
    return () => window.removeEventListener(BACK_ONLINE_EVENT, onBackOnline);
  }, [reload]);

  return { data, error, loading, reload, setData };
}
