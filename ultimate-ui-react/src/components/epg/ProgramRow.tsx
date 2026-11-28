import { Fragment, memo, useState } from 'react';
import type { Channel, Program } from '@/lib/types';
import { FskBadge } from '@/components/ui/FskBadge';
import { CountryFlags } from '@/components/ui/CountryFlags';
import { genreLabel } from '@/lib/programMeta';
import { lanePeople, textCredits } from '@/lib/people';
import { PersonLane } from './PersonLane';
import { ProgressBar } from './ProgressBar';

export interface ProgramActions {
  onPlay: (channel: Channel, program: Program) => void;
  onCatchup: (channel: Channel, program: Program) => void;
  onDownload: (channel: Channel, program: Program) => void;
  /** Opens the "record" dialog; the button is hidden when not provided. */
  onRecord?: (channel: Channel, program: Program) => void;
  /** Opens the dialog for the programme's existing timer. */
  onUpdateTimer?: (channel: Channel, program: Program) => void;
  /** Deletes the programme's existing timer. */
  onDeleteTimer?: (channel: Channel, program: Program) => void;
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
  /** True when a timer exists for this programme (plain boolean, see `live`). */
  hasTimer: boolean;
  /** Timer delete in progress. */
  timerBusy?: boolean;
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
  hasTimer,
  timerBusy,
  onToggle,
  rowKey,
  onPlay,
  onCatchup,
  onDownload,
  onRecord,
  onUpdateTimer,
  onDeleteTimer,
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
          {hasTimer && (
            <span className="chip-timer" title="Timer vorhanden">
              ⏺
            </span>
          )}
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
          onRecord={onRecord}
          onUpdateTimer={onUpdateTimer}
          onDeleteTimer={onDeleteTimer}
          hasTimer={hasTimer}
          timerBusy={timerBusy}
          past={past}
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
  onRecord,
  onUpdateTimer,
  onDeleteTimer,
  hasTimer,
  timerBusy,
  past,
}: ProgramActions & {
  channel: Channel;
  program: Program;
  hasTimer: boolean;
  timerBusy?: boolean;
  past: boolean;
  live: boolean;
  catchupEligible: boolean;
  publicUrlConfigured: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const image = program.image_url || program.icon_url;
  // Hero banner only with a usable image; otherwise the card looks exactly as before.
  const showHero = !!image && !imgFailed;

  // Only fields the server actually filled are rendered.
  const genre = genreLabel(program.genre_dvb) || genreLabel(program.genre);
  const meta: { cls: string; text: string; node?: React.ReactNode }[] = [];
  if (program.category) meta.push({ cls: 'program-category', text: program.category });
  if (genre && genre !== program.category) meta.push({ cls: 'program-genre', text: genre });
  if (program.year) meta.push({ cls: 'program-year', text: String(program.year) });
  if (program.country)
    meta.push({ cls: 'program-country', text: program.country, node: <CountryFlags value={program.country} /> });
  if (program.duration) meta.push({ cls: 'program-duration', text: `${program.duration} min` });
  if (program.episode_formatted)
    meta.push({ cls: 'program-episode', text: program.episode_formatted });
  // Portraits go to the lane; everyone else stays in the text list.
  const people = lanePeople(program);
  const credits: [string, string][] = textCredits(program).map((c) => [c.label, c.value]);
  if (program.language) credits.push(['Sprache', program.language.toUpperCase()]);
  // EPG and event IDs are internal (timers use them); they are deliberately not shown.

  return (
    <div className="tl-detail">
      <div className="tl-detail-body">
        {showHero && (
          <div className="tl-hero">
            <img
              className="tl-hero-image"
              src={image}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          </div>
        )}
        <div className={showHero ? 'tl-detail-text has-hero' : 'tl-detail-text'}>
          {program.subtitle && <div className="tl-detail-subtitle">{program.subtitle}</div>}
          {meta.length > 0 && (
            <div className="tl-meta">
              {meta.map((m) => (
                <span key={m.cls} className={m.cls} title={m.node ? m.text : undefined}>
                  {m.node ?? m.text}
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

      <PersonLane people={people} />

      {(live || catchupEligible || (!!onRecord && !past) || hasTimer) && (
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
          {onRecord && !past && !hasTimer && (
            <button className="btn-play btn-record" onClick={() => onRecord(channel, program)}>
              ⏺ Aufnehmen
            </button>
          )}
          {hasTimer && onUpdateTimer && (
            <button className="btn-play btn-record" onClick={() => onUpdateTimer(channel, program)} disabled={timerBusy}>
              ✎ Update Timer
            </button>
          )}
          {hasTimer && onDeleteTimer && (
            <button className="btn-play btn-timer-delete" onClick={() => onDeleteTimer(channel, program)} disabled={timerBusy}>
              🗑 Delete Timer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
