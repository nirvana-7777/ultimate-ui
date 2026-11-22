import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useVodMovies, useVodShows, useVodStatus } from '@/hooks/useVod';
import { vodService } from '@/services/vodService';
import { resolveManifest } from '@/services/manifestService';
import { VodCard } from '@/components/vod/VodCard';
import { VodDetailModal } from '@/components/vod/VodDetailModal';
import { VodStatusBar } from '@/components/vod/VodStatusBar';
import { ColumnState } from '@/components/epg/ColumnState';
import { FloatingPlayer, type PlayerState } from '@/components/epg/FloatingPlayer';
import { useToast } from '@/lib/toast';
import type { VodItem } from '@/lib/vod';

const SHOW_CHUNK = 60;

/** VOD library (filled nightly by the VOD crawler): movies / shows, filter, search, details, play. */
export function VodPage() {
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('type') === 'shows' ? 'shows' : 'movies';
  const provider = params.get('provider') || null;
  const includePriced = params.get('priced') === '1';
  const urlQ = params.get('q') ?? '';

  const [search, setSearch] = useState(urlQ);
  const [q, setQ] = useState(urlQ.trim());
  const [selected, setSelected] = useState<VodItem | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [shown, setShown] = useState(SHOW_CHUNK);
  const scrollRef = useRef<HTMLDivElement>(null);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  // Debounced search -> URL + query.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = search.trim();
      setQ(v);
      setParam('q', v || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const movies = useVodMovies({ provider, includePriced, q: tab === 'movies' ? q : '' });
  const shows = useVodShows(provider, tab === 'shows');
  const { status, error: statusError, refresh } = useVodStatus(() => {
    movies.reload();
    shows.reload();
  });

  // Header refresh button.
  useEffect(() => {
    const h = () => {
      movies.reload();
      shows.reload();
      refresh();
    };
    window.addEventListener('ultimate:refresh', h);
    return () => window.removeEventListener('ultimate:refresh', h);
  }, [movies.reload, shows.reload, refresh]);

  const filteredShows = useMemo(() => {
    const needle = q.toLowerCase();
    return needle ? shows.items.filter((s) => s.title.toLowerCase().includes(needle)) : shows.items;
  }, [shows.items, q]);

  // Block bodies on purpose: an effect must return nothing or a cleanup function.
  useEffect(() => {
    setShown(SHOW_CHUNK);
  }, [provider, q, tab]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [provider, q, tab, includePriced]);

  const providerOptions = useMemo(() => {
    const set = new Set<string>(status?.providers ?? []);
    [...movies.items, ...shows.items].forEach((i) => i.providers.forEach((p) => set.add(p)));
    if (provider) set.add(provider);
    return Array.from(set).sort();
  }, [status, movies.items, shows.items, provider]);

  const isMovies = tab === 'movies';
  const list = isMovies ? movies.items : filteredShows.slice(0, shown);
  const loading = isMovies ? movies.loading : shows.loading;
  const error = isMovies ? movies.error : shows.error;
  const hasMore = isMovies ? movies.hasMore : shown < filteredShows.length;
  const total = isMovies ? movies.total : filteredShows.length;

  const loadMore = useCallback(() => {
    if (isMovies) movies.loadMore();
    else setShown((n) => n + SHOW_CHUNK);
  }, [isMovies, movies.loadMore]);

  const sentinel = useInfiniteScroll(loadMore, {
    enabled: hasMore && !loading && !error,
    rootRef: scrollRef,
  });

  const startSync = async () => {
    setSyncing(true);
    try {
      await vodService.sync(provider);
      showToast(provider ? `Sync für ${provider} gestartet` : 'Sync gestartet', 'success');
      refresh();
    } catch (e) {
      showToast((e as Error).message, 'warning'); // e.g. 409: läuft bereits
    } finally {
      setSyncing(false);
    }
  };

  const play = useCallback(
    async (url: string | undefined, title: string, subtitle?: string, drm?: { provider: string; id: string }) => {
      if (!drm) {
        if (url) setPlayer({ url, title, subtitle, drm: null });
        return;
      }
      // Encrypted: /manifest gives the license info, /manifest/original the unproxied stream.
      try {
        const r = await resolveManifest('vod', drm.provider, drm.id);
        if (!r.url) throw new Error('Kein Stream für diesen Titel verfügbar');
        setPlayer({ url: r.url, title, subtitle, drm: r.drm });
      } catch (e) {
        showToast((e as Error).message, 'error');
      }
    },
    [showToast]
  );

  return (
    <div className="vod-page">
      <div className="vod-toolbar">
        <div className="vod-segment" role="tablist" aria-label="Typ">
          {(['movies', 'shows'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'active' : ''}
              onClick={() => setParam('type', t === 'shows' ? 'shows' : null)}
            >
              {t === 'movies' ? '🎬 Filme' : '📺 Serien'}
            </button>
          ))}
        </div>

        <input
          className="vod-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isMovies ? 'Filme suchen…' : 'Serien suchen…'}
          aria-label="Suche"
        />

        <select
          className="vod-select"
          value={provider ?? ''}
          onChange={(e) => setParam('provider', e.target.value || null)}
          aria-label="Provider"
        >
          <option value="">Alle Provider</option>
          {providerOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <label className="vod-check" title="Leih-, Kauf- und Abo-Inhalte mit anzeigen">
          <input
            type="checkbox"
            checked={includePriced}
            onChange={(e) => setParam('priced', e.target.checked ? '1' : null)}
          />
          Kostenpflichtige
        </label>

        <VodStatusBar
          status={status}
          error={statusError}
          syncing={syncing}
          provider={provider}
          onSync={startSync}
        />
      </div>

      <div className="vod-scroll" ref={scrollRef}>
        {loading ? (
          <div className="vod-grid" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="skeleton vod-skeleton" />
            ))}
          </div>
        ) : error ? (
          <ColumnState
            icon="⚠️"
            title="VOD-Bibliothek konnte nicht geladen werden"
            hint={error}
            action={
              <button className="btn-date" onClick={isMovies ? movies.reload : shows.reload}>
                ↻ Erneut versuchen
              </button>
            }
          />
        ) : list.length === 0 ? (
          <ColumnState
            icon="📭"
            title={q ? 'Kein Treffer' : 'Keine Inhalte'}
            hint={
              q
                ? `Nichts gefunden für „${q}“.`
                : includePriced
                ? 'Der Crawler hat (noch) nichts für diese Auswahl.'
                : 'Keine kostenlosen Inhalte – „Kostenpflichtige“ aktivieren oder Sync starten.'
            }
          />
        ) : (
          <>
            <div className="vod-count">
              {total} {isMovies ? 'Filme' : 'Serien'}
            </div>
            <div className="vod-grid">
              {list.map((i) => (
                <VodCard key={i.key} item={i} onOpen={setSelected} />
              ))}
            </div>
            {hasMore && <div ref={sentinel} className="vod-sentinel" aria-hidden="true" />}
            {movies.loadingMore && isMovies && <p className="vod-more muted">Lädt mehr…</p>}
          </>
        )}
      </div>

      <VodDetailModal
        item={selected}
        provider={provider}
        includePriced={includePriced}
        onClose={() => setSelected(null)}
        onPlay={play}
      />
      <FloatingPlayer state={player} onClose={() => setPlayer(null)} />
    </div>
  );
}
