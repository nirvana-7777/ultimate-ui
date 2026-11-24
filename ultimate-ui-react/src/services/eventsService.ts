import { api } from '@/lib/api';
import { normalizeEvent, type EventItem } from '@/lib/events';
import { resolveManifest } from '@/services/manifestService';
import type { PlaybackTarget } from '@/services/recordingsService';

const seg = encodeURIComponent;

/**
 * Events of one provider. The backend answers {provider, events: [...], count};
 * providers without event support answer an empty list.
 */
export async function listEvents(provider: string, opts?: { signal?: AbortSignal }): Promise<EventItem[]> {
  const data = await api.get<any>(`/api/events/${seg(provider)}`, opts);
  const raw: any[] = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
  return raw.map((r) => normalizeEvent(r, provider)).filter((e) => e.id);
}

/**
 * Like live/catchup/recordings: the browser asks the Ultimate Backend directly
 * (.../events/<id>/manifest); DRM events play from the unproxied URL (/manifest/url).
 */
export async function resolveEventPlayback(item: EventItem): Promise<PlaybackTarget> {
  const { url, drm } = await resolveManifest('events', item.provider, item.id);
  if (!url) throw new Error('Kein Stream für dieses Event verfügbar');
  return { url, drm };
}
