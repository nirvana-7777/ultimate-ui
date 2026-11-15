import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EPGService } from '@/services/epgService';
import type { Channel, Program } from '@/lib/types';
import { createLimiter } from '@/lib/limiter';

const CONCURRENCY = 4;
const WINDOW_MS = 6 * 3_600_000;
const TICK_MS = 30_000;

const keyOf = (c: Channel) => `${c.provider ?? ''}|${c.id}`;

/**
 * Lazily resolves "what is on right now" for the channels a list shows.
 * Rows call `request(channel)` when they scroll into view; requests are queued
 * with bounded concurrency so a long channel list never floods the backend.
 */
export function useNowPlaying(service: EPGService) {
  const limit = useMemo(() => createLimiter(CONCURRENCY), []);
  const requested = useRef(new Set<string>());
  const [lists, setLists] = useState<Map<string, Program[]>>(new Map());
  const [, setTick] = useState(0);

  const request = useCallback(
    (channel: Channel) => {
      const key = keyOf(channel);
      if (requested.current.has(key)) return;
      requested.current.add(key);
      limit(async () => {
        const start = new Date();
        start.setSeconds(0, 0);
        const end = new Date(start.getTime() + WINDOW_MS);
        try {
          const programs = await service.fetchProgramsForChannel(
            channel.id,
            start,
            end,
            channel.provider
          );
          setLists((m) => new Map(m).set(key, programs));
        } catch {
          // Allow a retry the next time the row becomes visible.
          requested.current.delete(key);
        }
      });
    },
    [limit, service]
  );

  // Keep live/past state fresh without refetching.
  useEffect(() => {
    const t = setInterval(() => {
      lists.forEach((programs) => programs.forEach((p) => service.updateLiveState(p)));
      setTick((n) => n + 1);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [lists, service]);

  const get = useCallback(
    (channel: Channel): Program | null =>
      lists.get(keyOf(channel))?.find((p) => p.is_live) ?? null,
    [lists]
  );

  return { request, get };
}
