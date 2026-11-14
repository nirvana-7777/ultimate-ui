import { useEffect, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useEPG } from '@/hooks/useEPG';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ChannelCard } from '@/components/epg/ChannelCard';
import { ChannelCardSkeleton } from '@/components/epg/ChannelCardSkeleton';
import { DailyProgramList } from '@/components/epg/DailyProgramList';
import { DateNavigation } from '@/components/epg/DateNavigation';
import { ProviderFilter } from '@/components/epg/ProviderFilter';
import { EmptyState } from '@/components/epg/EmptyState';
import { ProgramDetailsModal } from '@/components/epg/ProgramDetailsModal';
import { FloatingPlayer, PlayerState } from '@/components/epg/FloatingPlayer';
import { ErrorBanner } from '@/components/epg/ErrorBanner';
import { useToast } from '@/lib/toast';
import { getConfig } from '@/lib/api';
import { programKey } from '@/lib/programKey';
import { describeCatchupError } from '@/lib/catchup';
import type { Channel, Program } from '@/lib/types';

export function EPGPage() {
  const [activeProvider, setActiveProvider] = useState('');
  const { service, data, providers, currentDate, setCurrentDate, loadMore, refresh } =
    useEPG(activeProvider || null);
  const { showToast } = useToast();
  const publicUrlConfigured = !!getConfig().ultimate_backend.public_url;

  const [dailyChannel, setDailyChannel] = useState<Channel | null>(null);
  const [fetchResult, setFetchResult] = useState<{
    channelId: string;
    programs: Program[];
  } | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);

  const sentinelRef = useInfiniteScroll(loadMore, {
    enabled:
      data.hasMore && !data.isLoading && !activeProvider && !data.paginationBlocked,
  });

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('ultimate:refresh', handler);
    return () => window.removeEventListener('ultimate:refresh', handler);
  }, [refresh]);

  // Close the daily panel when the date changes so the grid shows the new day.
  useEffect(() => {
    setDailyChannel(null);
    setFetchResult(null);
  }, [currentDate]);

  // Derive daily programs so live-state updates reach the daily view.
  const dailyPrograms = useMemo(() => {
    if (!dailyChannel) return [];
    const live = data.dailyPrograms.get(String(dailyChannel.id));
    if (live) return live;
    if (fetchResult && fetchResult.channelId === String(dailyChannel.id)) {
      return fetchResult.programs;
    }
    return [];
  }, [dailyChannel, data.dailyPrograms, fetchResult]);

  const handleExpand = useCallback(
    async (channelId: string | number) => {
      const ch = service.getChannel(channelId);
      if (!ch) return;
      const isToday = new Date().toDateString() === currentDate.toDateString();
      const needsFullDay = isToday && ch.catchup?.enabled;

      if (isToday && !needsFullDay) {
        const programs = data.dailyPrograms.get(String(channelId)) || [];
        if (programs.length === 0) {
          showToast('Kein Tagesprogramm verfügbar', 'warning');
          return;
        }
        setDailyChannel(ch);
        return;
      }

      try {
        const programs = await service.loadDailyProgramsForChannel(
          channelId,
          currentDate
        );
        if (!programs || programs.length === 0) {
          showToast(
            isToday
              ? 'Kein Tagesprogramm verfügbar'
              : 'Keine Programme für diesen Tag',
            'warning'
          );
          return;
        }
        setFetchResult({ channelId: String(channelId), programs });
        setDailyChannel(ch);
      } catch (e: any) {
        showToast(`Programm konnte nicht geladen werden: ${e.message}`, 'error');
      }
    },
    [service, currentDate, data.dailyPrograms, showToast]
  );

  const handlePlayProgram = useCallback(
    (channelId: string | number, pk: string) => {
      const program = service.getProgram(channelId, pk);
      if (!program) {
        showToast('Programm nicht gefunden', 'error');
        return;
      }
      const url = program.stream_url || program.stream;
      if (!url) {
        showToast('Kein Stream verfügbar', 'warning');
        return;
      }
      setPlayer({ url, title: program.title, subtitle: program.subtitle });
    },
    [service, showToast]
  );

  const handlePlayChannel = useCallback(
    (channelId: string | number) => {
      const ch = service.getChannel(channelId);
      if (!ch) return;
      const url = (ch as any).StreamUrl || ch.streamUrl;
      if (!url) {
        showToast('Kein Stream verfügbar', 'warning');
        return;
      }
      setPlayer({ url, title: ch.display_name, subtitle: 'Live Stream' });
    },
    [service, showToast]
  );

  const handleCatchup = useCallback(
    async (channel: Channel, program: Program) => {
      const url = await service.buildCatchupStreamUrl(channel, program);
      if (!url) {
        showToast('Catchup für diese Sendung nicht mehr verfügbar', 'warning');
        return;
      }

      // HEAD pre-flight: no body download, backend still validates.
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8000);

      try {
        const resp = await fetch(url, {
          method: 'HEAD',
          credentials: 'omit',
          signal: controller.signal,
        });
        if (!resp.ok) {
          let errText = '';
          try {
            errText = String((await resp.json())?.error || '');
          } catch {}
          showToast(describeCatchupError(errText), 'warning');
          return;
        }
        setPlayer({
          url,
          title: program.title,
          subtitle: `Catchup · ${program.start_time_local}`,
        });
      } catch {
        showToast(
          timedOut
            ? 'Catchup-Anfrage hat zu lange gedauert'
            : 'Catchup-Verbindung fehlgeschlagen',
          'error'
        );
      } finally {
        clearTimeout(timer);
      }
    },
    [service, showToast]
  );

  const handleDownload = useCallback(
    async (channel: Channel, program: Program) => {
      const start = new Date(program.start_time);
      const end = new Date(program.end_time);
      const filename = `${channel.display_name}_${program.title}`.replace(
        /[^A-Za-z0-9._-]+/g,
        '_'
      );
      const params = new URLSearchParams({
        provider: channel.provider || '',
        channel: String(channel.id),
        start: String(Math.floor(start.getTime() / 1000)),
        end: String(Math.floor(end.getTime() / 1000)),
        filename,
      });
      const dlUrl = `/api/proxy/catchup/download?${params}`;
      try {
        const head = await fetch(dlUrl, { method: 'HEAD' });
        if (!head.ok) {
          const msg =
            head.status === 503
              ? 'Download für diesen Kanal nicht verfügbar'
              : head.status === 400
              ? 'Ungültige Download-Anfrage'
              : 'Download nicht verfügbar';
          showToast(msg, 'warning');
          return;
        }
        window.location.href = dlUrl;
      } catch {
        showToast('Download-Verbindung fehlgeschlagen', 'error');
      }
    },
    [showToast]
  );

  const handlePrev = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };
  const handleNext = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };
  const handleToday = () => setCurrentDate(new Date());

  const isProviderMode = !!activeProvider;
  // All error kinds trigger a full reload — the retry button only needs to
  // know *that* the user asked, not which kind. Simplify to a single action.
  const errorRetry = refresh;

  return (
    <div className="epg-container">
      <div className="date-navigation">
        <h2>EPG Programmübersicht</h2>
        <ProviderFilter
          providers={providers}
          value={activeProvider}
          onChange={setActiveProvider}
        />
        <DateNavigation
          date={currentDate}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
        />
      </div>

      {data.error && <ErrorBanner message={data.error.message} onRetry={errorRetry} />}

      <AnimatePresence mode="wait">
        {dailyChannel ? (
          <motion.div
            key="daily"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DailyProgramList
              channel={dailyChannel}
              programs={dailyPrograms}
              service={service}
              publicUrlConfigured={publicUrlConfigured}
              onClose={() => {
                setDailyChannel(null);
                setFetchResult(null);
              }}
              onPlay={(p) =>
                handlePlayProgram(p.channel_id, programKey(p.channel_id, p))
              }
              onCatchup={(p) => handleCatchup(dailyChannel, p)}
              onDownload={(p) => handleDownload(dailyChannel, p)}
              onDetails={setSelectedProgram}
            />
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            className="current-events-grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {data.isLoading && data.channels.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <ChannelCardSkeleton key={i} />
              ))
            ) : data.channels.length === 0 ? (
              data.error ? null : (
                <EmptyState
                  message={
                    activeProvider
                      ? 'Dieser Provider hat keine Kanäle oder keine EPG-Daten.'
                      : 'Keine Kanäle verfügbar.'
                  }
                />
              )
            ) : (
              <>
                {data.channels.map((channel) => {
                  const channelId = (channel as any).Id ?? channel.id;
                  const program =
                    data.currentEvents.get(String(channelId)) || null;
                  return (
                    <ChannelCard
                      key={String(channelId)}
                      channel={channel}
                      program={program}
                      isProviderChannel={
                        isProviderMode && !!(channel as any).StreamUrl
                      }
                      onPlayProgram={handlePlayProgram}
                      onPlayChannel={handlePlayChannel}
                      onExpand={handleExpand}
                    />
                  );
                })}
                {!isProviderMode && !data.paginationBlocked && (
                  <div ref={sentinelRef} style={{ height: 1 }} />
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ProgramDetailsModal
        program={selectedProgram}
        onClose={() => setSelectedProgram(null)}
        onPlay={() => {
          if (selectedProgram) {
            const pk = programKey(selectedProgram.channel_id, selectedProgram);
            handlePlayProgram(selectedProgram.channel_id, pk);
            setSelectedProgram(null);
          }
        }}
        onReminder={() => showToast('Erinnerung gesetzt', 'success')}
      />

      <FloatingPlayer state={player} onClose={() => setPlayer(null)} />
    </div>
  );
}
