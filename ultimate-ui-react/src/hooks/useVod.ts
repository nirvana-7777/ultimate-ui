import { useCallback, useEffect, useRef, useState } from 'react';
import { vodService } from '@/services/vodService';
import type { VodItem, VodStatus } from '@/lib/vod';

export const MOVIE_PAGE = 60;

const isAbort = (e: unknown) => (e as any)?.name === 'AbortError';
const msg = (e: unknown) => (e as Error)?.message || 'Unbekannter Fehler';

/** Offset-paginated movies; resets whenever a filter changes. */
export function useVodMovies(opts: { provider: string | null; includePriced: boolean; q: string }) {
  const { provider, includePriced, q } = opts;
  const [items, setItems] = useState<VodItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const count = useRef(0);

  useEffect(() => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    busy.current = true;
    count.current = 0;
    setLoading(true);
    setError(null);
    vodService
      .movies({ provider, includePriced, q, limit: MOVIE_PAGE, offset: 0 }, c.signal)
      .then((p) => {
        setItems(p.items);
        setTotal(p.total);
        count.current = p.items.length;
      })
      .catch((e) => {
        if (isAbort(e)) return;
        setItems([]);
        setTotal(0);
        setError(msg(e));
      })
      .finally(() => {
        if (ctl.current === c) {
          busy.current = false;
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [provider, includePriced, q, nonce]);

  const loadMore = useCallback(() => {
    if (busy.current || count.current >= total || error) return;
    const c = ctl.current;
    if (!c) return;
    busy.current = true;
    setLoadingMore(true);
    vodService
      .movies({ provider, includePriced, q, limit: MOVIE_PAGE, offset: count.current }, c.signal)
      .then((p) => {
        if (ctl.current !== c) return;
        if (p.items.length === 0) {
          setTotal(count.current); // server ran dry: stop asking
          return;
        }
        count.current += p.items.length;
        setItems((prev) => [...prev, ...p.items]);
        setTotal(p.total);
      })
      .catch((e) => !isAbort(e) && setError(msg(e)))
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  }, [provider, includePriced, q, total, error]);

  return {
    items,
    total,
    loading,
    loadingMore,
    error,
    hasMore: items.length < total,
    loadMore,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  };
}

/** The shows endpoint is unpaginated: load once per provider, filter client-side. */
export function useVodShows(provider: string | null, enabled: boolean) {
  const [items, setItems] = useState<VodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    setLoading(true);
    setError(null);
    vodService
      .shows(provider, c.signal)
      .then((p) => setItems(p.items))
      .catch((e) => {
        if (isAbort(e)) return;
        setItems([]);
        setError(msg(e));
      })
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
  }, [provider, enabled, nonce]);

  return { items, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/** Status; polls fast while a sync runs and calls onSyncFinished when it ends. */
export function useVodStatus(onSyncFinished?: () => void) {
  const [status, setStatus] = useState<VodStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const was = useRef(false);
  const cb = useRef(onSyncFinished);
  cb.current = onSyncFinished;
  const running = status?.syncInProgress ?? false;

  useEffect(() => {
    let alive = true;
    const c = new AbortController();
    const load = () =>
      vodService
        .status(c.signal)
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          setError(null);
          if (was.current && !s.syncInProgress) cb.current?.();
          was.current = s.syncInProgress;
        })
        .catch((e) => alive && !isAbort(e) && setError(msg(e)));
    load();
    const t = setInterval(load, running ? 4_000 : 60_000);
    return () => {
      alive = false;
      c.abort();
      clearInterval(t);
    };
  }, [running, nonce]);

  return { status, error, refresh: useCallback(() => setNonce((n) => n + 1), []) };
}
