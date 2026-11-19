import { api } from '@/lib/api';
import { normalizeStatus, pageOf } from '@/lib/vod';
import type { VodEpisode, VodItem, VodPage, VodStatus } from '@/lib/vod';

export interface MovieQuery {
  provider?: string | null;
  includePriced: boolean;
  q?: string;
  limit: number;
  offset: number;
}

function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const vodService = {
  async status(signal?: AbortSignal): Promise<VodStatus> {
    return normalizeStatus(await api.get<any>('/api/vod/status', { signal }));
  },

  async movies(p: MovieQuery, signal?: AbortSignal): Promise<VodPage<VodItem>> {
    const data = await api.get<any>(
      `/api/vod/movies${qs({
        provider: p.provider,
        include_priced: p.includePriced,
        q: p.q?.trim(),
        limit: p.limit,
        offset: p.offset,
      })}`,
      { signal }
    );
    return pageOf(data, 'movie');
  },

  async shows(provider?: string | null, signal?: AbortSignal): Promise<VodPage<VodItem>> {
    const data = await api.get<any>(`/api/vod/shows${qs({ provider })}`, { signal });
    return pageOf(data, 'show');
  },

  async episodes(
    showId: string,
    p: { provider?: string | null; includePriced: boolean; limit?: number; offset?: number },
    signal?: AbortSignal
  ): Promise<VodPage<VodEpisode>> {
    const data = await api.get<any>(
      `/api/vod/shows/${encodeURIComponent(showId)}/episodes${qs({
        provider: p.provider,
        include_priced: p.includePriced,
        limit: p.limit ?? 1000,
        offset: p.offset ?? 0,
      })}`,
      { signal }
    );
    return pageOf(data, 'episode');
  },

  sync(provider?: string | null) {
    return api.post<any>('/api/vod/sync', provider ? { provider } : {});
  },
};
