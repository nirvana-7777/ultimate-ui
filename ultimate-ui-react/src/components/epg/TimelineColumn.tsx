import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Channel, Program } from '@/lib/types';
import type { EPGService } from '@/services/epgService';
import { useChannelTimeline, type Edge } from '@/hooks/useChannelTimeline';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { dayKeyInTz, formatDayHeader, localDateKey, parseProgramTime } from '@/lib/time';
import { programKey } from '@/lib/programKey';
import { isCatchupEligible } from '@/lib/catchup';
import { ChannelLogo } from './ChannelLogo';
import { ColumnState, ListSkeleton } from './ColumnState';
import { ProgramRow, type ProgramActions } from './ProgramRow';

interface Props extends ProgramActions {
  service: EPGService;
  channel: Channel | null;
  anchor: Date;
  timezone: string;
  publicUrlConfigured: boolean;
  onJump: (date: Date) => void;
  onBack: () => void;
  /** Existing timer for a programme (undefined = none). */
  hasTimer?: (program: Program) => boolean;
  timerBusy?: boolean;
}

interface DayGroup {
  key: string;
  date: Date;
  programs: Program[];
}

const EDGE_MARGIN = '400px';

/**
 * Third column: the selected channel's programs as one continuous list with
 * inline day headers. Scrolls without limit into the past and the future
 * (data is fetched a day at a time). The selected program expands in place.
 *
 * The parent keys this component by channel + anchor day, so all state
 * (selection, scroll position, loaded range) resets cleanly on change.
 */
export function TimelineColumn({
  service,
  channel,
  anchor,
  timezone,
  publicUrlConfigured,
  onJump,
  onBack,
  onPlay,
  onCatchup,
  onDownload,
  onRecord,
  onUpdateTimer,
  onDeleteTimer,
  hasTimer,
  timerBusy,
}: Props) {
  const tl = useChannelTimeline(service, channel, anchor);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [positioned, setPositioned] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const now = new Date();

  const days = useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const p of tl.programs) {
      const start = parseProgramTime(p.start_time);
      if (!start) continue;
      const key = dayKeyInTz(start, timezone);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.programs.push(p);
      else groups.push({ key, date: start, programs: [p] });
    }
    return groups;
  }, [tl.programs, timezone]);

  // --- scroll management --------------------------------------------------
  // 1) once the first chunk is rendered, jump to "now" (or the anchor day)
  // 2) when days are prepended, keep what the user is looking at in place
  const lastHeight = useRef(0);
  const lastPrepend = useRef(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (!positioned && tl.initial !== 'loading') {
      if (tl.initial === 'ready') {
        const target =
          el.querySelector<HTMLElement>('[data-live="true"]') ??
          el.querySelector<HTMLElement>(`[data-day="${dayKeyInTz(anchor, timezone)}"]`);
        if (target) {
          const offset =
            target.getBoundingClientRect().top - el.getBoundingClientRect().top;
          el.scrollTop += offset - el.clientHeight * 0.25;
        }
      }
      setPositioned(true);
    } else if (tl.prependVersion !== lastPrepend.current) {
      el.scrollTop += el.scrollHeight - lastHeight.current;
    }
    lastPrepend.current = tl.prependVersion;
    lastHeight.current = el.scrollHeight;
  });

  const topRef = useInfiniteScroll(tl.loadEarlier, {
    enabled: positioned && tl.initial === 'ready' && !tl.past.loading && !tl.past.done && !tl.past.error,
    rootMargin: EDGE_MARGIN,
    rootRef: scrollRef,
  });
  const bottomRef = useInfiniteScroll(tl.loadLater, {
    enabled: positioned && tl.initial === 'ready' && !tl.future.loading && !tl.future.done && !tl.future.error,
    rootMargin: EDGE_MARGIN,
    rootRef: scrollRef,
  });

  // --- selection ------------------------------------------------------------
  const toggle = useCallback((key: string) => {
    setSelected((cur) => (cur === key ? null : key));
  }, []);

  useEffect(() => {
    if (!selected) return;
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-key="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  // --- header actions ------------------------------------------------------
  const jumpToNow = () => {
    const live = scrollRef.current?.querySelector<HTMLElement>('[data-live="true"]');
    if (live) {
      live.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      onJump(new Date());
    }
  };

  if (!channel) {
    return (
      <section className="epg-col epg-col-timeline" aria-label="Programm">
        <header className="epg-col-header">
          <button className="epg-back" onClick={onBack} aria-label="Zurück zu Kanälen">
            ←
          </button>
          <h2>Programm</h2>
        </header>
        <div className="epg-col-scroll">
          <ColumnState icon="📺" title="Kanal wählen" hint="Das Programm läuft fortlaufend von der Vergangenheit bis in die Zukunft." />
        </div>
      </section>
    );
  }

  const isEmpty = tl.programs.length === 0 && tl.past.done && tl.future.done;

  return (
    <section className="epg-col epg-col-timeline" aria-label={`Programm ${channel.display_name}`}>
      <header className="epg-col-header timeline-header">
        <button className="epg-back" onClick={onBack} aria-label="Zurück zu Kanälen">
          ←
        </button>
        <ChannelLogo name={channel.display_name} url={channel.icon_url} size={32} />
        <h2 title={channel.display_name}>{channel.display_name}</h2>
        <div className="timeline-tools">
          <input
            type="date"
            className="timeline-date"
            value={localDateKey(anchor)}
            onChange={(e) => {
              if (!e.target.value) return;
              const [y, m, d] = e.target.value.split('-').map(Number);
              onJump(new Date(y, m - 1, d));
            }}
            aria-label="Zu Datum springen"
          />
          <button className="btn-date" onClick={jumpToNow}>
            Jetzt
          </button>
          <button className="btn-refresh" onClick={tl.reload} title="Neu laden" aria-label="Programm neu laden">
            🔄
          </button>
        </div>
      </header>

      <div className="epg-col-scroll timeline-scroll" ref={scrollRef}>
        {tl.initial === 'loading' ? (
          <ListSkeleton rows={10} />
        ) : tl.initial === 'error' ? (
          <ColumnState
            icon="⚠️"
            title="Programm konnte nicht geladen werden"
            hint={tl.initialError ?? undefined}
            action={
              <button className="btn-date" onClick={tl.init}>
                ↻ Erneut versuchen
              </button>
            }
          />
        ) : (
          <>
            <EdgeStatus edge={tl.past} side="top" sentinelRef={topRef} onRetry={() => tl.retry('past')} />
            {isEmpty ? (
              <ColumnState icon="📭" title="Keine Programmdaten" hint="Für diesen Kanal liegt kein EPG vor." />
            ) : (
              days.map((day) => {
                const h = formatDayHeader(day.date, timezone, now);
                return (
                  <div className="tl-day-group" key={day.key} data-day={day.key}>
                    <h3 className={`tl-day-header ${h.relative ?? ''}`}>
                      <span className="tl-day-label">{h.label}</span>
                      <span className="tl-day-full">{h.full}</span>
                    </h3>
                    <ul className="tl-list">
                      {day.programs.map((p) => {
                        const key = programKey(p.channel_id, p);
                        return (
                          <ProgramRow
                            key={key}
                            rowKey={key}
                            channel={channel}
                            program={p}
                            live={!!p.is_live}
                            past={!!p.is_past}
                            catchupEligible={isCatchupEligible(p, channel, now)}
                            publicUrlConfigured={publicUrlConfigured}
                            selected={selected === key}
                            hasTimer={!!hasTimer?.(p)}
                            timerBusy={timerBusy}
                            onToggle={toggle}
                            onPlay={onPlay}
                            onCatchup={onCatchup}
                            onDownload={onDownload}
                            onRecord={onRecord}
                            onUpdateTimer={onUpdateTimer}
                            onDeleteTimer={onDeleteTimer}
                          />
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
            <EdgeStatus edge={tl.future} side="bottom" sentinelRef={bottomRef} onRetry={() => tl.retry('future')} />
          </>
        )}
      </div>
    </section>
  );
}

function EdgeStatus({
  edge,
  side,
  sentinelRef,
  onRetry,
}: {
  edge: Edge;
  side: 'top' | 'bottom';
  sentinelRef: RefObject<HTMLDivElement>;
  onRetry: () => void;
}) {
  return (
    <div className={`tl-edge ${side}`}>
      <div ref={sentinelRef} className="tl-sentinel" />
      {edge.loading && (
        <span className="tl-edge-msg">
          <span className="spinner" aria-hidden="true" />
          {side === 'top' ? 'Lädt frühere Programme…' : 'Lädt weitere Programme…'}
        </span>
      )}
      {edge.done && (
        <span className="tl-edge-msg muted">
          {side === 'top' ? 'Älteste verfügbare Sendung' : 'Ende des verfügbaren Programms'}
        </span>
      )}
      {edge.error && (
        <span className="tl-edge-msg error">
          {edge.error}{' '}
          <button className="btn-date" onClick={onRetry}>
            ↻
          </button>
        </span>
      )}
    </div>
  );
}
