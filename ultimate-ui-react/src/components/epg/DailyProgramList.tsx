import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import type { Channel, Program } from '@/lib/types';
import { DailyProgramCard } from './DailyProgramCard';
import { useToast } from '@/lib/toast';
import { EPGService } from '@/services/epgService';

interface Props {
  channel: Channel;
  programs: Program[];
  service: EPGService;
  publicUrlConfigured: boolean;
  onClose: () => void;
  onPlay: (program: Program) => void;
  onCatchup: (program: Program) => void;
  onDownload: (program: Program) => void;
  onDetails: (program: Program) => void;
}

export function DailyProgramList({
  channel,
  programs,
  service,
  publicUrlConfigured,
  onClose,
  onPlay,
  onCatchup,
  onDownload,
  onDetails,
}: Props) {
  const [extra, setExtra] = useState<Program[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const { showToast } = useToast();

  const all = [...programs, ...extra];

  const loadMore = useCallback(async () => {
    if (loadingMore || noMore || all.length === 0) return;
    setLoadingMore(true);
    try {
      const last = all[all.length - 1];
      const lastEnd = new Date(last.end_time);
      const nextDayStart = new Date(lastEnd.getTime() - 1);
      nextDayStart.setHours(0, 0, 0, 0);
      nextDayStart.setDate(nextDayStart.getDate() + 1);

      const ceil = new Date();
      ceil.setHours(0, 0, 0, 0);
      ceil.setDate(ceil.getDate() + 1);
      if (nextDayStart > ceil) {
        setNoMore(true);
        return;
      }

      const next = await service.loadDailyProgramsForChannel(
        channel.id,
        nextDayStart
      );
      if (next.length === 0) setNoMore(true);
      else setExtra((prev) => [...prev, ...next]);
    } catch (e: any) {
      showToast('Fehler beim Laden weiterer Programme', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, noMore, all, channel.id, service, showToast]);

  return (
    <motion.div
      className="daily-programs"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.25 }}
    >
      <div className="daily-programs-header">
        <h3>Programmvorschau</h3>
        <button className="close-daily-programs" onClick={onClose}>
          × Schließen
        </button>
      </div>
      <div className="channel-daily-expanded">
        <div className="channel-daily-header-expanded">
          <div className="channel-logo-container">
            {channel.icon_url || (channel as any).LogoUrl ? (
              <img
                className="channel-logo"
                src={channel.icon_url || (channel as any).LogoUrl}
                alt={channel.display_name}
              />
            ) : (
              <div className="channel-logo-fallback">
                {channel.display_name.substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="channel-daily-name">{channel.display_name}</div>
        </div>
        {all.map((p) => (
          <DailyProgramCard
            key={`${p.channel_id}-${p.id ?? p.start_time}`}
            channel={channel}
            program={p}
            publicUrlConfigured={publicUrlConfigured}
            onPlay={() => onPlay(p)}
            onCatchup={() => onCatchup(p)}
            onDownload={() => onDownload(p)}
            onDetails={() => onDetails(p)}
          />
        ))}
        {!noMore && (
          <button
            className="load-more-programs-btn"
            onClick={loadMore}
            disabled={loadingMore}
            style={{
              display: 'block',
              width: '100%',
              padding: 16,
              background: 'var(--surface-2)',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: loadingMore ? 'wait' : 'pointer',
              borderRadius: '0 0 var(--radius) var(--radius)',
              fontSize: 14,
              textAlign: 'center',
              marginTop: 0,
            }}
          >
            {loadingMore ? 'Lädt mehr Programme...' : '▼ Mehr Programme laden'}
          </button>
        )}
        {noMore && (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
              opacity: 0.6,
            }}
          >
            Keine weiteren Programme verfügbar
          </div>
        )}
      </div>
    </motion.div>
  );
}
