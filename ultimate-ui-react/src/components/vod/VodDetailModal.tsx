import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { FskBadge } from '@/components/ui/FskBadge';
import { vodService } from '@/services/vodService';
import { formatDuration, playableUrl } from '@/lib/vod';
import type { VodEpisode, VodItem } from '@/lib/vod';
import { AccessBadge } from './VodCard';

interface Props {
  item: VodItem | null;
  provider: string | null;
  includePriced: boolean;
  onClose: () => void;
  onPlay: (url: string | undefined, title: string, subtitle?: string, drm?: { provider: string; id: string }) => void;
}

function PlayButton({
  target,
  onPlay,
  small,
  canResolveDrm,
}: {
  target: { manifestUrl?: string; drm: boolean; dynamic: boolean };
  onPlay: () => void;
  small?: boolean;
  /** Provider and id are known, so a DRM stream can be fetched via /manifest + /manifest/original. */
  canResolveDrm: boolean;
}) {
  if (playableUrl(target) || (target.drm && !target.dynamic && canResolveDrm)) {
    return (
      <button className={`btn-play ${small ? 'vod-btn-small' : ''}`} onClick={onPlay}>
        ▶ Play
      </button>
    );
  }
  const why = target.drm
    ? 'DRM-geschützt – im Browser nicht abspielbar'
    : target.dynamic
    ? 'Dynamisches Manifest – im Browser nicht abspielbar'
    : 'Kein Stream hinterlegt';
  return (
    <span className="vod-noplay" title={why}>
      {target.drm ? '🔒 DRM' : '—'}
    </span>
  );
}

export function VodDetailModal({ item, provider, includePriced, onClose, onPlay }: Props) {
  const [episodes, setEpisodes] = useState<VodEpisode[]>([]);
  const [epTotal, setEpTotal] = useState(0);
  const [epLoading, setEpLoading] = useState(false);
  const [epError, setEpError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    setEpisodes([]);
    setEpTotal(0);
    setSeason(null);
    setEpError(null);
    if (!item || item.kind !== 'show') return;
    const c = new AbortController();
    setEpLoading(true);
    vodService
      .episodes(item.id, { provider, includePriced }, c.signal)
      .then((p) => {
        setEpisodes(p.items);
        setEpTotal(p.total);
        setSeason(p.items.length ? Math.min(...p.items.map((e) => e.season)) : null);
      })
      .catch((e) => (e as any)?.name !== 'AbortError' && setEpError((e as Error).message))
      .finally(() => !c.signal.aborted && setEpLoading(false));
    return () => c.abort();
  }, [item, provider, includePriced]);

  const seasons = useMemo(
    () => Array.from(new Set(episodes.map((e) => e.season))).sort((a, b) => a - b),
    [episodes]
  );
  const visible = useMemo(
    () => episodes.filter((e) => e.season === season).sort((a, b) => a.episode - b.episode),
    [episodes, season]
  );

  const details: [string, string | undefined][] = item
    ? [
        ['Genre', item.genres.join(', ')],
        ['Regie', item.director],
        ['Besetzung', item.cast.join(', ')],
        ['Sprache', item.language],
        ['Provider', item.providers.join(', ')],
        ['IMDb', item.imdbId],
        ['TMDb', item.tmdbId],
      ]
    : [];

  return (
    <Modal open={!!item} onClose={onClose} maxWidth={900}>
      {item && (
        <>
          <div className="modal-header">
            <h3>{item.title}</h3>
            <button className="modal-close" onClick={onClose} aria-label="Schließen">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="modal-body-content">
              <div className="modal-program-header">
                {item.poster && (
                  <img
                    className="modal-program-image"
                    src={item.poster}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <div className="modal-program-info">
                  <div className="modal-program-meta">
                    {item.year && <span className="vod-chip">{item.year}</span>}
                    {formatDuration(item.durationSeconds) && (
                      <span className="vod-chip">{formatDuration(item.durationSeconds)}</span>
                    )}
                    <FskBadge rating={item.rating} />
                    <AccessBadge access={item.access} price={item.price} />
                  </div>
                  {item.plot && <p className="modal-program-description">{item.plot}</p>}
                  <div className="modal-program-details">
                    {details
                      .filter(([, v]) => !!v)
                      .map(([label, v]) => (
                        <div className="detail-item" key={label}>
                          <span className="detail-label">{label}</span>
                          <span className="detail-value">{v}</span>
                        </div>
                      ))}
                  </div>
                  {item.kind === 'movie' && (
                    <div className="modal-actions vod-actions">
                      <PlayButton
                        target={item}
                        canResolveDrm={!!item.providers[0] && !!item.id}
                        onPlay={() =>
                          onPlay(
                            item.manifestUrl,
                            item.title,
                            item.year ? String(item.year) : undefined,
                            item.drm ? { provider: item.providers[0], id: item.id } : undefined
                          )
                        }
                      />
                      {item.trailerUrl && (
                        <a className="btn-reminder" href={item.trailerUrl} target="_blank" rel="noreferrer noopener">
                          Trailer ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {item.kind === 'show' && (
                <div className="vod-episodes">
                  {epLoading ? (
                    <p className="muted">Episoden werden geladen…</p>
                  ) : epError ? (
                    <p className="vod-error">Episoden konnten nicht geladen werden: {epError}</p>
                  ) : episodes.length === 0 ? (
                    <p className="muted">
                      Keine Episoden gefunden
                      {!includePriced ? ' (kostenpflichtige Inhalte sind ausgeblendet).' : '.'}
                    </p>
                  ) : (
                    <>
                      <div className="vod-seasons" role="tablist">
                        {seasons.map((s) => (
                          <button
                            key={s}
                            role="tab"
                            aria-selected={s === season}
                            className={`btn-date ${s === season ? 'active' : ''}`}
                            onClick={() => setSeason(s)}
                          >
                            {s === 0 ? 'Specials' : `Staffel ${s}`}
                          </button>
                        ))}
                      </div>
                      <ul className="vod-episode-list">
                        {visible.map((e) => (
                          <li key={e.key} className="vod-episode">
                            <span className="vod-ep-num">{e.episode ? `E${String(e.episode).padStart(2, '0')}` : '—'}</span>
                            <span className="vod-ep-body">
                              <span className="vod-ep-title">{e.title || `Episode ${e.episode}`}</span>
                              {e.plot && <span className="vod-ep-plot">{e.plot}</span>}
                            </span>
                            <span className="vod-ep-meta">{formatDuration(e.durationSeconds)}</span>
                            <AccessBadge access={e.access} price={e.price} />
                            <PlayButton
                              small
                              target={e}
                              canResolveDrm={!!(e.provider || item.providers[0]) && !!e.id}
                              onPlay={() =>
                                onPlay(
                                  e.manifestUrl,
                                  `${item.title} · S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}`,
                                  e.title,
                                  e.drm ? { provider: (e.provider || item.providers[0])!, id: e.id } : undefined
                                )
                              }
                            />
                          </li>
                        ))}
                      </ul>
                      {epTotal > episodes.length && (
                        <p className="muted">
                          {episodes.length} von {epTotal} Episoden geladen.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
