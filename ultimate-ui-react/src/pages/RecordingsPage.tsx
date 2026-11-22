import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRecordingProviders, useRecordings, useTimers } from '@/hooks/useRecordings';
import { getConfig } from '@/lib/api';
import {
  LOCAL_RECORDINGS_ENABLED,
  NotAvailableError,
  recordingBackend,
} from '@/services/recordingsService';
import { RecordingRow } from '@/components/recordings/RecordingRow';
import { TimerRow } from '@/components/recordings/TimerRow';
import { ColumnState } from '@/components/epg/ColumnState';
import { FloatingPlayer, type PlayerState } from '@/components/epg/FloatingPlayer';
import { TimerDialog } from '@/components/recordings/TimerDialog';
import { useToast } from '@/lib/toast';
import { findTimerForRecording } from '@/lib/recordings';
import type { Channel, Program } from '@/lib/types';
import type { RecordingItem, RecordingSource, TimerItem } from '@/lib/recordings';

/** Recordings of the providers (cloud) and their timers; local recordings plug in via the source switch. */
export function RecordingsPage() {
  const { showToast } = useToast();
  const timezone = useMemo(() => getConfig().ui.timezone, []);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'timers' ? 'timers' : 'recordings';
  const source: RecordingSource =
    LOCAL_RECORDINGS_ENABLED && params.get('source') === 'local' ? 'local' : 'cloud';
  const provider = params.get('provider') || null;
  const showInactive = params.get('inactive') === '1';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ channel: Channel; program: Program; timer: TimerItem } | null>(null);

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
  const ready = !providers.loading;
  const recordings = useRecordings(source, provider, providers.providers, ready && view === 'recordings');
  const timers = useTimers(source, provider, providers.providers, showInactive, ready && view === 'timers');

  useEffect(() => {
    const h = () => {
      providers.reload();
      recordings.reload();
      timers.reload();
    };
    window.addEventListener('ultimate:refresh', h);
    return () => window.removeEventListener('ultimate:refresh', h);
  }, [providers.reload, recordings.reload, timers.reload]);

  const labelOf = useCallback(
    (key: string) => providers.providers.find((p) => p.key === key)?.label ?? key,
    [providers.providers]
  );

  const needle = q.trim().toLowerCase();
  const visibleRecordings = useMemo(
    () =>
      needle
        ? recordings.items.filter((r) =>
            [r.title, r.episodeName, r.channelName].some((s) => s?.toLowerCase().includes(needle))
          )
        : recordings.items,
    [recordings.items, needle]
  );

  const play = useCallback(
    async (item: RecordingItem) => {
      setBusyKey(item.key);
      try {
        const target = await recordingBackend(item.source).resolvePlayback(item);
        setPlayer({
          url: target.url,
          drm: target.drm,
          title: item.title,
          subtitle: item.episodeName || item.channelName,
        });
      } catch (e) {
        showToast((e as Error).message, e instanceof NotAvailableError ? 'warning' : 'error');
      } finally {
        setBusyKey(null);
      }
    },
    [showToast]
  );

  /** Update on a not-yet-finished recording: look up its timer and open the timer dialog. */
  const updateRecording = useCallback(
    async (item: RecordingItem) => {
      setBusyKey(item.key);
      try {
        const timers = await recordingBackend(item.source).timers(item.provider, false);
        const timer = findTimerForRecording(timers, item);
        if (!timer || !timer.start || !timer.end) {
          showToast(`Kein passender Timer für „${item.title}“ gefunden`, 'warning');
          return;
        }
        setEditTarget({
          timer,
          channel: {
            id: timer.channelUid ?? '',
            display_name: timer.channelName ?? item.channelName ?? '',
            name: timer.channelName ?? item.channelName ?? '',
            provider: item.provider,
          },
          program: {
            channel_id: timer.channelUid ?? '',
            title: timer.title,
            start_time: timer.start.toISOString(),
            end_time: timer.end.toISOString(),
            epg_event_id: timer.epgEventId,
          },
        });
      } catch (e) {
        showToast((e as Error).message, e instanceof NotAvailableError ? 'warning' : 'error');
      } finally {
        setBusyKey(null);
      }
    },
    [showToast]
  );

  const removeRecording = useCallback(
    async (item: RecordingItem) => {
      if (!window.confirm(`„${item.title}“ endgültig beim Provider löschen?`)) return;
      setBusyKey(item.key);
      try {
        await recordingBackend(item.source).remove(item);
        recordings.setItems((prev) => prev.filter((r) => r.key !== item.key));
        showToast('Aufnahme gelöscht', 'success');
      } catch (e) {
        showToast((e as Error).message, 'error');
      } finally {
        setBusyKey(null);
      }
    },
    [showToast, recordings.setItems]
  );

  const removeTimer = useCallback(
    async (t: TimerItem) => {
      const running = t.state === 'RECORDING';
      const ask = running
        ? `Die laufende Aufnahme „${t.title}“ abbrechen und den Timer löschen?`
        : `Timer „${t.title}“ löschen?`;
      if (!window.confirm(ask)) return;
      setBusyKey(t.key);
      try {
        await recordingBackend(t.source).deleteTimer(t, running);
        timers.setItems((prev) => prev.filter((x) => x.key !== t.key));
        showToast('Timer gelöscht', 'success');
      } catch (e) {
        showToast((e as Error).message, 'error');
      } finally {
        setBusyKey(null);
      }
    },
    [showToast, timers.setItems]
  );

  const isRec = view === 'recordings';
  const active = isRec ? recordings : timers;
  const loading = providers.loading || active.loading;
  const count = isRec ? visibleRecordings.length : timers.items.length;
  const failedHint =
    active.failed.length > 0 && !active.error
      ? `${active.failed.length} Provider ohne Ergebnis: ${active.failed.map((f) => labelOf(f.provider)).join(', ')}`
      : null;

  return (
    <div className="vod-page">
      <div className="vod-toolbar">
        <div className="vod-segment" role="tablist" aria-label="Ansicht">
          {(['recordings', 'timers'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? 'active' : ''}
              onClick={() => setParam('view', v === 'timers' ? 'timers' : null)}
            >
              {v === 'recordings' ? '📼 Aufnahmen' : '⏰ Timer'}
            </button>
          ))}
        </div>

        {LOCAL_RECORDINGS_ENABLED && (
          <div className="vod-segment" role="tablist" aria-label="Quelle">
            {(['cloud', 'local'] as const).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={source === s}
                className={source === s ? 'active' : ''}
                onClick={() => setParam('source', s === 'local' ? 'local' : null)}
              >
                {recordingBackend(s).label}
              </button>
            ))}
          </div>
        )}

        {isRec && (
          <input
            className="vod-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Aufnahmen suchen…"
            aria-label="Suche"
          />
        )}

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

        {!isRec && (
          <label className="vod-check" title="Abgeschlossene, abgebrochene und fehlerhafte Timer mit anzeigen">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setParam('inactive', e.target.checked ? '1' : null)}
            />
            Auch beendete
          </label>
        )}
      </div>

      <div className="vod-scroll">
        {loading ? (
          <div className="rec-list" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton rec-skeleton" />
            ))}
          </div>
        ) : active.error ? (
          <ColumnState
            icon={active.failed.length ? '⚠️' : '📭'}
            title={isRec ? 'Aufnahmen konnten nicht geladen werden' : 'Timer konnten nicht geladen werden'}
            hint={active.error}
            action={
              <button className="btn-date" onClick={active.reload}>
                ↻ Erneut versuchen
              </button>
            }
          />
        ) : count === 0 ? (
          <ColumnState
            icon={isRec ? '📼' : '⏰'}
            title={isRec ? (needle ? 'Kein Treffer' : 'Keine Aufnahmen') : 'Keine Timer'}
            hint={
              isRec
                ? needle
                  ? `Nichts gefunden für „${q.trim()}“.`
                  : 'Aufnahmen entstehen aus Timern – im EPG bei einer Sendung „Aufnehmen“ wählen.'
                : 'Im EPG bei einer Sendung „Aufnehmen“ wählen, um einen Timer anzulegen.'
            }
          />
        ) : (
          <>
            <div className="vod-count">
              {count} {isRec ? 'Aufnahmen' : 'Timer'}
              {failedHint && (
                <span className="rec-failed" title={active.failed.map((f) => `${f.provider}: ${f.message}`).join('\n')}>
                  {' '}
                  · {failedHint}
                </span>
              )}
            </div>
            <ul className="rec-list">
              {isRec
                ? visibleRecordings.map((r) => (
                    <RecordingRow
                      key={r.key}
                      item={r}
                      providerLabel={labelOf(r.provider)}
                      timezone={timezone}
                      busy={busyKey === r.key}
                      onPlay={play}
                      onUpdate={updateRecording}
                      onDelete={removeRecording}
                    />
                  ))
                : timers.items.map((t) => (
                    <TimerRow
                      key={t.key}
                      timer={t}
                      providerLabel={labelOf(t.provider)}
                      timezone={timezone}
                      busy={busyKey === t.key}
                      onDelete={removeTimer}
                    />
                  ))}
            </ul>
          </>
        )}
      </div>

      <FloatingPlayer state={player} onClose={() => setPlayer(null)} />
      <TimerDialog
        channel={editTarget?.channel ?? null}
        program={editTarget?.program ?? null}
        timer={editTarget?.timer ?? null}
        timezone={timezone}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          recordings.reload();
          timers.reload();
        }}
      />
    </div>
  );
}
