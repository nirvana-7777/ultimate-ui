import { memo, useState } from 'react';
import type { Channel, Program } from '@/lib/types';
import { FskBadge } from '@/components/ui/FskBadge';
import { ProgressBar } from './ProgressBar';

export interface ProgramActions {
  onPlay: (channel: Channel, program: Program) => void;
  onCatchup: (channel: Channel, program: Program) => void;
  onDownload: (channel: Channel, program: Program) => void;
}

interface Props extends ProgramActions {
  channel: Channel;
  program: Program;
  /** Row state is passed as plain booleans: Program objects are mutated in place, so memo() can't see those changes. */
  live: boolean;
  past: boolean;
  catchupEligible: boolean;
  publicUrlConfigured: boolean;
  selected: boolean;
  onToggle: (key: string) => void;
  rowKey: string;
}

/**
 * One program in the timeline. Collapsed it shows the basics (time, title,
 * subtitle); when selected it expands inline with the full information.
 */
export const ProgramRow = memo(function ProgramRow({
  channel,
  program,
  live,
  past,
  catchupEligible,
  publicUrlConfigured,
  selected,
  onToggle,
  rowKey,
  onPlay,
  onCatchup,
  onDownload,
}: Props) {
  const sub = [program.subtitle, program.category].filter(Boolean).join(' · ');
  const cls = ['tl-row', live && 'live', past && 'past', selected && 'selected']
    .filter(Boolean)
    .join(' ');

  return (
    <li className={cls} data-key={rowKey} data-live={live || undefined}>
      <button
        className="tl-summary"
        onClick={() => onToggle(rowKey)}
        aria-expanded={selected}
      >
        <span className="tl-time">
          <span className="tl-start">{program.start_time_local}</span>
          <span className="tl-end">{program.end_time_local}</span>
        </span>
        <span className="tl-main">
          <span className="tl-title">{program.title}</span>
          {sub && !selected && <span className="tl-sub">{sub}</span>}
        </span>
        <span className="tl-flags">
          {live && <span className="chip-live">LIVE</span>}
          {!live && catchupEligible && (
            <span className="chip-catchup" title="Catchup verfügbar">
              ⏪
            </span>
          )}
        </span>
      </button>
      {live && <ProgressBar program={program} />}
      {selected && (
        <ProgramDetail
          channel={channel}
          program={program}
          live={live}
          catchupEligible={catchupEligible}
          publicUrlConfigured={publicUrlConfigured}
          onPlay={onPlay}
          onCatchup={onCatchup}
          onDownload={onDownload}
        />
      )}
    </li>
  );
});

function ProgramDetail({
  channel,
  program,
  live,
  catchupEligible,
  publicUrlConfigured,
  onPlay,
  onCatchup,
  onDownload,
}: ProgramActions & {
  channel: Channel;
  program: Program;
  live: boolean;
  catchupEligible: boolean;
  publicUrlConfigured: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const image = program.image_url || program.icon_url;

  return (
    <div className="tl-detail">
      <div className="tl-detail-body">
        {image && !imgFailed && (
          <img
            className="tl-detail-image"
            src={image}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        )}
        <div className="tl-detail-text">
          {program.subtitle && <div className="tl-detail-subtitle">{program.subtitle}</div>}
          <div className="tl-meta">
            {program.category && <span className="program-category">{program.category}</span>}
            {!!program.duration && <span className="program-duration">{program.duration} min</span>}
            {program.episode_formatted && (
              <span className="program-episode">{program.episode_formatted}</span>
            )}
            {program.rating && <FskBadge rating={program.rating} />}
          </div>
          {program.description ? (
            <p className="tl-description">{program.description}</p>
          ) : (
            <p className="tl-description muted">Keine Beschreibung verfügbar.</p>
          )}
          {(program.directors || program.actors) && (
            <dl className="tl-credits">
              {program.directors && (
                <>
                  <dt>Regie</dt>
                  <dd>{program.directors}</dd>
                </>
              )}
              {program.actors && (
                <>
                  <dt>Besetzung</dt>
                  <dd>{program.actors}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>

      {(live || catchupEligible) && (
        <div className="tl-actions">
          {live && (
            <button className="btn-play" onClick={() => onPlay(channel, program)}>
              ▶ Play
            </button>
          )}
          {catchupEligible && publicUrlConfigured && (
            <button className="btn-play" onClick={() => onCatchup(channel, program)}>
              ▶ Play
            </button>
          )}
          {catchupEligible && (
            <button className="btn-play btn-download" onClick={() => onDownload(channel, program)}>
              ⬇ Download
            </button>
          )}
        </div>
      )}
    </div>
  );
}
