import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, Program } from '@/lib/types';
import type { EPGService } from '@/services/epgService';
import { useNowPlaying } from '@/hooks/useNowPlaying';
import { ChannelLogo } from './ChannelLogo';
import { ColumnState, ListSkeleton } from './ColumnState';

interface Props {
  service: EPGService;
  providerLabel: string | null;
  channels: Channel[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (channel: Channel) => void;
  onPlayLive: (channel: Channel) => void;
  onRetry: () => void;
  onBack: () => void;
}

export function ChannelColumn({
  service,
  providerLabel,
  channels,
  loading,
  error,
  selectedId,
  onSelect,
  onPlayLive,
  onRetry,
  onBack,
}: Props) {
  const [query, setQuery] = useState('');
  const nowPlaying = useNowPlaying(service);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? channels.filter((c) => c.display_name.toLowerCase().includes(q)) : channels;
  }, [channels, query]);

  return (
    <section className="epg-col epg-col-channels" aria-label="Kanäle">
      <header className="epg-col-header">
        <button className="epg-back" onClick={onBack} aria-label="Zurück zu Providern">
          ←
        </button>
        <h2>{providerLabel ?? 'Kanäle'}</h2>
        {!loading && channels.length > 0 && (
          <span className="epg-col-count">{channels.length}</span>
        )}
      </header>

      {channels.length > 0 && (
        <div className="epg-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kanal suchen…"
            aria-label="Kanal suchen"
          />
        </div>
      )}

      <div className="epg-col-scroll">
        {!providerLabel ? (
          <ColumnState icon="👈" title="Provider wählen" hint="Dann erscheinen hier die Kanäle." />
        ) : loading ? (
          <ListSkeleton />
        ) : error ? (
          <ColumnState
            icon="⚠️"
            title="Kanäle konnten nicht geladen werden"
            hint={error}
            action={
              <button className="btn-date" onClick={onRetry}>
                ↻ Erneut versuchen
              </button>
            }
          />
        ) : channels.length === 0 ? (
          <ColumnState icon="📭" title="Keine Kanäle verfügbar" hint="Dieser Provider liefert keine Kanäle." />
        ) : visible.length === 0 ? (
          <ColumnState icon="🔍" title="Kein Treffer" hint={`Kein Kanal passt zu „${query}“.`} />
        ) : (
          <ul className="epg-list" role="listbox" aria-label="Kanäle">
            {visible.map((c) => (
              <ChannelRow
                key={String(c.id)}
                channel={c}
                selected={String(c.id) === selectedId}
                program={nowPlaying.get(c)}
                onVisible={nowPlaying.request}
                onSelect={onSelect}
                onPlayLive={onPlayLive}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface RowProps {
  channel: Channel;
  selected: boolean;
  program: Program | null;
  onVisible: (c: Channel) => void;
  onSelect: (c: Channel) => void;
  onPlayLive: (c: Channel) => void;
}

const ChannelRow = memo(function ChannelRow({
  channel,
  selected,
  program,
  onVisible,
  onSelect,
  onPlayLive,
}: RowProps) {
  const ref = useRef<HTMLLIElement>(null);
  const hasLive = !!(channel.StreamUrl || channel.streamUrl);

  // Resolve "now playing" only for rows that actually scroll into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onVisible(channel);
          io.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [channel, onVisible]);

  const pct = program?.progress?.percentage;

  return (
    <li ref={ref} className="epg-row">
      <button
        role="option"
        aria-selected={selected}
        className={`epg-item channel ${selected ? 'selected' : ''}`}
        onClick={() => onSelect(channel)}
      >
        <ChannelLogo name={channel.display_name} url={channel.icon_url} />
        <span className="epg-item-body">
          <span className="epg-item-title">
            {channel.display_name}
            {channel.catchup?.enabled && channel.catchup.hours > 0 && (
              <span
                className="catchup-badge"
                title={`Catchup: bis zu ${channel.catchup.hours} Stunden`}
              >
                ⏪ {Math.round(channel.catchup.hours / 24) >= 1
                  ? `${Math.round(channel.catchup.hours / 24)}d`
                  : `${channel.catchup.hours}h`}
              </span>
            )}
          </span>
          <span className="epg-item-sub">
            {program ? (
              <>
                <span className="live-dot" aria-hidden="true" />
                {program.title}
              </>
            ) : (
              <span className="muted">&nbsp;</span>
            )}
          </span>
          {typeof pct === 'number' && (
            <span className="mini-progress" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </span>
          )}
        </span>
      </button>
      {hasLive && (
        <button
          className="epg-live-btn"
          onClick={() => onPlayLive(channel)}
          title="Play"
          aria-label={`${channel.display_name} abspielen`}
        >
          ▶
        </button>
      )}
    </li>
  );
});
