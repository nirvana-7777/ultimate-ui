import { Fragment, memo, useState } from 'react';
import type { Channel, Program } from '@/lib/types';
import { FskBadge } from '@/components/ui/FskBadge';
import { genreLabel } from '@/lib/programMeta';
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

  // Only fields the server actually filled are rendered.
  const genre = genreLabel(program.genre_dvb) || genreLabel(program.genre);
  const meta: { cls: string; text: string }[] = [];
  if (program.category) meta.push({ cls: 'program-category', text: program.category });
  if (genre && genre !== program.category) meta.push({ cls: 'program-genre', text: genre });
  if (program.year) meta.push({ cls: 'program-year', text: String(program.year) });
  if (program.country) meta.push({ cls: 'program-country', text: program.country });
  if (program.duration) meta.push({ cls: 'program-duration', text: `${program.duration} min` });
  if (program.episode_formatted)
    meta.push({ cls: 'program-episode', text: program.episode_formatted });
  const credits: [string, string][] = [];
  if (program.directors) credits.push(['Regie', String(program.directors)]);
  if (program.actors) credits.push(['Besetzung', String(program.actors)]);
  if (program.ultimate_epg_id) credits.push(['EPG-ID', String(program.ultimate_epg_id)]);

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
          {meta.length > 0 && (
            <div className="tl-meta">
              {meta.map((m) => (
                <span key={m.cls} className={m.cls}>
                  {m.text}
                </span>
              ))}
              {program.rating && <FskBadge rating={program.rating} />}
            </div>
          )}
          {program.description && <p className="tl-description">{program.description}</p>}
          {credits.length > 0 && (
            <dl className="tl-credits">
              {credits.map(([label, value]) => (
                <Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ))}
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
