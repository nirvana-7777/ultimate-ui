import { memo } from 'react';
import {
  TIMER_STATE_LABEL,
  timerStateTone,
  weekdayLabel,
  type TimerItem,
} from '@/lib/recordings';

interface Props {
  timer: TimerItem;
  providerLabel: string;
  timezone: string;
  busy: boolean;
  onDelete: (timer: TimerItem) => void;
}

const fmt = (d: Date | undefined, timezone: string, opts: Intl.DateTimeFormatOptions) =>
  d?.toLocaleString('de-DE', { timeZone: timezone, ...opts });

export const TimerRow = memo(function TimerRow({ timer, providerLabel, timezone, busy, onDelete }: Props) {
  const date = fmt(timer.start, timezone, { weekday: 'short', day: '2-digit', month: '2-digit' });
  const from = fmt(timer.start, timezone, { hour: '2-digit', minute: '2-digit' });
  const to = fmt(timer.end, timezone, { hour: '2-digit', minute: '2-digit' });
  const when = timer.repeating
    ? [weekdayLabel(timer.weekdays), from && to ? `${from} – ${to}` : from].filter(Boolean).join(' · ')
    : [date, from && to ? `${from} – ${to}` : from].filter(Boolean).join(' · ');
  const meta = [timer.channelName, when, timer.epgSearch && `Suche: „${timer.epgSearch}“`].filter(Boolean);

  return (
    <li className="rec-row">
      <div className="rec-thumb rec-thumb-timer" aria-hidden="true">
        <span>{timer.repeating ? '🔁' : '⏺'}</span>
      </div>
      <div className="rec-body">
        <div className="rec-title-line">
          <span className="rec-title">{timer.title}</span>
          <span className={`rec-state rec-timer-${timerStateTone(timer.state)}`}>
            {TIMER_STATE_LABEL[timer.state] ?? timer.state}
          </span>
        </div>
        <div className="rec-meta">
          <span className="vod-chip">{providerLabel}</span>
          {meta.map((m) => (
            <span key={String(m)}>{m}</span>
          ))}
        </div>
      </div>
      <div className="rec-actions">
        <button
          className="btn-reminder"
          disabled={busy}
          onClick={() => onDelete(timer)}
          title={timer.state === 'RECORDING' ? 'Laufende Aufnahme abbrechen und Timer löschen' : 'Timer löschen'}
          aria-label={`Timer ${timer.title} löschen`}
        >
          🗑
        </button>
      </div>
    </li>
  );
});
