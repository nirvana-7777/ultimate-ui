import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Channel, Program } from '@/lib/types';
import { TimeBadge, FskBadge } from '@/components/ui/TimeBadge';
import { ProgressBar } from './ProgressBar';
import { programKey } from '@/lib/programKey';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ChannelCardProps {
  channel: Channel;
  program: Program | null;
  isProviderChannel?: boolean;
  onPlayProgram: (channelId: string | number, programKey: string) => void;
  onPlayChannel?: (channelId: string | number) => void;
  onExpand: (channelId: string | number) => void;
}

export function ChannelCard({
  channel,
  program,
  isProviderChannel = false,
  onPlayProgram,
  onPlayChannel,
  onExpand,
}: ChannelCardProps) {
  const [imgError, setImgError] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const reduced = useReducedMotion();

  const channelId = (channel as any).Id ?? channel.id;
  const name = channel.display_name || channel.Name || '';
  const logoUrl = channel.icon_url || channel.LogoUrl;

  const hasStream =
    (isProviderChannel && (channel as any).StreamUrl) ||
    (program && (program.stream_url || program.stream));

  return (
    <motion.div
      className={`channel-now-card ${program?.is_live ? 'live' : program ? 'upcoming' : ''}`}
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={reduced ? undefined : { scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className="channel-header-compact">
        <div className="channel-logo-section">
          <div className="channel-logo-container">
            {logoUrl && !imgError ? (
              <img
                className="channel-logo"
                src={logoUrl}
                alt={name}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="channel-logo-fallback">
                {name.substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="channel-name-compact">{name}</div>
          {channel.catchup?.enabled && channel.catchup.hours > 0 && (
            <span
              className="catchup-badge"
              title={`Catchup: bis zu ${channel.catchup.hours} Stunden verfügbar`}
            >
              ⏪ {channel.catchup.hours}h
            </span>
          )}
          {hasStream && (
            <button
              className={isProviderChannel ? 'btn-play-channel' : 'btn-play-tile'}
              onClick={(e) => {
                e.stopPropagation();
                if (isProviderChannel) onPlayChannel?.(channelId);
                else if (program) onPlayProgram(channelId, programKey(channelId, program));
              }}
            >
              <span>▶</span> {isProviderChannel ? 'Live' : 'Play'}
            </button>
          )}
        </div>

        <div className="channel-info-compact">
          {program ? (
            <div className="current-event">
              <div className="event-title">{program.title}</div>
              {program.subtitle && (
                <div className="event-subtitle">{program.subtitle}</div>
              )}
              <div className="event-time">
                <TimeBadge badge={program.time_badge} />
                {program.rating && <FskBadge rating={program.rating} />}
              </div>
              {program.description && (
                <>
                  <div
                    className={`event-description ${descExpanded ? 'expanded' : ''}`}
                  >
                    {program.description}
                  </div>
                  {program.description.length > 100 && (
                    <button
                      className="expand-description-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDescExpanded((v) => !v);
                      }}
                    >
                      {descExpanded ? 'weniger' : 'weiterlesen'}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="event-title" style={{ color: 'var(--text-muted)' }}>
              Kein aktuelles Programm
            </div>
          )}
        </div>

        {program && (program.image_url || program.icon_url) && (
          <img
            className="event-preview-image"
            src={program.image_url || program.icon_url}
            alt={program.title}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </div>

      {program?.progress && <ProgressBar program={program} />}

      <button
        className="expand-daily-btn"
        onClick={(e) => {
          e.stopPropagation();
          onExpand(channelId);
        }}
      >
        ▼ Vorschau anzeigen
      </button>
    </motion.div>
  );
}
