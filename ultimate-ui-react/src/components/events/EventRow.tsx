import { memo, useState } from 'react';
import { formatDuration } from '@/lib/vod';
import { EVENT_STATE_LABEL, formatEventTime, type EventItem, type EventState } from '@/lib/events';

interface Props {
  item: EventItem;
  state: EventState;
  providerLabel: string;
  timezone: string;
  busy: boolean;
  onPlay: (item: EventItem) => void;
}

export const EventRow = memo(function EventRow({ item, state, providerLabel, timezone, busy, onPlay }: Props) {
  const [broken, setBroken] = useState(false);
  const when = formatEventTime(item.start, item.end, timezone);
  const meta = [item.channel, when, formatDuration(item.durationMinutes ? item.durationMinutes * 60 : undefined), item.genre].filter(
    Boolean
  ) as string[];
  const chips = [item.competition, item.discipline, item.venue, item.gender, item.ageCategory, item.masterEvent].filter(
    (c, i, all): c is string => !!c && all.indexOf(c) === i
  );

  return (
    <li className={`rec-row ev-row ev-row-${state}`}>
      <div className="rec-thumb ev-thumb">
        {item.logo && !broken ? (
          <img src={item.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        ) : (
          <span aria-hidden="true">{item.title.substring(0, 2).toUpperCase()}</span>
        )}
      </div>

      <div className="rec-body">
        <div className="rec-title-line">
          <span className="rec-title">{item.title}</span>
          <span className={`ev-state ev-state-${state}`}>{EVENT_STATE_LABEL[state]}</span>
        </div>
        {item.subtitle && <div className="rec-sub">{item.subtitle}</div>}
        <div className="rec-meta">
          <span className="vod-chip">{providerLabel}</span>
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        {chips.length > 0 && (
          <div className="ev-chips">
            {chips.map((c) => (
              <span key={c} className="vod-chip">
                {c}
              </span>
            ))}
          </div>
        )}
        {item.description && <p className="rec-plot">{item.description}</p>}
      </div>

      <div className="rec-actions">
        {state === 'live' && (
          <button className="btn-play" disabled={busy} onClick={() => onPlay(item)}>
            ▶ Play
          </button>
        )}
      </div>
    </li>
  );
});
