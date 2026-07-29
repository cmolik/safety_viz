import { useEffect, useMemo, useRef, useState } from "react";

export type ApiQueryState<T> = {
  data?: T;
  error?: unknown;
  loading: boolean;
  refetch: () => void;
};

export function useApiQuery<T>(key: string | string[], fetcher: () => Promise<T>): ApiQueryState<T> {
  const stableKey = Array.isArray(key) ? key.join("::") : key;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);
  const rerun = useRef(0);

  const run = useMemo(() => async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetcher();
      setData(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    run();
    // when key changes, run again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey, rerun.current]);

  const refetch = () => {
    rerun.current++;
    run();
  };

  return { data, error, loading, refetch };
}
