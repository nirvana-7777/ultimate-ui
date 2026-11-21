import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import type { Channel, Program } from '@/lib/types';
import { cloudRecordings } from '@/services/recordingsService';
import {
  TA,
  typeHas,
  typesForSingleEvent,
  type TimerTypeInfo,
} from '@/lib/recordings';

interface Props {
  /** Open when both are set. */
  channel: Channel | null;
  program: Program | null;
  timezone: string;
  onClose: () => void;
}

const clamp = (v: string, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

/** "Record this EPG event": picks the provider's timer type and creates the timer. */
export function TimerDialog({ channel, program, timezone, onClose }: Props) {
  const { showToast } = useToast();
  const open = !!channel && !!program;
  const provider = channel?.provider ?? '';
  const [types, setTypes] = useState<TimerTypeInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [marginStart, setMarginStart] = useState(0);
  const [marginEnd, setMarginEnd] = useState(0);
  const [priority, setPriority] = useState(50);
  const [lifetime, setLifetime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setTypes(null);
    setLoadError(null);
    setSaveError(null);
    setTypeId(null);
    if (!open || !provider) return;
    const c = new AbortController();
    cloudRecordings
      .timerTypes(provider, { signal: c.signal })
      .then((all) => setTypes(typesForSingleEvent(all, !!program?.epg_event_id)))
      .catch((e) => {
        if ((e as any)?.name !== 'AbortError') setLoadError((e as Error).message);
      });
    return () => c.abort();
  }, [open, provider, program]);

  const type = useMemo(
    () => types?.find((t) => t.id === typeId) ?? types?.[0] ?? null,
    [types, typeId]
  );

  // Pre-fill the form from the type's defaults whenever the type changes.
  useEffect(() => {
    if (!type) return;
    setPriority(type.priorityDefault);
    setLifetime(type.lifetimeDefault);
    setMarginStart(0);
    setMarginEnd(0);
  }, [type]);

  const when = useMemo(() => {
    if (!program) return '';
    const f = (iso: string, o: Intl.DateTimeFormatOptions) =>
      new Date(iso).toLocaleString('de-DE', { timeZone: timezone, ...o });
    return `${f(program.start_time, { weekday: 'short', day: '2-digit', month: '2-digit' })}, ${f(
      program.start_time,
      { hour: '2-digit', minute: '2-digit' }
    )} – ${f(program.end_time, { hour: '2-digit', minute: '2-digit' })}`;
  }, [program, timezone]);

  const submit = async () => {
    if (!channel || !program || !type || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await cloudRecordings.createTimer(provider, {
        type,
        title: program.title,
        channelId: channel.id,
        channelName: channel.display_name,
        start: new Date(program.start_time),
        end: new Date(program.end_time),
        epgEventId: program.epg_event_id,
        epgUid: program.ultimate_epg_id,
        marginStart,
        marginEnd,
        priority,
        lifetime,
      });
      showToast(`Timer für „${program.title}“ angelegt`, 'success');
      onClose();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const loading = open && !types && !loadError;
  const noType = !!types && types.length === 0;

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} maxWidth={520}>
      {channel && program && (
        <>
          <div className="modal-header">
            <h3>⏺ Aufnahme planen</h3>
            <button className="modal-close" onClick={onClose} aria-label="Schließen" disabled={saving}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-body-content timer-dialog">
              <div className="timer-summary">
                <strong>{program.title}</strong>
                <span>
                  {channel.display_name} · {when}
                </span>
                <span className="muted">Provider: {provider || '—'}</span>
              </div>

              {!program.epg_event_id && (
                <p className="muted">
                  Für diese Sendung liefert der EPG keine Event-ID; der Timer wird nach Start- und Endzeit angelegt.
                </p>
              )}
              {loading && <p className="muted">Timer-Typen werden geladen…</p>}
              {loadError && (
                <p className="vod-error">Timer-Typen konnten nicht geladen werden: {loadError}</p>
              )}
              {noType && (
                <p className="vod-error">
                  Dieser Provider bietet keinen Timer-Typ für einzelne Sendungen an.
                </p>
              )}

              {type && (
                <div className="timer-fields">
                  {types!.length > 1 && (
                    <label>
                      Typ
                      <select className="vod-select" value={type.id} onChange={(e) => setTypeId(Number(e.target.value))}>
                        {types!.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.description || `Typ ${t.id}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {typeHas(type, TA.SUPPORTS_PADDING) && (
                    <div className="timer-pair">
                      <label>
                        Vorlauf (min)
                        <input
                          className="vod-select"
                          type="number"
                          min={0}
                          max={240}
                          value={marginStart}
                          onChange={(e) => setMarginStart(clamp(e.target.value, 0, 240))}
                        />
                      </label>
                      <label>
                        Nachlauf (min)
                        <input
                          className="vod-select"
                          type="number"
                          min={0}
                          max={240}
                          value={marginEnd}
                          onChange={(e) => setMarginEnd(clamp(e.target.value, 0, 240))}
                        />
                      </label>
                    </div>
                  )}

                  {typeHas(type, TA.SUPPORTS_PRIORITIES) && (
                    <label>
                      Priorität
                      {type.priorityOptions.length ? (
                        <select className="vod-select" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                          {type.priorityOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.description || o.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="vod-select"
                          type="number"
                          value={priority}
                          onChange={(e) => setPriority(clamp(e.target.value, 0, 100))}
                        />
                      )}
                    </label>
                  )}

                  {typeHas(type, TA.SUPPORTS_LIFETIMES) && (
                    <label>
                      Aufbewahren
                      {type.lifetimeOptions.length ? (
                        <select className="vod-select" value={lifetime} onChange={(e) => setLifetime(Number(e.target.value))}>
                          {type.lifetimeOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.description || `${o.value} Tage`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="vod-select"
                          type="number"
                          min={0}
                          value={lifetime}
                          onChange={(e) => setLifetime(clamp(e.target.value, 0, 3650))}
                          title="Tage, 0 = unbegrenzt"
                        />
                      )}
                    </label>
                  )}
                </div>
              )}

              {saveError && <p className="vod-error">{saveError}</p>}

              <div className="modal-actions">
                <button className="btn-play" onClick={submit} disabled={!type || saving}>
                  {saving ? 'Wird angelegt…' : '⏺ Timer anlegen'}
                </button>
                <button className="btn-reminder" onClick={onClose} disabled={saving}>
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
