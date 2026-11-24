import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRecordingProviders } from '@/hooks/useRecordings';
import { useEvents } from '@/hooks/useEvents';
import { getConfig } from '@/lib/api';
import { compareEvents, eventState, type EventItem } from '@/lib/events';
import { resolveEventPlayback } from '@/services/eventsService';
import { EventRow } from '@/components/events/EventRow';
import { ColumnState } from '@/components/epg/ColumnState';
import { FloatingPlayer, type PlayerState } from '@/components/epg/FloatingPlayer';
import { useToast } from '@/lib/toast';

type Filter = 'all' | 'live' | 'upcoming';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'live', label: '🔴 Live' },
  { key: 'upcoming', label: '🕒 Geplant' },
];

/** Events (sports, concerts, ...) of all providers or of one provider. */
export function EventsPage() {
  const { showToast } = useToast();
  const timezone = useMemo(() => getConfig().ui.timezone, []);
  const [params, setParams] = useSearchParams();
  const filter: Filter = params.get('filter') === 'live' ? 'live' : params.get('filter') === 'upcoming' ? 'upcoming' : 'all';
  const provider = params.get('provider') || null;
  const [q, setQ] = useState(params.get('q') ?? '');
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Status is derived from start/end, so tick now and then (an event can go live while the page is open).
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  useEffect(() => {
    const t = setTimeout(() => setParam('q', q.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const providers = useRecordingProviders();
  const events = useEvents(provider, providers.providers, !providers.loading);

  useEffect(() => {
    const h = () => {
      providers.reload();
      events.reload();
    };
    window.addEventListener('ultimate:refresh', h);
    return () => window.removeEventListener('ultimate:refresh', h);
  }, [providers.reload, events.reload]);

  const labelOf = useCallback(
    (key: string) => providers.providers.find((p) => p.key === key)?.label ?? key,
    [providers.providers]
  );

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    return [...events.items]
      .sort((a, b) => compareEvents(a, b, nowMs))
      .map((item) => ({ item, state: eventState(item, nowMs) }))
      .filter(({ item, state }) => {
        if (filter === 'live' && state !== 'live') return false;
        if (filter === 'upcoming' && state !== 'upcoming') return false;
        if (!needle) return true;
        return [item.title, item.subtitle, item.channel, item.competition, item.discipline, item.venue, item.masterEvent].some(
          (s) => s?.toLowerCase().includes(needle)
        );
      });
  }, [events.items, nowMs, filter, needle]);

  const play = useCallback(
    async (item: EventItem) => {
      setBusyKey(item.key);
      try {
        const target = await resolveEventPlayback(item);
        setPlayer({
          url: target.url,
          drm: target.drm,
          title: item.title,
          subtitle: item.subtitle || item.channel,
        });
      } catch (e) {
        showToast((e as Error).message, 'error');
      } finally {
        setBusyKey(null);
      }
    },
    [showToast]
  );

  const loading = providers.loading || events.loading;
  const failedHint =
    events.failed.length > 0 && !events.error
      ? `${events.failed.length} Provider ohne Ergebnis: ${events.failed.map((f) => labelOf(f.provider)).join(', ')}`
      : null;
  const filtered = filter !== 'all' || !!needle;

  return (
    <div className="vod-page">
      <div className="vod-toolbar">
        <div className="vod-segment" role="tablist" aria-label="Status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              className={filter === f.key ? 'active' : ''}
              onClick={() => setParam('filter', f.key === 'all' ? null : f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          className="vod-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Events suchen…"
          aria-label="Suche"
        />

        <select
          className="vod-select"
          value={provider ?? ''}
          onChange={(e) => setParam('provider', e.target.value || null)}
          aria-label="Provider"
        >
          <option value="">Alle Provider</option>
          {providers.providers.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="vod-scroll">
        {loading ? (
          <div className="rec-list" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton rec-skeleton" />
            ))}
          </div>
        ) : events.error ? (
          <ColumnState
            icon={events.failed.length ? '⚠️' : '📭'}
            title="Events konnten nicht geladen werden"
            hint={events.error}
            action={
              <button className="btn-date" onClick={events.reload}>
                ↻ Erneut versuchen
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <ColumnState
            icon="🏟️"
            title={filtered ? 'Kein Treffer' : 'Keine Events'}
            hint={
              filtered
                ? needle
                  ? `Nichts gefunden für „${q.trim()}“.`
                  : 'Mit diesem Filter gibt es keine Events.'
                : provider
                ? 'Dieser Provider liefert aktuell keine Events.'
                : 'Aktuell liefert kein Provider Events.'
            }
          />
        ) : (
          <>
            <div className="vod-count">
              {rows.length} Events
              {failedHint && (
                <span className="rec-failed" title={events.failed.map((f) => `${f.provider}: ${f.message}`).join('\n')}>
                  {' '}
                  · {failedHint}
                </span>
              )}
            </div>
            <ul className="rec-list">
              {rows.map(({ item, state }) => (
                <EventRow
                  key={item.key}
                  item={item}
                  state={state}
                  providerLabel={labelOf(item.provider)}
                  timezone={timezone}
                  busy={busyKey === item.key}
                  onPlay={play}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <FloatingPlayer state={player} onClose={() => setPlayer(null)} />
    </div>
  );
}
