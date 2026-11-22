import { api, getConfig } from '@/lib/api';
import type { DrmInfo } from '@/lib/drm';
import { resolveManifest } from '@/services/manifestService';
import {
  buildTimerBody,
  normalizeRecording,
  normalizeTimer,
  normalizeTimerType,
  type RecordingItem,
  type RecordingSource,
  type TimerDraft,
  type TimerItem,
  type TimerTypeInfo,
} from '@/lib/recordings';

/** Flip to true once the local recordings service exists and /api/local-recordings is wired. */
export const LOCAL_RECORDINGS_ENABLED = false;

export class NotAvailableError extends Error {
  constructor(what = 'Lokale Recordings sind noch nicht verfügbar') {
    super(what);
    this.name = 'NotAvailableError';
  }
}

export interface PlaybackTarget {
  url: string;
  drm: DrmInfo | null;
}

type Opts = { signal?: AbortSignal };

/** One source of recordings (provider cloud today, a local service later). */
export interface RecordingBackend {
  readonly source: RecordingSource;
  readonly label: string;
  list(provider: string, opts?: Opts): Promise<RecordingItem[]>;
  remove(item: RecordingItem): Promise<void>;
  resolvePlayback(item: RecordingItem): Promise<PlaybackTarget>;
  timerTypes(provider: string, opts?: Opts): Promise<TimerTypeInfo[]>;
  timers(provider: string, includeInactive: boolean, opts?: Opts): Promise<TimerItem[]>;
  createTimer(provider: string, draft: TimerDraft): Promise<void>;
  updateTimer(timer: TimerItem, draft: TimerDraft): Promise<void>;
  deleteTimer(timer: TimerItem, force?: boolean): Promise<void>;
}

const seg = encodeURIComponent;
const asList = (data: any, key: string): any[] =>
  Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : [];

export const cloudRecordings: RecordingBackend = {
  source: 'cloud',
  label: 'Cloud',

  async list(provider, opts) {
    const data = await api.get<any>(`/api/recordings/${seg(provider)}`, opts);
    return asList(data, 'recordings')
      .map((r) => normalizeRecording(r, provider))
      .filter((r) => r.id && r.status !== 'DELETED');
  },

  async remove(item) {
    await api.delete(`/api/recordings/${seg(item.provider)}/${seg(item.id)}`);
  },

  /**
   * Like live/catchup: the browser asks the Ultimate Backend directly (public URL),
   * because the DRM header and the stream URLs are meant for the player.
   * DRM recordings play from the unproxied URL (/manifest/url).
   */
  async resolvePlayback(item) {
    const { url, drm } = await resolveManifest('recordings', item.provider, item.id);
    if (!url) throw new Error('Kein Stream für diese Aufnahme verfügbar');
    return { url, drm };
  },

  async timerTypes(provider, opts) {
    const data = await api.get<any>(`/api/timers/${seg(provider)}/types`, opts);
    return asList(data, 'timer_types').map(normalizeTimerType);
  },

  async timers(provider, includeInactive, opts) {
    const data = await api.get<any>(
      `/api/timers/${seg(provider)}${includeInactive ? '?include_inactive=true' : ''}`,
      opts
    );
    return asList(data, 'timers').map((t) => normalizeTimer(t, provider));
  },

  async createTimer(provider, draft) {
    await api.post(`/api/timers/${seg(provider)}`, buildTimerBody(draft));
  },

  /** PUT keeps the timer's clientIndex; the body carries the (possibly new) epg_event_id. */
  async updateTimer(timer, draft) {
    await api.put(`/api/timers/${seg(timer.provider)}/${timer.clientIndex}`, buildTimerBody(draft));
  },

  async deleteTimer(timer, force) {
    // DELETE has no body: the provider event id travels as query parameter.
    const qs = new URLSearchParams();
    if (force) qs.set('force', 'true');
    if (timer.epgEventId) qs.set('epg_event_id', timer.epgEventId);
    const q = qs.toString();
    await api.delete(`/api/timers/${seg(timer.provider)}/${timer.clientIndex}${q ? `?${q}` : ''}`);
  },
};

/** Placeholder until the local service exists: every call says "not available". */
export const localRecordings: RecordingBackend = {
  source: 'local',
  label: 'Lokal',
  list: async () => {
    throw new NotAvailableError();
  },
  remove: async () => {
    throw new NotAvailableError();
  },
  resolvePlayback: async () => {
    throw new NotAvailableError();
  },
  timerTypes: async () => {
    throw new NotAvailableError();
  },
  timers: async () => {
    throw new NotAvailableError();
  },
  createTimer: async () => {
    throw new NotAvailableError();
  },
  updateTimer: async () => {
    throw new NotAvailableError();
  },
  deleteTimer: async () => {
    throw new NotAvailableError();
  },
};

export const recordingBackend = (source: RecordingSource): RecordingBackend =>
  source === 'local' ? localRecordings : cloudRecordings;

export interface RecordingProvider {
  key: string;
  label: string;
}

/** Providers of the Ultimate Backend (same list the EPG tab uses). Empty on failure. */
export async function loadRecordingProviders(): Promise<RecordingProvider[]> {
  try {
    const data = await api.get<any>('/api/mapping/providers');
    const raw: any[] = data?.success ? data.providers?.providers || data.providers || [] : [];
    return raw
      .map((p) => ({
        key: String(p.name ?? p.id ?? ''),
        label: String(p.label || p.name || `Provider ${p.id}`),
      }))
      .filter((p) => p.key);
  } catch {
    return [];
  }
}
