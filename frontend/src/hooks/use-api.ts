import * as React from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api";

type QueryState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
};

/**
 * Small data-fetching hook: loading / error / data plus a refetch, with
 * in-flight requests aborted when the inputs change or the component unmounts.
 */
export function useApiQuery<T>(
  path: string | null,
  params?: Record<string, string | number | boolean | undefined | null>,
): QueryState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(Boolean(path));
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  // Serialise params so the effect only re-runs when values actually change.
  const paramKey = React.useMemo(() => JSON.stringify(params ?? {}), [params]);

  React.useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    api
      .get<T>(path, JSON.parse(paramKey), controller.signal)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (!active || (err as Error).name === "AbortError") return;
        // A lost session is handled globally by the auth provider; showing an
        // error card on top of the redirect would just be noise.
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [path, paramKey, tick]);

  const refetch = React.useCallback(() => setTick((n) => n + 1), []);

  return { data, loading, error, refetch, setData };
}

/**
 * Wraps a mutating call with a pending flag and toast feedback, so pages do
 * not repeat the same try/catch/toast block for every action.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: {
    successMessage?: string | ((result: TResult) => string);
    errorMessage?: string;
    onSuccess?: (result: TResult) => void;
    onError?: (error: unknown) => void;
  } = {},
) {
  const [pending, setPending] = React.useState(false);

  const mutate = React.useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setPending(true);
      try {
        const result = await fn(...args);
        if (options.successMessage) {
          toast.success(
            typeof options.successMessage === "function"
              ? options.successMessage(result)
              : options.successMessage,
          );
        }
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : options.errorMessage ?? "Something went wrong. Please try again.";
        toast.error(message);
        options.onError?.(err);
        return null;
      } finally {
        setPending(false);
      }
    },
    // The options object is typically an inline literal, so depending on it
    // directly would rebuild the callback every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  );

  return { mutate, pending };
}

/** Keeps a value in localStorage, tolerating private-mode storage failures. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable (private windows, blocked site data).
    }
  }, [key, value]);

  return [value, setValue] as const;
}

/** Debounces a rapidly-changing value, e.g. a search box. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
