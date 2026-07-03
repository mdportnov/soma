import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal async data hook: load on mount/deps change, manual reload.
 *
 * On failure the error is thrown during render so the nearest route
 * `ErrorBoundary` catches it and offers a retry — otherwise a rejected query
 * leaves `loading=false, data=null` and the page's `if (loading || !data)`
 * guard would spin forever. `reload()` resolves only after the refetch settles,
 * and a request-id guard drops stale results from a superseded load (rapid
 * navigation / deps change).
 */
export function useQuery<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  opts: { throwOnError?: boolean } = {},
) {
  const { throwOnError = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const runId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Resolves only after the refetch settles, so callers can `await reload()`
  // and trust the data has refreshed (the old implementation resolved
  // immediately after scheduling a re-render). Returns void — the fresh data is
  // delivered through `data`, and returning it would break callers that pass
  // `reload` where a `() => Promise<void>` is expected.
  const reload = useCallback(async (): Promise<void> => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      // Ignore a result from a load that a newer one has superseded.
      if (mounted.current && runId.current === id) {
        setData(result);
        setLoading(false);
      }
    } catch (e: unknown) {
      console.error(e);
      if (mounted.current && runId.current === id) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-supplied deps
  }, [...deps]);

  // Surface load failures to the nearest route ErrorBoundary (which renders a
  // retry). No page consumes `error` inline, so this replaces the former
  // infinite spinner with a real, recoverable error UI. Decorative queries in
  // always-mounted chrome (outside any route boundary) opt out via
  // throwOnError:false so a non-critical failure can't crash the whole app.
  if (error && throwOnError) throw error;

  return { data, loading, error: error?.message ?? null, reload };
}
