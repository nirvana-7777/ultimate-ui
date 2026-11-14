import { api } from '@/lib/api';
import type { Channel, Program } from '@/lib/types';
import { ProgramCache } from './programCache';
import {
  calculateDuration,
  calculateProgress,
  calculateTimeRemaining,
  formatDateTime,
  parseProgramTime,
  isSameDay,
} from '@/lib/time';
import { programKey } from '@/lib/programKey';
import { normalizeCatchup } from '@/lib/catchup';

export interface EPGServiceConfig {
  timezone: string;
  itemsPerPage: number;
  catchupMaxHours: number;
  ultimateBackendPublicUrl: string;
}

export const EPG_SERVICE_DEFAULTS: EPGServiceConfig = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  itemsPerPage: 50,
  catchupMaxHours: 168,
  ultimateBackendPublicUrl: '',
};

export class EPGService {
  cache = new ProgramCache();
  private channelMap = new Map<string, Channel>();
  readonly config: EPGServiceConfig;

  constructor(config: Partial<EPGServiceConfig> = {}) {
    this.config = { ...EPG_SERVICE_DEFAULTS, ...config };
  }

  setConfig(patch: Partial<EPGServiceConfig>) {
    Object.assign(this.config, patch);
  }

  /** Non-critical: the filter just stays empty if this fails. */
  async loadProviders(): Promise<any[]> {
    try {
      const data = await api.get<any>('/api/mapping/providers');
      return data.success ? data.providers?.providers || data.providers || [] : [];
    } catch {
      return [];
    }
  }

  /** Throws on network/HTTP/backend errors. Empty list = "provider has no channels". */
  async loadProviderChannels(providerId: string): Promise<Channel[]> {
    const data = await api.get<any>(`/api/mapping/channels/${providerId}`);
    if (!data?.success) {
      throw new Error(data?.error || 'Provider-Kanäle konnten nicht geladen werden');
    }
    const raw = data.channels?.channels ?? [];
    return raw.map((ch: any) => {
      ch.provider = providerId;
      ch.catchup = normalizeCatchup(ch);
      // IMPORTANT: raw spread FIRST, normalized LAST. Reversing this lets
      // the raw lowercase name/id overwrite the normalized fields, which
      // breaks channelMap lookups (see patch set 2).
      const normalized: Channel = {
        ...ch,
        id: ch.Id ?? ch.id,
        display_name: ch.Name ?? ch.name,
        name: String(ch.Id ?? ch.name),
        icon_url: ch.LogoUrl ?? ch.logo_url,
        streamUrl: ch.StreamUrl ?? ch.stream_url,
        provider: providerId,
        catchup: ch.catchup,
      };
      this.channelMap.set(String(normalized.id), normalized);
      return normalized;
    });
  }

  /** Throws on network/HTTP/backend errors. */
  async fetchChannels(page = 0): Promise<{ channels: Channel[]; hasMore: boolean }> {
    const url = `/api/epg/channels?page=${page}&limit=${this.config.itemsPerPage}`;
    const data = await api.get<any>(url);
    if (!data?.success || !Array.isArray(data.channels)) {
      throw new Error(data?.error || 'Ungültige Antwort vom EPG-Backend');
    }
    data.channels.forEach((c: Channel) => this.channelMap.set(String(c.id), c));
    return {
      channels: data.channels,
      hasMore: data.has_more || data.channels.length === this.config.itemsPerPage,
    };
  }

  /** Throws on network/HTTP errors. Returns [] when the channel has no EPG data. */
  async fetchProgramsForChannel(
    channelId: string | number,
    startDate: Date,
    endDate: Date,
    provider?: string | null,
    opts?: { signal?: AbortSignal; bypassCache?: boolean }
  ): Promise<Program[]> {
    if (!opts?.bypassCache) {
      const cached = this.cache.getPrograms(channelId, startDate, endDate, provider);
      if (cached) return cached;
    }

    let url = `/api/channels/${channelId}/programs?start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
    if (provider) url += `&provider=${encodeURIComponent(provider)}`;
    const data = await api.get<any>(url, { signal: opts?.signal });

    let programs: Program[] = [];
    if (data?.success && Array.isArray(data.programs)) programs = data.programs;
    else if (Array.isArray(data)) programs = data;

    programs.forEach((p) => this.enrichProgram(p, channelId));
    this.cache.setPrograms(channelId, startDate, endDate, provider, programs);
    return programs;
  }

  enrichProgram(program: Program, channelId: string | number): void {
    program.channel_id = channelId;
    program.image_url = program.icon_url;
    program.stream_url = program.stream;
    const start = parseProgramTime(program.start_time);
    const end = parseProgramTime(program.end_time);
    if (start) program.start_time = start.toISOString();
    if (end) program.end_time = end.toISOString();

    program.duration =
      program.duration || calculateDuration(program.start_time, program.end_time);
    program.start_time_local = formatDateTime(program.start_time, 'time', this.config.timezone);
    program.end_time_local = formatDateTime(program.end_time, 'time', this.config.timezone);
    program.date_local = formatDateTime(program.start_time, 'date', this.config.timezone);

    program.episode_formatted = this.parseXmltvNsEpisode((program as any).episode_num);
    this.updateLiveState(program);
  }

  /**
   * Recompute live/past state, progress and badge from the current time.
   * Returns true if anything the UI shows changed.
   */
  updateLiveState(program: Program): boolean {
    const start = parseProgramTime(program.start_time);
    const end = parseProgramTime(program.end_time);
    if (!start || !end) return false;

    const now = new Date();
    const wasLive = !!program.is_live;
    const wasPast = !!program.is_past;
    const prevBadge = program.time_badge?.type;

    program.is_live = start <= now && end >= now;
    program.is_past = end < now;

    if (program.is_live) {
      program.progress =
        calculateProgress(program.start_time, program.end_time) ?? undefined;
      program.time_remaining = calculateTimeRemaining(program.end_time);
    } else {
      program.progress = undefined;
      program.time_remaining = undefined;
    }

    program.time_badge = this.getSmartTimeBadge(program.start_time, program.end_time);

    return (
      wasLive !== program.is_live ||
      wasPast !== program.is_past ||
      prevBadge !== program.time_badge?.type
    );
  }

  getSmartTimeBadge(startTime: string, endTime: string): Program['time_badge'] {
    const now = new Date();
    const start = parseProgramTime(startTime);
    const end = parseProgramTime(endTime);
    if (!start || !end) {
      return { type: 'future', text: '', timeRange: '', class: 'time-badge future' };
    }
    const isToday = isSameDay(now, start);
    const isTomorrow = isSameDay(new Date(now.getTime() + 86400000), start);
    const isYesterday = isSameDay(new Date(now.getTime() - 86400000), start);
    const isCurrentlyAiring = start <= now && end >= now;
    const t = (s: string | Date) => formatDateTime(s, 'time', this.config.timezone);
    const sd = (s: string | Date) => formatDateTime(s, 'short-date', this.config.timezone);

    if (isCurrentlyAiring) {
      return {
        type: 'live',
        text: 'LIVE',
        timeRange: `${t(startTime)} - ${t(endTime)}`,
        class: 'time-badge live',
      };
    }
    if (isToday) {
      return {
        type: 'today',
        text: `${t(startTime)} - ${t(endTime)}`,
        timeRange: '',
        class: 'time-badge today',
      };
    }
    if (isTomorrow) {
      return {
        type: 'tomorrow',
        text: `Morgen ${t(startTime)} - ${t(endTime)}`,
        timeRange: '',
        class: 'time-badge tomorrow',
      };
    }
    if (isYesterday) {
      return {
        type: 'yesterday',
        text: `Gestern ${t(startTime)} - ${t(endTime)}`,
        timeRange: '',
        class: 'time-badge yesterday',
      };
    }
    if (start < now) {
      return {
        type: 'past',
        text: `${sd(startTime)} ${t(startTime)} - ${t(endTime)}`,
        timeRange: '',
        class: 'time-badge past',
      };
    }
    return {
      type: 'future',
      text: `${sd(startTime)} ${t(startTime)} - ${t(endTime)}`,
      timeRange: '',
      class: 'time-badge future',
    };
  }

  async loadDailyProgramsForChannel(
    channelId: string | number,
    date: Date,
    opts?: { signal?: AbortSignal }
  ): Promise<Program[]> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const now = new Date();
    if (endDate.getTime() <= now.getTime()) {
      const channel = this.getChannel(channelId);
      const allowedHours = channel?.catchup?.enabled ? channel.catchup.hours : 0;
      if ((now.getTime() - endDate.getTime()) / 3600000 > allowedHours) {
        return [];
      }
    }

    const provider = this.getChannel(channelId)?.provider || null;
    const programs = await this.fetchProgramsForChannel(
      channelId,
      startDate,
      endDate,
      provider,
      { signal: opts?.signal }
    );
    this.cache.setDailyPrograms(channelId, startDate, programs);
    return programs;
  }

  getChannel(channelId: string | number): Channel | undefined {
    return this.channelMap.get(String(channelId));
  }

  getProgram(channelId: string | number, programKeyStr: string): Program | null {
    return this.cache.findProgram(channelId, programKeyStr, (p) =>
      programKey(channelId, p)
    );
  }

  async buildCatchupStreamUrl(
    channel: Channel,
    program: Program
  ): Promise<string | null> {
    if (!channel?.catchup?.enabled) return null;
    const start = parseProgramTime(program.start_time);
    const end = parseProgramTime(program.end_time);
    if (!start || !end) return null;
    const now = new Date();
    if (end >= now) return null;
    const ageHours = (now.getTime() - start.getTime()) / 3600000;
    if (ageHours > (channel.catchup.hours || 0)) return null;

    const base = this.config.ultimateBackendPublicUrl;
    if (!base || !channel.provider) return null;

    let manifest = this.cache.getManifest(channel.provider, channel.id);
    if (!manifest) {
      try {
        const resp = await fetch(
          `${base}/api/providers/${encodeURIComponent(
            channel.provider
          )}/channels/${encodeURIComponent(String(channel.id))}/manifest`,
          { credentials: 'omit' }
        );
        if (!resp.ok) return null;
        manifest = await resp.json();
        this.cache.setManifest(channel.provider, channel.id, manifest);
      } catch {
        return null;
      }
    }
    const template = manifest.catchup_stream_url_template;
    if (!template) return null;
    return template
      .replace('{start_time}', String(Math.floor(start.getTime() / 1000)))
      .replace('{end_time}', String(Math.floor(end.getTime() / 1000)));
  }

  private parseXmltvNsEpisode(episodeNum: any): string | null {
    if (!episodeNum || typeof episodeNum !== 'string') return null;
    const s = episodeNum.trim().replace(/\.$/, '');
    const parts = s.split('.');
    if (parts.length < 2 || parts[0] === '' || parts[1] === '') return null;
    const season = parseInt(parts[0], 10);
    const episode = parseInt(parts[1], 10);
    if (isNaN(season) || isNaN(episode) || season < 0 || episode < 0) return null;
    const displaySeason = season + 1;
    const displayEpisode = episode + 1;
    if (season === 0) return `S01E${String(displayEpisode).padStart(2, '0')}`;
    return `S${String(displaySeason).padStart(2, '0')}E${String(displayEpisode).padStart(2, '0')}`;
  }
}
