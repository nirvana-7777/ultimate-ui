import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { EPGService } from '@/services/epgService';
import type { Channel, Program, EPGError } from '@/lib/types';
import { getConfig } from '@/lib/api';
import { isSameDay } from '@/lib/time';

export interface EPGData {
  channels: Channel[];
  currentEvents: Map<string, Program>;
  dailyPrograms: Map<string, Program[]>;
  hasMore: boolean;
  isLoading: boolean;
  /** Set when the channel list, all program requests, or pagination failed. */
  error: EPGError | null;
  /** Set after a pagination failure; reset on retry. */
  paginationBlocked: boolean;
}

const CONCURRENCY = 8;
const LIVE_TICK_MS = 30_000;
const MIN_REFRESH_SECONDS = 30;

type EventMap = Map<string, Program>;
type DailyMap = Map<string, Program[]>;

/**
 * Bounded-concurrency worker pool. Never rejects: individual worker errors
 * are logged and counted by the caller's own try/catch.
 */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  isStale: () => boolean
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!isStale()) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        await worker(items[idx]);
      } catch (e) {
        console.warn(`[runPool] worker failed for item ${idx}:`, e);
      }
    }
  });
  await Promise.all(lanes);
}

function windowFor(date: Date) {
  const today = isSameDay(date, new Date());
  if (today) {
    const now = new Date();
    now.setSeconds(0, 0);
    return { today, start: now, end: new Date(now.getTime() + 86400000) };
  }
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { today, start, end };
}

export function useEPG(activeProvider: string | null) {
  const serviceRef = useRef<EPGService>();
  if (!serviceRef.current) {
    const cfg = getConfig();
    serviceRef.current = new EPGService({
      timezone: cfg.ui.timezone,
      catchupMaxHours: cfg.catchup.max_hours,
      ultimateBackendPublicUrl: cfg.ultimate_backend.public_url,
    });
  }
  const service = serviceRef.current;

  const [data, setData] = useState<EPGData>({
    channels: [],
    currentEvents: new Map(),
    dailyPrograms: new Map(),
    hasMore: true,
    isLoading: true,
    error: null,
    paginationBlocked: false,
  });
  const dataRef = useRef(data);
  dataRef.current = data;

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [providers, setProviders] = useState<any[]>([]);

  const providerChannelsRef = useRef<Channel[]>([]);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastLoad = useRef(Date.now());

  const fetchInto = useCallback(
    async (
      channels: Channel[],
      date: Date,
      currentEvents: EventMap,
      dailyPrograms: DailyMap,
      isStale: () => boolean,
      signal: AbortSignal,
      fallback?: { currentEvents: EventMap; dailyPrograms: DailyMap }
    ): Promise<number> => {
      const { today, start, end } = windowFor(date);
      let failed = 0;
      await runPool(
        channels,
        CONCURRENCY,
        async (channel) => {
          if (isStale()) return;
          const channelId = (channel as any).Id ?? channel.id;
          const key = String(channelId);
          const provider = (channel as any).provider ?? null;
          try {
            const programs = await service.fetchProgramsForChannel(
              channelId,
              start,
              end,
              provider,
              { signal }
            );
            const shown = today ? programs.find((p) => p.is_live) : programs[0];
            if (shown) currentEvents.set(key, shown);
            dailyPrograms.set(key, programs);
          } catch (e) {
            if (signal.aborted) return;
            failed++;
            const prevEvent = fallback?.currentEvents.get(key);
            const prevDaily = fallback?.dailyPrograms.get(key);
            if (prevEvent) currentEvents.set(key, prevEvent);
            if (prevDaily) dailyPrograms.set(key, prevDaily);
          }
        },
        isStale
      );
      return failed;
    },
    [service]
  );

  const loadData = useCallback(
    async (date: Date) => {
      // Cancel any in-flight load
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const id = ++requestId.current;
      const isStale = () => id !== requestId.current || abort.signal.aborted;

      setData((d) => ({ ...d, isLoading: true, error: null }));
      service.cache.clearVolatile();

      try {
        let channels: Channel[] = [];
        let hasMore = false;

        if (activeProvider) {
          if (providerChannelsRef.current.length === 0) {
            providerChannelsRef.current = await service.loadProviderChannels(
              activeProvider
            );
          }
          channels = providerChannelsRef.current;
        } else {
          const result = await service.fetchChannels(0);
          channels = result.channels;
          hasMore = result.hasMore;
        }
        if (isStale()) return;

        const currentEvents: EventMap = new Map();
        const dailyPrograms: DailyMap = new Map();
        const failed = await fetchInto(
          channels,
          date,
          currentEvents,
          dailyPrograms,
          isStale,
          abort.signal
        );
        if (isStale()) return;

        lastLoad.current = Date.now();
        setData({
          channels,
          currentEvents,
          dailyPrograms,
          hasMore,
          isLoading: false,
          error:
            channels.length > 0 && failed === channels.length
              ? { kind: 'programs', message: 'Programmdaten konnten nicht geladen werden.' }
              : null,
          paginationBlocked: false,
        });
      } catch (e) {
        if (isStale() || abort.signal.aborted) return;
        setData({
          channels: [],
          currentEvents: new Map(),
          dailyPrograms: new Map(),
          hasMore: false,
          isLoading: false,
          error: {
            kind: 'channels',
            message:
              e instanceof Error && e.message
                ? e.message
                : 'Backend nicht erreichbar.',
          },
          paginationBlocked: false,
        });
      }
    },
    [activeProvider, service, fetchInto]
  );

  const loadMore = useCallback(async () => {
    const current = dataRef.current;
    if (
      !current.hasMore ||
      current.isLoading ||
      current.paginationBlocked ||
      activeProvider
    )
      return;
    const id = requestId.current;
    const isStale = () => id !== requestId.current;

    setData((d) => ({ ...d, isLoading: true }));
    try {
      const page = Math.floor(current.channels.length / service.config.itemsPerPage);
      const result = await service.fetchChannels(page);
      if (isStale()) return;

      const abort = abortRef.current;
      const signal = abort?.signal ?? new AbortController().signal;

      const currentEvents: EventMap = new Map(current.currentEvents);
      const dailyPrograms: DailyMap = new Map(current.dailyPrograms);
      await fetchInto(
        result.channels,
        currentDate,
        currentEvents,
        dailyPrograms,
        isStale,
        signal
      );
      if (isStale()) return;

      setData((d) => ({
        ...d,
        channels: [...d.channels, ...result.channels],
        currentEvents,
        dailyPrograms,
        hasMore: result.hasMore,
        isLoading: false,
        paginationBlocked: false,
      }));
    } catch (e) {
      if (isStale()) return;
      // paginationBlocked stops the sentinel from retrying in a loop;
      // the banner's Retry button calls refresh() which does a full reload.
      setData((d) => ({
        ...d,
        isLoading: false,
        paginationBlocked: true,
        error: {
          kind: 'pagination',
          message:
            e instanceof Error && e.message
              ? e.message
              : 'Weitere Kanäle konnten nicht geladen werden.',
        },
      }));
    }
  }, [activeProvider, service, currentDate, fetchInto]);

  const refreshPrograms = useCallback(async () => {
    const current = dataRef.current;
    if (current.isLoading || current.channels.length === 0) return;
    const id = requestId.current;
    const isStale = () => id !== requestId.current;

    const abort = new AbortController();
    service.cache.clearVolatile();
    const currentEvents: EventMap = new Map();
    const dailyPrograms: DailyMap = new Map();
    const failed = await fetchInto(
      current.channels,
      currentDate,
      currentEvents,
      dailyPrograms,
      isStale,
      abort.signal,
      {
        currentEvents: current.currentEvents,
        dailyPrograms: current.dailyPrograms,
      }
    );
    if (isStale() || failed === current.channels.length) return;

    lastLoad.current = Date.now();
    setData((d) => ({
      ...d,
      currentEvents,
      dailyPrograms,
      // Only clear an existing error when every request succeeded.
      error: failed === 0 ? null : d.error,
    }));
  }, [service, currentDate, fetchInto]);

  const tickLive = useCallback(() => {
    if (!isSameDay(currentDate, new Date())) return;
    setData((d) => {
      let changed = false;
      const currentEvents: EventMap = new Map(d.currentEvents);
      d.dailyPrograms.forEach((programs, key) => {
        for (const p of programs) {
          if (service.updateLiveState(p)) changed = true;
        }
        const live = programs.find((p) => p.is_live);
        const prev = currentEvents.get(key);
        if (live !== prev) {
          if (live) currentEvents.set(key, live);
          else currentEvents.delete(key);
          changed = true;
        }
      });
      return changed ? { ...d, currentEvents } : d;
    });
  }, [service, currentDate]);

  useEffect(() => {
    service.loadProviders().then(setProviders);
  }, [service]);

  useEffect(() => {
    providerChannelsRef.current = [];
  }, [activeProvider]);

  useEffect(() => {
    loadData(currentDate);
    return () => {
      abortRef.current?.abort();
    };
  }, [loadData, currentDate]);

  useEffect(() => {
    const t = setInterval(tickLive, LIVE_TICK_MS);
    return () => clearInterval(t);
  }, [tickLive]);

  const refreshSeconds = useMemo(
    () => Number(getConfig().ui.refresh_interval) || 0,
    []
  );

  useEffect(() => {
    if (refreshSeconds <= 0 || !isSameDay(currentDate, new Date())) return;
    const interval = Math.max(refreshSeconds, MIN_REFRESH_SECONDS) * 1000;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refreshPrograms();
    }, interval);
    return () => clearInterval(t);
  }, [refreshPrograms, refreshSeconds, currentDate]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      tickLive();
      if (
        refreshSeconds > 0 &&
        Date.now() - lastLoad.current >
          Math.max(refreshSeconds, MIN_REFRESH_SECONDS) * 1000
      ) {
        refreshPrograms();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [tickLive, refreshPrograms, refreshSeconds]);

  const refresh = useCallback(() => loadData(currentDate), [loadData, currentDate]);

  return {
    service,
    data,
    providers,
    currentDate,
    setCurrentDate,
    loadMore,
    refresh,
  };
}
