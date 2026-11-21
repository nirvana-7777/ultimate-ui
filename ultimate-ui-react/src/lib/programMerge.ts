import type { Program } from './types';

/** Starts closer than this (ms) count as the same slot (providers differ by up to a minute). */
const SLOT_TOLERANCE_MS = 2 * 60_000;

const FIELDS_FOR_RICHNESS = [
  'description', 'plot', 'subtitle', 'episode_name', 'actors', 'directors', 'presenters',
  'producers', 'writers', 'icon_url', 'icon', 'thumbnail_url', 'category', 'rating', 'country',
  'language', 'production_year', 'year', 'episode_num', 'season_num', 'episode_number', 'season_number',
] as const;

const isFilled = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.some(isFilled);
  if (typeof v === 'number') return v !== 0;
  return String(v).trim() !== '';
};

const richness = (p: Program): number =>
  FIELDS_FOR_RICHNESS.reduce((n, k) => n + (isFilled((p as any)[k]) ? 1 : 0), 0);

const startMs = (p: Program): number => {
  const t = new Date(p.start_time).getTime();
  return Number.isFinite(t) ? t : NaN;
};

const titleKey = (p: Program) => String(p.title ?? '').trim().toLowerCase();

/**
 * One broadcast can arrive as several rows: a detailed row (actors, plot, ...) and a thin
 * provider-event row that carries `epg_event_id`. Rows with the same title and a start within
 * two minutes are folded into the richest one; missing fields (above all `epg_event_id`) are
 * taken from the others. Back-to-back episodes are never merged: their starts differ by far
 * more than the tolerance.
 */
export function mergeDuplicateSlots(programs: Program[]): Program[] {
  if (programs.length < 2) return programs;
  const sorted = [...programs].sort((a, b) => (startMs(a) || 0) - (startMs(b) || 0));
  const groups: Program[][] = [];
  const open = new Map<string, { first: number; group: Program[] }>();

  for (const p of sorted) {
    const key = titleKey(p);
    const start = startMs(p);
    const cur = open.get(key);
    if (cur && Number.isFinite(start) && Math.abs(start - cur.first) <= SLOT_TOLERANCE_MS) {
      cur.group.push(p);
      continue;
    }
    const group = [p];
    groups.push(group);
    open.set(key, { first: start, group });
  }

  return groups.map((group) => {
    if (group.length === 1) return group[0];
    // Richest row wins; on a tie the earlier one (stable sort) stays.
    const ranked = [...group].sort((a, b) => richness(b) - richness(a));
    const base = ranked[0];
    for (const other of ranked.slice(1)) {
      for (const [k, v] of Object.entries(other)) {
        if (!isFilled((base as any)[k]) && isFilled(v)) (base as any)[k] = v;
      }
    }
    return base;
  });
}
