import { memo, useState } from 'react';
import { formatDuration } from '@/lib/vod';
import { RECORDING_STATUS_LABEL, formatSize, type RecordingItem } from '@/lib/recordings';

interface Props {
  item: RecordingItem;
  providerLabel: string;
  timezone: string;
  busy: boolean;
  onPlay: (item: RecordingItem) => void;
  onDelete: (item: RecordingItem) => void;
}

export const RecordingRow = memo(function RecordingRow({
  item,
  providerLabel,
  timezone,
  busy,
  onPlay,
  onDelete,
}: Props) {
  const [broken, setBroken] = useState(false);
  const when = item.recordedAt?.toLocaleString('de-DE', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const ep =
    item.season || item.episode
      ? `S${String(item.season ?? 0).padStart(2, '0')}E${String(item.episode ?? 0).padStart(2, '0')}`
      : undefined;
  const meta = [item.channelName, when, formatDuration(item.durationSeconds), formatSize(item.sizeInBytes)].filter(Boolean);
  const playable = item.status === 'COMPLETED' || item.status === 'RECORDING';
  const resumePct =
    item.durationSeconds && item.lastPlayedPosition > 0
      ? Math.min(100, Math.round((item.lastPlayedPosition / item.durationSeconds) * 100))
      : 0;

  return (
    <li className={`rec-row ${item.playCount > 0 ? 'watched' : ''}`}>
      <div className="rec-thumb">
        {item.thumbnail && !broken ? (
          <img src={item.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        ) : (
          <span aria-hidden="true">{item.title.substring(0, 2).toUpperCase()}</span>
        )}
        {resumePct > 0 && resumePct < 100 && (
          <span className="rec-resume" style={{ width: `${resumePct}%` }} title={`${resumePct} % gesehen`} />
        )}
      </div>

      <div className="rec-body">
        <div className="rec-title-line">
          <span className="rec-title">{item.title}</span>
          {ep && <span className="vod-chip">{ep}</span>}
          <span className={`rec-state rec-state-${item.status.toLowerCase()}`}>
            {RECORDING_STATUS_LABEL[item.status]}
          </span>
        </div>
        {item.episodeName && <div className="rec-sub">{item.episodeName}</div>}
        <div className="rec-meta">
          <span className="vod-chip">{providerLabel}</span>
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        {item.plot && <p className="rec-plot">{item.plot}</p>}
      </div>

      <div className="rec-actions">
        <button className="btn-play" disabled={!playable || busy} onClick={() => onPlay(item)}>
          ▶ Play
        </button>
        <button
          className="btn-reminder"
          disabled={busy}
          onClick={() => onDelete(item)}
          title="Aufnahme beim Provider löschen"
          aria-label={`${item.title} löschen`}
        >
          🗑
        </button>
      </div>
    </li>
  );
});
