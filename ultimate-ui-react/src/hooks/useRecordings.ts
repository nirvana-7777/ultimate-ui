import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadRecordingProviders,
  recordingBackend,
  type RecordingProvider,
} from '@/services/recordingsService';
import type { RecordingItem, RecordingSource, TimerItem } from '@/lib/recordings';

const isAbort = (e: unknown) => (e as any)?.name === 'AbortError';
const msg = (e: unknown) => (e as Error)?.message || 'Unbekannter Fehler';

export function useRecordingProviders() {
  const [providers, setProviders] = useState<RecordingProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadRecordingProviders().then((p) => {
      if (!alive) return;
      setProviders(p);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [nonce]);
  return { providers, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export interface FanOutResult<T> {
  items: T[];
  loading: boolean;
  /** Set only when every requested provider failed. */
  error: string | null;
  /** Providers that failed while others worked (e.g. no recording support). */
  failed: { provider: string; message: string }[];
  reload: () => void;
  setItems: (fn: (prev: T[]) => T[]) => void;
}

/**
 * Per-provider endpoints, fanned out for "all providers". A provider that
 * cannot do recordings must not break the others, so failures are collected.
 */
function useFanOut<T>(
  enabled: boolean,
  targets: string[],
  fetchOne: (provider: string, signal: AbortSignal) => Promise<T[]>,
  deps: unknown[]
): FanOutResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ provider: string; message: string }[]>([]);
  const [nonce, setNonce] = useState(0);
  const targetKey = targets.join('\u0000');

  useEffect(() => {
    if (!enabled) return;
    if (targets.length === 0) {
      setItems([]);
      setFailed([]);
      setError(null);
      setLoading(false);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    setError(null);
    Promise.allSettled(targets.map((p) => fetchOne(p, c.signal))).then((results) => {
      if (c.signal.aborted) return;
      const ok: T[] = [];
      const bad: { provider: string; message: string }[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok.push(...r.value);
        else if (!isAbort(r.reason)) bad.push({ provider: targets[i], message: msg(r.reason) });
      });
      setItems(ok);
      setFailed(bad);
      setError(bad.length === targets.length ? bad[0].message : null);
      setLoading(false);
    });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, targetKey, nonce, ...deps]);

  return { items, loading, error, failed, reload: useCallback(() => setNonce((n) => n + 1), []), setItems };
}

export function useRecordings(
  source: RecordingSource,
  provider: string | null,
  providers: RecordingProvider[],
  ready: boolean
) {
  const targets = useMemo(
    () => (provider ? [provider] : providers.map((p) => p.key)),
    [provider, providers]
  );
  const res = useFanOut<RecordingItem>(
    ready,
    targets,
    (p, signal) => recordingBackend(source).list(p, { signal }),
    [source]
  );
  const items = useMemo(
    () => [...res.items].sort((a, b) => (b.recordedAt?.getTime() ?? 0) - (a.recordedAt?.getTime() ?? 0)),
    [res.items]
  );
  return { ...res, items };
}

export function useTimers(
  source: RecordingSource,
  provider: string | null,
  providers: RecordingProvider[],
  includeInactive: boolean,
  ready: boolean
) {
  const targets = useMemo(
    () => (provider ? [provider] : providers.map((p) => p.key)),
    [provider, providers]
  );
  const res = useFanOut<TimerItem>(
    ready,
    targets,
    (p, signal) => recordingBackend(source).timers(p, includeInactive, { signal }),
    [source, includeInactive]
  );
  const items = useMemo(
    () => [...res.items].sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0)),
    [res.items]
  );
  return { ...res, items };
}
