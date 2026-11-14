import { motion, useReducedMotion } from 'motion/react';
import type { Channel, Program } from '@/lib/types';
import { TimeBadge, FskBadge } from '@/components/ui/TimeBadge';
import { programKey } from '@/lib/programKey';
import { isCatchupEligible } from '@/lib/catchup';
import { parseProgramTime } from '@/lib/time';

interface Props {
  channel: Channel;
  program: Program;
  publicUrlConfigured: boolean;
  onPlay: () => void;
  onCatchup: () => void;
  onDownload: () => void;
  onDetails: () => void;
}

export function DailyProgramCard({
  channel,
  program,
  publicUrlConfigured,
  onPlay,
  onCatchup,
  onDownload,
  onDetails,
}: Props) {
  const reduced = useReducedMotion();
  const now = new Date();
  const start = parseProgramTime(program.start_time);
  const end = parseProgramTime(program.end_time);
  const isLive = start && end && start <= now && end >= now;
  const isPast = end && end < now;
  const catchupEligible = isCatchupEligible(program, channel, now);

  const cls = [
    'daily-program-card-expanded',
    isLive ? 'live' : '',
    start && start > now ? 'upcoming' : '',
    isPast ? 'past' : '',
    catchupEligible ? 'past-with-catchup' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const [imgError, setImgError] = React.useState(false);
  const imageUrl = program.image_url || program.icon_url;
  const streamUrl = program.stream_url || program.stream;

  return (
    <motion.div
      className={cls}
      onClick={onDetails}
      whileHover={reduced ? undefined : { x: 2 }}
      transition={{ duration: 0.15 }}
    >
      {imageUrl && !imgError ? (
        <img
          className="daily-program-image-expanded"
          src={imageUrl}
          alt={program.title}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="daily-program-image-fallback">Kein Bild</div>
      )}
      <div className="daily-program-details-expanded">
        <div className="program-time">
          <TimeBadge badge={program.time_badge} />
        </div>
        <div className="daily-program-title-expanded">{program.title}</div>
        {program.subtitle && <div className="program-subtitle">{program.subtitle}</div>}
        {program.description && (
          <div className="daily-program-description-expanded">{program.description}</div>
        )}
        <div className="daily-program-meta-expanded">
          {program.category && <span className="program-category">{program.category}</span>}
          {program.duration && <span className="program-duration">{program.duration} min</span>}
          {program.rating && <FskBadge rating={program.rating} />}
          {program.episode_formatted && (
            <span className="program-episode">{program.episode_formatted}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {streamUrl && !catchupEligible && (
            <button
              className="btn-play"
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
            >
              ▶ Jetzt abspielen
            </button>
          )}
          {catchupEligible && (
            <>
              {publicUrlConfigured && (
                <button
                  className="btn-catchup"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCatchup();
                  }}
                >
                  ⏪ Catchup abspielen
                </button>
              )}
              <button
                className="btn-catchup-download"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
              >
                ⬇ Herunterladen
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Needed because we use React.useState without top-level import
import React from 'react';
