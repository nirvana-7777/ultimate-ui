/**
 * VOD library types + tolerant normalisers.
 *
 * The crawler's list endpoints return Pydantic models whose exact field names
 * can differ between movies, shows and the DB model (`title`/`name`,
 * `poster_url`/`logo_url`, `provider`/`providers` ...). Everything the UI
 * reads goes through these functions, so a renamed field degrades to "not
 * shown" instead of a crash.
 */

export type VodKind = 'movie' | 'show';

export interface VodItem {
  key: string;
  id: string;
  kind: VodKind;
  title: string;
  plot?: string;
  poster?: string;
  backdrop?: string;
  year?: number;
  durationSeconds?: number;
  rating?: string;
  genres: string[];
  cast: string[];
  director?: string;
  providers: string[];
  access?: string;
  price?: string;
  manifestUrl?: string;
  drm: boolean;
  dynamic: boolean;
  trailerUrl?: string;
  imdbId?: string;
  tmdbId?: string;
  language?: string;
  seasons?: number;
  episodes?: number;
}

export interface VodEpisode {
  key: string;
  id: string;
  season: number;
  episode: number;
  title: string;
  plot?: string;
  airDate?: string;
  durationSeconds?: number;
  provider?: string;
  access?: string;
  price?: string;
  manifestUrl?: string;
  drm: boolean;
  dynamic: boolean;
}

export interface VodStatus {
  syncInProgress: boolean;
  syncProgress: Record<string, any> | null;
  providers: string[];
  movies?: number;
  shows?: number;
  episodes?: number;
  lastCrawl?: string;
}

export interface VodPage<T> {
  items: T[];
  total: number;
}

// ---------------------------------------------------------------- helpers

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined;

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && isFinite(n) && n !== 0 ? n : undefined;
};

/** Array of strings from: array, array of {name}, JSON string, "a, b" string. */
export function toList(v: unknown): string[] {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) {
    return v
      .map((x) =>
        typeof x === 'string' ? x : str((x as any)?.name ?? (x as any)?.title ?? (x as any)?.provider)
      )
      .filter((x): x is string => !!x);
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('[')) {
      try {
        return toList(JSON.parse(t));
      } catch {
        /* fall through */
      }
    }
    return t.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
  }
  if (typeof v === 'object') return Object.keys(v as object);
  return [];
}

const nonEmptyObj = (v: unknown) =>
  !!v && typeof v === 'object' && Object.keys(v as object).length > 0;

/** Price from pricing_price_points: number, {amount,currency}, {EUR: 3.99}, or a list of those. */
export function formatPrice(pp: unknown): string | undefined {
  if (pp == null || pp === '') return undefined;
  if (Array.isArray(pp)) return pp.length ? formatPrice(pp[0]) : undefined;
  const fmt = (amount: number, cur?: string) =>
    cur && /^[A-Z]{3}$/.test(cur)
      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur }).format(amount)
      : amount.toFixed(2).replace('.', ',') + (cur ? ` ${cur}` : ' €');
  if (typeof pp === 'number') return fmt(pp);
  if (typeof pp === 'string') return pp;
  if (typeof pp === 'object') {
    const o = pp as Record<string, any>;
    const amount = num(o.amount ?? o.price ?? o.value);
    if (amount !== undefined) return fmt(amount, str(o.currency));
    const k = Object.keys(o).find((key) => /^[A-Z]{3}$/.test(key) && num(o[key]) !== undefined);
    if (k) return fmt(num(o[k])!, k);
  }
  return undefined;
}

const ACCESS: Record<string, { label: string; tone: 'free' | 'sub' | 'paid' }> = {
  free: { label: 'Gratis', tone: 'free' },
  avod: { label: 'Gratis (Werbung)', tone: 'free' },
  subscription: { label: 'Abo', tone: 'sub' },
  svod: { label: 'Abo', tone: 'sub' },
  rent: { label: 'Leihen', tone: 'paid' },
  tvod: { label: 'Leihen', tone: 'paid' },
  buy: { label: 'Kaufen', tone: 'paid' },
  est: { label: 'Kaufen', tone: 'paid' },
  ppv: { label: 'Einzelkauf', tone: 'paid' },
};

export function accessInfo(access?: string) {
  if (!access) return null;
  return ACCESS[access.toLowerCase()] ?? { label: access, tone: 'paid' as const };
}

export function formatDuration(seconds?: number): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Direct browser playback only for clear, static manifests. */
export function playableUrl(x: { manifestUrl?: string; drm: boolean; dynamic: boolean }) {
  return x.manifestUrl && !x.drm && !x.dynamic ? x.manifestUrl : null;
}

function durationOf(r: any): number | undefined {
  const s = num(r.duration_seconds);
  if (s) return s;
  const m = num(r.duration_minutes ?? r.runtime);
  if (m) return m * 60;
  const d = num(r.duration);
  if (d) return d > 600 ? d : d * 60; // heuristic: small numbers are minutes
  return undefined;
}

function sourceOf(r: any): any {
  // Merged exports may nest per-provider entries.
  const nested = Array.isArray(r.providers) ? r.providers.find((p: any) => p && typeof p === 'object') : null;
  return nested ? { ...nested, ...r } : r;
}

// ------------------------------------------------------------- normalisers

export function normalizeItem(r: any, kind: VodKind): VodItem {
  const s = sourceOf(r ?? {});
  const providers = toList(r?.providers ?? r?.provider_ids ?? r?.provider);
  const genres = toList(r?.genres);
  if (!genres.length) genres.push(...toList(r?.genre));
  const id = str(r?.id) ?? str(r?.content_id) ?? '';
  return {
    key: `${kind}:${id}:${providers[0] ?? ''}`,
    id,
    kind,
    title: str(r?.title) ?? str(r?.name) ?? '(ohne Titel)',
    plot: str(r?.plot) ?? str(r?.description) ?? str(r?.long_description),
    poster: str(r?.poster_url) ?? str(r?.poster) ?? str(r?.logo_url) ?? str(r?.thumbnail_url) ?? str(r?.image_url),
    backdrop: str(r?.backdrop_url),
    year: num(r?.release_year ?? r?.year),
    durationSeconds: durationOf(r ?? {}),
    rating: str(r?.rating),
    genres,
    cast: toList(r?.cast),
    director: str(r?.director),
    providers,
    access: str(r?.pricing_access_type) ?? str(s?.pricing_access_type) ?? str(r?.access_type),
    price: formatPrice(r?.pricing_price_points ?? s?.pricing_price_points),
    manifestUrl: str(s?.manifest_url),
    drm: !!(s?.license_url || nonEmptyObj(s?.drm_config)),
    dynamic: !!(s?.session_manifest || s?.manifest_script),
    trailerUrl: str(r?.trailer_url),
    imdbId: str(r?.imdb_id),
    tmdbId: str(r?.tmdb_id),
    language: str(r?.language),
    seasons: num(r?.season_count ?? r?.seasons),
    episodes: num(r?.episode_count ?? r?.episodes),
  };
}

export function normalizeEpisode(r: any): VodEpisode {
  const id = str(r?.id) ?? str(r?.content_id) ?? '';
  return {
    key: `ep:${id}:${r?.provider ?? ''}`,
    id,
    season: num(r?.season_number) ?? 0,
    episode: num(r?.episode_number) ?? 0,
    title: str(r?.title) ?? str(r?.name) ?? '',
    plot: str(r?.plot) ?? str(r?.description) ?? str(r?.long_description),
    airDate: str(r?.air_date),
    durationSeconds: durationOf(r ?? {}),
    provider: str(r?.provider),
    access: str(r?.pricing_access_type),
    price: formatPrice(r?.pricing_price_points),
    manifestUrl: str(r?.manifest_url),
    drm: !!(r?.license_url || nonEmptyObj(r?.drm_config)),
    dynamic: !!(r?.session_manifest || r?.manifest_script),
  };
}

function pick(obj: any, paths: string[]): any {
  for (const p of paths) {
    const v = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

export function normalizeStatus(r: any): VodStatus {
  return {
    syncInProgress: !!r?.sync_in_progress,
    syncProgress: nonEmptyObj(r?.sync_progress) ? r.sync_progress : null,
    providers: toList(pick(r, ['providers', 'provider_stats', 'by_provider', 'stats.providers'])),
    movies: num(pick(r, ['total_movies', 'movies_count', 'movie_count', 'stats.movies', 'movies'])),
    shows: num(pick(r, ['total_shows', 'shows_count', 'show_count', 'stats.shows', 'shows'])),
    episodes: num(pick(r, ['total_episodes', 'episodes_count', 'episode_count', 'stats.episodes'])),
    lastCrawl: str(pick(r, ['last_crawl', 'last_sync', 'last_updated', 'last_crawl_time'])),
  };
}

export function pageOf(data: any, kind: VodKind | 'episode'): VodPage<any> {
  const raw: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  const items = raw.map((r) => (kind === 'episode' ? normalizeEpisode(r) : normalizeItem(r, kind)));
  return { items, total: num(data?.total) ?? items.length };
}
