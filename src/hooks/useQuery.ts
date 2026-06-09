import { useEffect, useRef, useState } from "react";

/** Minimal async data hook: load on mount/deps change, manual reload. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((e: unknown) => {
        console.error(e);
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-supplied deps
  }, [...deps, tick]);

  return { data, loading, error, reload: async () => setTick((t) => t + 1) };
}
