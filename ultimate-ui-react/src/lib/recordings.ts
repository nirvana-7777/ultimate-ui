/**
 * Recordings + timers: types, bitmask helpers and normalisers.
 *
 * The backend serialises models in PascalCase (Recording.to_dict(),
 * Timer.to_dict(), TimerType.to_dict()) but accepts snake_case timer bodies.
 * Normalisers read both spellings so a small backend rename does not blank the UI.
 */

export type RecordingSource = 'cloud' | 'local';

export type RecordingStatus = 'PENDING' | 'RECORDING' | 'COMPLETED' | 'FAILED' | 'DELETED';

export interface RecordingItem {
  /** source|provider|id - unique across providers and sources */
  key: string;
  source: RecordingSource;
  provider: string;
  id: string;
  title: string;
  episodeName?: string;
  channelName?: string;
  recordedAt?: Date;
  durationSeconds?: number;
  plot?: string;
  thumbnail?: string;
  season?: number;
  episode?: number;
  status: RecordingStatus;
  playCount: number;
  lastPlayedPosition: number;
  sizeInBytes?: number;
}

export interface TimerItem {
  key: string;
  source: RecordingSource;
  provider: string;
  clientIndex: number;
  title: string;
  state: string;
  channelName?: string;
  start?: Date;
  end?: Date;
  weekdays: number;
  epgSearch?: string;
  /** Provider event id the timer was created for (create/update/delete are matched by it). */
  epgEventId?: string;
  repeating: boolean;
}

export interface IntOption {
  value: number;
  description: string;
}

/** Mirrors TimerTypeAttribute in the backend (only the bits the UI needs). */
export const TA = {
  IS_MANUAL: 0x1,
  IS_REPEATING: 0x2,
  IS_EPG_BASED: 0x4,
  SUPPORTS_CHANNELS: 0x10,
  SUPPORTS_START_TIME: 0x20,
  SUPPORTS_END_TIME: 0x80,
  SUPPORTS_EPG_SEARCH: 0x800,
  SUPPORTS_PRIORITIES: 0x4000,
  SUPPORTS_LIFETIMES: 0x8000,
  SUPPORTS_PADDING: 0x10000,
} as const;

export interface TimerTypeInfo {
  id: number;
  attributes: number;
  description: string;
  priorityOptions: IntOption[];
  priorityDefault: number;
  lifetimeOptions: IntOption[];
  lifetimeDefault: number;
}

export const typeHas = (t: TimerTypeInfo, bit: number) => (t.attributes & bit) !== 0;

const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) if (o?.[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? undefined : n;
};
const str = (v: unknown): string | undefined => {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s || undefined;
};
const date = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function normalizeRecording(raw: any, provider: string, source: RecordingSource = 'cloud'): RecordingItem {
  const id = String(pick(raw, 'RecordingId', 'recording_id', 'ContentId', 'content_id', 'Id', 'id') ?? '');
  const status = String(pick(raw, 'Status', 'status') ?? 'COMPLETED').toUpperCase() as RecordingStatus;
  return {
    key: `${source}|${provider}|${id}`,
    source,
    provider,
    id,
    title: String(pick(raw, 'Name', 'name', 'Title', 'title') ?? '') || 'Ohne Titel',
    episodeName: pick(raw, 'EpisodeName', 'episode_name'),
    channelName: pick(raw, 'ChannelName', 'channel_name'),
    recordedAt: date(pick(raw, 'RecordingTime', 'recording_time')),
    durationSeconds: num(pick(raw, 'DurationSeconds', 'duration_seconds')),
    plot: pick(raw, 'PlotOutline', 'plot_outline', 'Plot', 'plot', 'Description', 'description'),
    thumbnail: pick(raw, 'ThumbnailUrl', 'thumbnail_url', 'IconPath', 'icon_path', 'LogoUrl', 'logo_url'),
    season: num(pick(raw, 'SeasonNumber', 'season_number')),
    episode: num(pick(raw, 'EpisodeNumber', 'episode_number')),
    status: ['PENDING', 'RECORDING', 'COMPLETED', 'FAILED', 'DELETED'].includes(status) ? status : 'COMPLETED',
    playCount: num(pick(raw, 'PlayCount', 'play_count')) ?? 0,
    lastPlayedPosition: num(pick(raw, 'LastPlayedPosition', 'last_played_position')) ?? 0,
    sizeInBytes: num(pick(raw, 'SizeInBytes', 'size_in_bytes')),
  };
}

export function normalizeTimer(raw: any, provider: string, source: RecordingSource = 'cloud'): TimerItem {
  const clientIndex = num(pick(raw, 'ClientIndex', 'client_index')) ?? 0;
  const attrs = num(pick(raw, 'Attributes', 'attributes')) ?? 0;
  const weekdays = num(pick(raw, 'Weekdays', 'weekdays')) ?? 0;
  return {
    key: `${source}|${provider}|${clientIndex}`,
    source,
    provider,
    clientIndex,
    title: String(pick(raw, 'Title', 'title') ?? '') || 'Ohne Titel',
    state: String(pick(raw, 'State', 'state') ?? 'NEW').toUpperCase(),
    channelName: pick(raw, 'ChannelName', 'channel_name'),
    start: date(pick(raw, 'StartTime', 'start_time')),
    end: date(pick(raw, 'EndTime', 'end_time')),
    weekdays,
    epgSearch: pick(raw, 'EpgSearchString', 'epg_search_string') || undefined,
    epgEventId: str(pick(raw, 'EpgEventId', 'epg_event_id')),
    repeating: weekdays > 0 || (attrs & TA.IS_REPEATING) !== 0,
  };
}

const options = (v: any): IntOption[] =>
  Array.isArray(v)
    ? v.map((o) => ({
        value: Number(pick(o, 'Value', 'value') ?? 0),
        description: String(pick(o, 'Description', 'description') ?? ''),
      }))
    : [];

export function normalizeTimerType(raw: any): TimerTypeInfo {
  return {
    id: num(pick(raw, 'TypeId', 'type_id')) ?? 1,
    attributes: num(pick(raw, 'Attributes', 'attributes')) ?? 0,
    description: String(pick(raw, 'Description', 'description') ?? ''),
    priorityOptions: options(pick(raw, 'PriorityOptions', 'priority_options')),
    priorityDefault: num(pick(raw, 'PriorityDefault', 'priority_default')) ?? 50,
    lifetimeOptions: options(pick(raw, 'LifetimeOptions', 'lifetime_options')),
    lifetimeDefault: num(pick(raw, 'LifetimeDefault', 'lifetime_default')) ?? 0,
  };
}

/**
 * Types usable for "record this EPG event": one-shot, EPG-linked first, manual as fallback.
 * An EPG-based timer is bound to the provider's `epg_event_id`; without one (the EPG row has
 * no event id) the manual start/end types are tried first and EPG-based ones only as last resort.
 */
export function typesForSingleEvent(types: TimerTypeInfo[], hasEventId = true): TimerTypeInfo[] {
  const oneShot = (t: TimerTypeInfo) =>
    !typeHas(t, TA.IS_REPEATING) && !typeHas(t, TA.SUPPORTS_EPG_SEARCH);
  const epg = types.filter((t) => oneShot(t) && typeHas(t, TA.IS_EPG_BASED));
  const manual = types.filter(
    (t) => oneShot(t) && typeHas(t, TA.IS_MANUAL) && typeHas(t, TA.SUPPORTS_START_TIME) && typeHas(t, TA.SUPPORTS_END_TIME)
  );
  if (hasEventId) return epg.length ? epg : manual;
  return manual.length ? manual : epg;
}

/**
 * Finds the timer that belongs to an EPG programme: by provider event id first,
 * otherwise by title + start time (within a minute). Finished/aborted timers are ignored.
 */
export function findTimerForProgram(
  timers: TimerItem[],
  program: { epg_event_id?: string; title?: string; start_time?: string }
): TimerItem | undefined {
  const active = timers.filter((t) => !['COMPLETED', 'ABORTED', 'CANCELLED', 'DISABLED'].includes(t.state));
  const eventId = str(program.epg_event_id);
  if (eventId) {
    const hit = active.find((t) => t.epgEventId === eventId);
    if (hit) return hit;
  }
  const start = program.start_time ? new Date(program.start_time).getTime() : NaN;
  const title = String(program.title ?? '').trim().toLowerCase();
  if (!Number.isFinite(start) || !title) return undefined;
  return active.find(
    (t) =>
      !t.repeating &&
      !!t.start &&
      Math.abs(t.start.getTime() - start) <= 60_000 &&
      t.title.trim().toLowerCase() === title
  );
}

/** Python's datetime.fromisoformat (<3.11) cannot read "Z": send an explicit offset. */
export const toBackendIso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');

export interface TimerDraft {
  type: TimerTypeInfo;
  title: string;
  channelId: string | number;
  channelName?: string;
  start: Date;
  end: Date;
  /** Provider event id (Program.epg_event_id) - what timer create/update/delete are keyed on. */
  epgEventId?: string;
  /** Numeric EPG uid (Program.ultimate_epg_id), only an extra hint for the backend. */
  epgUid?: string | number;
  marginStart: number;
  marginEnd: number;
  priority: number;
  lifetime: number;
}

/** snake_case body for POST /api/timers/<provider>. */
export function buildTimerBody(d: TimerDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: d.title,
    timer_type_id: d.type.id,
    state: 'SCHEDULED',
    channel_name: d.channelName,
    start_time: toBackendIso(d.start),
    end_time: toBackendIso(d.end),
  };
  // The backend's channel uid is an integer; provider channel ids are often strings.
  const uid = num(d.channelId);
  if (uid !== undefined && Number.isInteger(uid)) body.client_channel_uid = uid;
  const eventId = str(d.epgEventId);
  if (eventId) body.epg_event_id = eventId;
  const epgUid = num(d.epgUid);
  if (epgUid !== undefined && Number.isInteger(epgUid)) body.epg_uid = epgUid;
  if (typeHas(d.type, TA.SUPPORTS_PADDING)) {
    body.margin_start = d.marginStart;
    body.margin_end = d.marginEnd;
  }
  if (typeHas(d.type, TA.SUPPORTS_PRIORITIES)) body.priority = d.priority;
  if (typeHas(d.type, TA.SUPPORTS_LIFETIMES)) body.lifetime = d.lifetime;
  return body;
}

export const RECORDING_STATUS_LABEL: Record<RecordingStatus, string> = {
  PENDING: 'Geplant',
  RECORDING: 'Läuft',
  COMPLETED: 'Fertig',
  FAILED: 'Fehlgeschlagen',
  DELETED: 'Gelöscht',
};

export const TIMER_STATE_LABEL: Record<string, string> = {
  NEW: 'Neu',
  SCHEDULED: 'Geplant',
  RECORDING: 'Läuft',
  COMPLETED: 'Fertig',
  ABORTED: 'Abgebrochen',
  CANCELLED: 'Abgebrochen',
  CONFLICT_OK: 'Konflikt',
  CONFLICT_NOK: 'Konflikt',
  ERROR: 'Fehler',
  DISABLED: 'Deaktiviert',
};

export const timerStateTone = (s: string): 'ok' | 'run' | 'bad' | 'idle' =>
  s === 'RECORDING' ? 'run' : s === 'SCHEDULED' || s === 'COMPLETED' ? 'ok' : ['ERROR', 'CONFLICT_NOK', 'CONFLICT_OK'].includes(s) ? 'bad' : 'idle';

const WEEKDAY_BITS: [number, string][] = [
  [0x01, 'Mo'], [0x02, 'Di'], [0x04, 'Mi'], [0x08, 'Do'], [0x10, 'Fr'], [0x20, 'Sa'], [0x40, 'So'],
];
export const weekdayLabel = (mask: number) =>
  WEEKDAY_BITS.filter(([b]) => mask & b).map(([, l]) => l).join(' ');

export function formatSize(bytes?: number): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
