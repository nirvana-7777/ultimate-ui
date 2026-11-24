/**
 * Events (one-time live/scheduled broadcasts: sports, concerts, ...).
 *
 * The backend serialises Event.to_dict() in PascalCase (Content fields plus
 * StartTime / EndTime / Status / DurationMinutes). The normaliser also reads
 * snake_case and the optional event-specific fields (Subtitle, Competition,
 * Venue, ...), so they show up as soon as the backend emits them.
 */

export type EventState = 'live' | 'upcoming' | 'ended' | 'cancelled';

export interface EventItem {
  /** provider|id - unique across providers */
  key: string;
  provider: string;
  id: string;
  title: string;
  subtitle?: string;
  originalName?: string;
  description?: string;
  genre?: string;
  logo?: string;
  channel?: string;
  competition?: string;
  venue?: string;
  discipline?: string;
  gender?: string;
  ageCategory?: string;
  masterEvent?: string;
  start?: Date;
  end?: Date;
  durationMinutes?: number;
  /** Status as the backend computed it (SCHEDULED | LIVE | ENDED | CANCELLED). */
  status: string;
}

export const EVENT_STATE_LABEL: Record<EventState, string> = {
  live: 'Live',
  upcoming: 'Geplant',
  ended: 'Beendet',
  cancelled: 'Abgesagt',
};

const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) if (o?.[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const str = (v: unknown): string | undefined => {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s || undefined;
};
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? undefined : n;
};
const date = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function normalizeEvent(raw: any, provider: string): EventItem {
  const id = String(pick(raw, 'Id', 'id', 'EventId', 'event_id', 'ContentId', 'content_id') ?? '');
  return {
    key: `${provider}|${id}`,
    provider,
    id,
    title: str(pick(raw, 'Name', 'name', 'Title', 'title')) ?? 'Ohne Titel',
    subtitle: str(pick(raw, 'Subtitle', 'subtitle', 'SecondaryTitle', 'secondary_title')),
    originalName: str(pick(raw, 'OriginalName', 'original_name')),
    description: str(pick(raw, 'Description', 'description')),
    genre: str(pick(raw, 'Genre', 'genre')),
    logo: str(pick(raw, 'LogoUrl', 'logo_url')),
    channel: str(pick(raw, 'Channel', 'channel', 'ChannelName', 'channel_name')),
    competition: str(pick(raw, 'Competition', 'competition')),
    venue: str(pick(raw, 'Venue', 'venue')),
    discipline: str(pick(raw, 'Discipline', 'discipline')),
    gender: str(pick(raw, 'Gender', 'gender')),
    ageCategory: str(pick(raw, 'AgeCategory', 'age_category')),
    masterEvent: str(pick(raw, 'MasterEvent', 'master_event')),
    start: date(pick(raw, 'StartTime', 'start_time')),
    end: date(pick(raw, 'EndTime', 'end_time')),
    durationMinutes: num(pick(raw, 'DurationMinutes', 'duration_minutes')),
    status: String(pick(raw, 'Status', 'status') ?? 'SCHEDULED').toUpperCase(),
  };
}

/**
 * The backend decides LIVE/ENDED when the Event object is built, which can be
 * long before the list reaches the browser (provider caches). So the state is
 * derived from start/end here; the backend status is the fallback and the only
 * source for CANCELLED.
 */
export function eventState(ev: EventItem, now: number = Date.now()): EventState {
  if (ev.status === 'CANCELLED') return 'cancelled';
  if (ev.start && ev.end) {
    if (now < ev.start.getTime()) return 'upcoming';
    if (now > ev.end.getTime()) return 'ended';
    return 'live';
  }
  if (ev.status === 'LIVE') return 'live';
  if (ev.status === 'ENDED') return 'ended';
  return 'upcoming';
}

const RANK: Record<EventState, number> = { live: 0, upcoming: 1, ended: 2, cancelled: 3 };

/** Live first, then upcoming by start, finished/cancelled last (most recent first). */
export function compareEvents(a: EventItem, b: EventItem, now: number = Date.now()): number {
  const sa = eventState(a, now);
  const sb = eventState(b, now);
  if (sa !== sb) return RANK[sa] - RANK[sb];
  const ta = a.start?.getTime() ?? 0;
  const tb = b.start?.getTime() ?? 0;
  const byTime = sa === 'ended' || sa === 'cancelled' ? tb - ta : ta - tb;
  return byTime || a.title.localeCompare(b.title, 'de');
}

/** "Sa., 29.11.2026, 20:15–22:00", or both days when the event spans midnight. */
export function formatEventTime(start?: Date, end?: Date, timeZone = 'Europe/Berlin'): string | undefined {
  if (!start) return undefined;
  const day = (d: Date) =>
    d.toLocaleDateString('de-DE', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = (d: Date) => d.toLocaleTimeString('de-DE', { timeZone, hour: '2-digit', minute: '2-digit' });
  if (!end) return `${day(start)}, ${time(start)}`;
  return day(start) === day(end)
    ? `${day(start)}, ${time(start)}–${time(end)}`
    : `${day(start)}, ${time(start)} – ${day(end)}, ${time(end)}`;
}
