import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EPGService } from '@/services/epgService';
import type { Channel, Program } from '@/lib/types';
import { parseProgramTime } from '@/lib/time';
import { programKey } from '@/lib/programKey';

const DAY_MS = 86_400_000;
/** Consecutive empty days after which we assume there is no more data in that direction. */
const EMPTY_STREAK_LIMIT = 3;
/** Hard stop so a backend that returns data forever can't make us scroll forever. */
const MAX_DAYS_PER_DIRECTION = 365;
const LIVE_TICK_MS = 30_000;

export interface Edge {
  loading: boolean;
  /** No more data in this direction. */
  done: boolean;
  error: string | null;
}

interface State {
  programs: Program[];
  /** Start of the earliest loaded chunk / end of the latest (epoch ms). */
  from: number;
  to: number;
  initial: 'loading' | 'ready' | 'error';
  initialError: string | null;
  past: Edge;
  future: Edge;
  /** Bumped whenever content is added above the current content (scroll compensation). */
  prependVersion: number;
}

const idleEdge: Edge = { loading: false, done: false, error: null };

const emptyState = (): State => ({
  programs: [],
  from: 0,
  to: 0,
  initial: 'loading',
  initialError: null,
  past: idleEdge,
  future: idleEdge,
  prependVersion: 0,
});

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function merge(existing: Program[], incoming: Program[]): Program[] {
  const map = new Map<string, Program>();
  for (const p of existing) map.set(programKey(p.channel_id, p), p);
  for (const p of incoming) map.set(programKey(p.channel_id, p), p);
  return [...map.values()].sort(
    (a, b) =>
      (parseProgramTime(a.start_time)?.getTime() ?? 0) -
      (parseProgramTime(b.start_time)?.getTime() ?? 0)
  );
}

/**
 * Programs of one channel as one continuous, bidirectionally extendable list.
 * Data is fetched in whole-day chunks: the anchor day first, then one day at a
 * time in whichever direction the user scrolls.
 */
export function useChannelTimeline(
  service: EPGService,
  channel: Channel | null,
  anchor: Date
) {
  const [state, setState] = useState<State>(emptyState);
  const gen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const streak = useRef({ past: 0, future: 0 });
  const inflight = useRef({ past: false, future: false });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [, setTick] = useState(0);

  const channelId = channel?.id;
  const provider = channel?.provider ?? null;
  const anchorDay = startOfLocalDay(anchor);

  const fetchChunk = useCallback(
    (start: number, signal: AbortSignal) =>
      service.fetchProgramsForChannel(
        channelId as string | number,
        new Date(start),
        new Date(start + DAY_MS),
        provider,
        { signal }
      ),
    [service, channelId, provider]
  );

  const init = useCallback(async () => {
    abortRef.current?.abort();
    const myGen = ++gen.current;
    streak.current = { past: 0, future: 0 };
    inflight.current = { past: false, future: false };
    setState(emptyState());
    if (channelId === undefined) return;

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const programs = await fetchChunk(anchorDay, abort.signal);
      if (myGen !== gen.current) return;
      setState({
        ...emptyState(),
        programs: merge([], programs),
        from: anchorDay,
        to: anchorDay + DAY_MS,
        initial: 'ready',
      });
    } catch (e) {
      if (myGen !== gen.current || abort.signal.aborted) return;
      setState({
        ...emptyState(),
        initial: 'error',
        initialError:
          e instanceof Error && e.message ? e.message : 'Programm konnte nicht geladen werden.',
      });
    }
  }, [channelId, fetchChunk, anchorDay]);

  useEffect(() => {
    init();
    return () => abortRef.current?.abort();
  }, [init]);

  const extend = useCallback(
    async (dir: 'past' | 'future') => {
      const cur = stateRef.current;
      const edge = cur[dir];
      if (cur.initial !== 'ready' || edge.loading || edge.done || inflight.current[dir]) return;

      const start = dir === 'past' ? cur.from - DAY_MS : cur.to;
      if (Math.abs(start - anchorDay) / DAY_MS > MAX_DAYS_PER_DIRECTION) {
        setState((s) => ({ ...s, [dir]: { ...s[dir], done: true } }));
        return;
      }

      const myGen = gen.current;
      const signal = abortRef.current?.signal ?? new AbortController().signal;
      inflight.current[dir] = true;
      setState((s) => ({ ...s, [dir]: { loading: true, done: false, error: null } }));
      try {
        const programs = await fetchChunk(start, signal);
        if (myGen !== gen.current) return;
        inflight.current[dir] = false;
        streak.current[dir] = programs.length === 0 ? streak.current[dir] + 1 : 0;
        const done = streak.current[dir] >= EMPTY_STREAK_LIMIT;
        setState((s) => ({
          ...s,
          programs: programs.length ? merge(s.programs, programs) : s.programs,
          from: dir === 'past' ? start : s.from,
          to: dir === 'future' ? start + DAY_MS : s.to,
          prependVersion:
            dir === 'past' && programs.length ? s.prependVersion + 1 : s.prependVersion,
          [dir]: { loading: false, done, error: null },
        }));
      } catch (e) {
        if (myGen !== gen.current || signal.aborted) return;
        inflight.current[dir] = false;
        setState((s) => ({
          ...s,
          [dir]: {
            loading: false,
            done: false,
            error: e instanceof Error && e.message ? e.message : 'Laden fehlgeschlagen.',
          },
        }));
      }
    },
    [fetchChunk, anchorDay]
  );

  const loadEarlier = useCallback(() => extend('past'), [extend]);
  const loadLater = useCallback(() => extend('future'), [extend]);

  /** Forget volatile data (today/future) and reload around the same anchor. */
  const reload = useCallback(() => {
    service.cache.clearVolatile();
    init();
  }, [service, init]);

  // Keep live/past flags current so the "now" marker moves on its own.
  const livePrograms = state.programs;
  useEffect(() => {
    const t = setInterval(() => {
      let changed = false;
      for (const p of livePrograms) {
        if (service.updateLiveState(p)) changed = true;
      }
      if (changed) setTick((n) => n + 1);
    }, LIVE_TICK_MS);
    return () => clearInterval(t);
  }, [livePrograms, service]);

  const retry = useCallback(
    (dir: 'past' | 'future') => {
      setState((s) => ({ ...s, [dir]: { ...s[dir], error: null } }));
      // extend() reads stateRef; defer one microtask so the cleared error is visible.
      queueMicrotask(() => extend(dir));
    },
    [extend]
  );

  return useMemo(
    () => ({ ...state, loadEarlier, loadLater, reload, retry, init }),
    [state, loadEarlier, loadLater, reload, retry, init]
  );
}
