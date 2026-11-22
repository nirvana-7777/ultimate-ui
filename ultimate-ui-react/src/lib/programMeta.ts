import type { Program } from './types';

/** DVB content descriptor (level 1) -> German label. Mirrors the server's _map_to_dvb_genre. */
const DVB_GENRES: Record<number, string> = {
  0x10: 'Film / Drama',
  0x20: 'Nachrichten',
  0x30: 'Show / Spiel',
  0x40: 'Sport',
  0x50: 'Dokumentation',
  0x60: 'Comedy',
  0x70: 'Kultur',
  0x80: 'Kinder',
  0x90: 'Musik',
  0xa0: 'Lifestyle / Kultur',
  0xb0: 'Bildung',
  0xc0: 'Talk',
  0xe0: 'Unterhaltung',
};

/** Trimmed string, or '' for null/undefined/blank. */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * One person entry: a plain string, or an object like
 * {name: "Kaley Cuoco", character_name: "Penny"} -> "Kaley Cuoco (Penny)".
 */
function personText(value: unknown): string {
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const name = cleanText(o.name ?? o.person_name ?? o.actor ?? o.Name);
    const role = cleanText(o.character_name ?? o.character ?? o.role ?? o.CharacterName);
    if (name && role && role !== name) return `${name} (${role})`;
    return name || role;
  }
  return cleanText(value);
}

/** Strings, string lists and person objects all end up as "A, B"; empty entries are dropped. */
export function listText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(personText).filter(Boolean).join(', ');
  }
  return personText(value);
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseInt(cleanText(value), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** DVB label for a code (0x10 or 16 or "0x10"); '' for 0/unknown codes. */
export function genreLabel(code: unknown): string {
  const raw = cleanText(code);
  if (!raw) return '';
  const n = raw.toLowerCase().startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  return DVB_GENRES[n & 0xf0] ?? '';
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "S02E05" / "S02" / "E05" - or null when there is nothing to show.
 * Accepts plain 1-based numbers (0 = unknown) as well as an XMLTV-NS
 * episode_num string ("1.4." = season 2, episode 5).
 */
export function formatEpisode(
  seasonNum: unknown,
  episodeNum: unknown
): string | null {
  const epRaw = cleanText(episodeNum);
  if (epRaw.includes('.')) {
    const [s, e] = epRaw.replace(/\.$/, '').split('.');
    const season = parseInt(s, 10);
    const episode = parseInt(e, 10);
    if (!isNaN(season) && !isNaN(episode) && season >= 0 && episode >= 0) {
      return `S${pad(season + 1)}E${pad(episode + 1)}`;
    }
  }
  const season = positiveInt(seasonNum);
  const episode = positiveInt(epRaw);
  if (season && episode) return `S${pad(season)}E${pad(episode)}`;
  if (season) return `S${pad(season)}`;
  if (episode) return `E${pad(episode)}`;
  return null;
}

/**
 * Fold the field names of both server formats (program.to_dict() and the
 * provider /epg endpoint) into the ones the UI reads. Mutates in place,
 * like the rest of enrichProgram().
 */
export function normalizeProgramFields(p: Program): void {
  p.description = cleanText(p.description) || cleanText(p.plot) || undefined;
  p.subtitle = cleanText(p.subtitle) || cleanText(p.episode_name) || undefined;
  p.icon_url =
    cleanText(p.icon_url) || cleanText(p.icon) || cleanText(p.thumbnail_url) || undefined;
  p.image_url = p.icon_url;
  p.category = cleanText(p.category) || undefined;
  p.rating = cleanText(p.rating) || undefined;
  p.country = cleanText(p.country) || undefined;
  p.directors = listText(p.directors) || undefined;
  p.actors = listText(p.actors) || undefined;
  // year 0 means "unknown" on the server side
  p.year = positiveInt(p.year) ?? positiveInt(p.production_year) ?? undefined;
  p.language = cleanText(p.language) || undefined;
  p.presenters = listText(p.presenters) || undefined;
  p.producers = listText(p.producers) || undefined;
  p.writers = listText(p.writers) || undefined;
  p.ultimate_epg_id = cleanText(p.ultimate_epg_id) || undefined;
  p.epg_event_id = cleanText(p.epg_event_id) || undefined;
}
